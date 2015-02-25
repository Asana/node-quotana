var crypto = require('crypto');
var Bluebird = require('bluebird');
var util = require('util');

var Asana = require('asana');
var Quote = require('../common/quote');
var QuoteStore = require('../common/quote_store');
var config = require('../common/config');
var parser = require('../common/parser');
var TimeoutQueue = require('./timeout_queue.js');
var log = require('../common/log.js');
var Locker = require('./locker.js');
var _ = require('lodash');

// sooner
// TODO: handle failures to contact the API
// TODO: productionize - use secrets, load on beta

// later
// TODO: refactor
// TODO: tests!

// Load configuration. Allow some sensitive parameters to be specified in
// the environment as opposed to a config file.
config(process.env.QUOTANA_CONFIG);
if (process.env.ASANA_REFRESH_TOKEN) {
  config.refreshToken = process.env.ASANA_REFRESH_TOKEN;
}
if (process.env.ASANA_CLIENT_SECRET) {
  config.clientSecret = process.env.ASANA_CLIENT_SECRET;
}
var client = Asana.Client.create(config);

var taskLocker = new Locker();

function authorize() {
  if (config.refreshToken) {
    // Configuring with a refresh token will auto-refresh the access token.
    client.useOauth({ credentials: { refresh_token: config.refreshToken }});
    return Bluebird.resolve();
  } else {
    client.useOauth();
      //xcxc We need:
      // 1) multiple redirect URI support
    return client.authorize().then(function() {
      console.log(
          'ASANA_REFRESH_TOKEN=' + client.dispatcher.authenticator.credentials);
      throw new Error('Configure with refresh token above and run again');
    });
  }
}


function start() {
  authorize().then(function() {
    config.projects.forEach(function(project) {
      client.events.stream(project.id)
          .on('data', function(event) {
            onProjectEvent(event, project);
          });
      client.stream(
          client.tasks.findByProject(project.id, {
            opt_fields: 'external,assignee'
          }))
          .on('data', function(task) {
            onTaskLoaded(task, project);
          });
    });
  });
}

var queue = new TimeoutQueue(config.quietPeriodMs);

function randomChoice(choices) {
  return choices[_.random(choices.length - 1)];
}

function helpComment() {
  return randomChoice([
    'Looping in some help.',
    'Tell you what, I\'m gonna escalate this to help you out.',
    'cc\'ing someone who may be able to help.',
    'Let\'s get another set of eyes on this.'
  ]);
}

function rejectionComment(numFailures) {
  var choices;
  if (numFailures <= 1) {
    choices = [
      'Sorry, I can\'t quite understand your quote. Can you put it in a form I can read? I like:\n\n' +
          '<CODE><STRONG>username1:</STRONG> I said this!</CODE>\n' +
          '<CODE><STRONG>username2:</STRONG> Then I said this.</CODE>\n' +
          '<CODE><STRONG>context:</STRONG></CODE> <EM>(optional) as if completing the sentence "This was overheard ..." (ex.: during TGIF)</EM>\n' +
          '<EM>Put a date like </EM><CODE>YYYY-MM-DD</CODE><EM> on its own line and I will assume that is the date occurred, or else I\'ll assume the task was created the same day.</EM>'
    ];
  } else if (numFailures === 2) {
    choices = [
      'Hmm, did you read my last comment? I apologize if the ' +
          'formatting is confusing. Please give it another shot.',
      'Huh? Sorry, sometimes things get lost in translation between human ' +
          'and unicorn. Please try again?',
      'This is kinda awkward, but .. yeah, I\'m totally spacing on this one. ' +
          'Can you ensure what you wrote is in the proper format?'
    ];
  } else if (numFailures >= 3) {
    choices = [
      'I know, it\'s frustrating for me too, but I just still don\'t understand ' +
          'your quote. Please double-check the formatting.',
      'Ok, maybe it\'s not you, it\'s me? I dunno, keep trying?',
      'I didn\'t think this was that hard, but maybe I\'m wrong. Are you ' +
          'sure you\'re following the instructions above?',
      'Wow, what a pain in the butt this must be for you. ' +
          'I still don\'t get it.',
      'Forget work about work, I\'m making work about fun. Sorry.'
    ];
  }
  var text = randomChoice(choices);
  if (numFailures >= config.failuresUntilAdminFollow) {
    text += '\n\n' + helpComment();
  }
  return text;
}


/**
 * @param id {Number}
 * @returns {Promise<Object>} A task record, annotated with a `_quote` field
 *     which points to the quote associated with it.
 */
function getTask(id) {
  return client.tasks.findById(id, { opt_fields: Quote.TASK_FIELDS.join(',') }).then(
      function(task) {
        log.debugId(id, 'Retrieved task', task);
        task._quote = Quote.fromTask(task);
        return task;
      });
}

function onProjectEvent(event, project) {
  if (event.type === 'task' &&
      (event.action === 'changed' || event.action === 'added')) {
    var id = event.resource.id;
    if (taskLocker.tryLock(id)) {
      getTask(id).then(function(task) {
        if (task.assignee && task.assignee.id === config.moderatorId) {
          // Task has been directly assigned to us, attempt to parse it.
          return examineQuoteAndUpdateTask(task, project);
        } else {
          // Move quote to queue to process.
          return enqueueQuote(id, project);
        }
      }).finally(function() {
        taskLocker.unlock(id);
      });
    } else {
      log.debugId(id, 'task locked, not handling event');
    }
  }
}

/**
 * React to a notification that a task has been modified in some way.
 * @param task {Object} Task with at least `external` and `assignee`.
 */
function onTaskLoaded(task, project) {

  function getFullTaskAndExamine() {
    if (taskLocker.tryLock(task.id)) {
      getTask(task.id).then(function(fullTask) {
        return examineQuoteAndUpdateTask(fullTask, project);
      }).finally(function() {
        taskLocker.unlock(task.id);
      });
    } else {
      log.debugId(task, 'task locked, not handling load');
    }
  }

  if (!task.external || !task.external.data) {
    return getFullTaskAndExamine();
  }
  var quote = new Quote(task.id);
  quote.fromJson(task.external.data);
  // Task has been directly assigned to us, or when we last visited it we
  // marked it modified and were waiting to examine it. Examine it now!
  if (task.assignee && task.assignee.id === config.moderatorId ||
      quote.status === Quote.Status.MODIFIED) {
    return getFullTaskAndExamine();
  }

  log.debugId(task, 'loaded task, no work necessary');
}

/**
 * Hash the inputs we use to parse the quote so we know if it changed.
 * @param {Object} task
 * @returns {string}
 */
function hashQuoteInputs(task) {
  return crypto.createHash('md5')
      .update('name:' + task.name)
      .update('notes:' + task.notes)
      .digest('hex');
}


function examineQuoteAndUpdateTask(task, project) {
  var quote = task._quote;
  var isValid = parser.parse(task, quote, project.type);
  if (isValid) {
    return markQuoteComplete(task);
  } else {
    return markQuoteInvalid(task, rejectionComment(quote.numFailures)).then(
        function() {
          if (quote.numFailures >= config.failuresUntilAdminFollow) {
            return client.tasks.addFollowers(task.id, {
              followers: [config.administratorId]
            });
          }
        });
  }
}


function markQuoteInvalid(task, rejectionHtml) {
  log.debugId(task, 'quote is invalid, commenting');
  var quote = task._quote;
  quote.status = Quote.Status.INVALID;
  quote.hash = hashQuoteInputs(task);
  quote.numFailures = (quote.numFailures || 0) + 1;
  var fields = {
    completed: false,
    external: {
      data: quote.toJson()
    }
  };
  if (quote.owner && quote.owner !== config.moderatorId) {
    fields.assignee = quote.owner;
  }
  return client.tasks.update(task.id, fields).then(function() {
    return client.stories.createOnTask(task.id, {
      html_text: rejectionHtml
    });
  });
}

function markQuoteComplete(task) {
  log.debugId(task, 'quote is valid, marking complete');
  var quote = task._quote;
  quote.status = Quote.Status.FINAL;
  quote.hash = hashQuoteInputs(task);
  quote.numFailures = 0;
  return client.tasks.update(task.id, {
    assignee: null,
    completed: true,
    external: {
      data: quote.toJson()
    }
  });
  // TODO: heart or add comment
}

/**
 * Put the task on the queue to process once modification quiesces
 * @param id
 */
function enqueueQuote(id, project) {
  log.debugId(id, 'Enqueing quote to examine later');
  queue.enqueue(id, function() {
    log.debugId(id, 'Picking up task from queue since quiet');
    return getTask(id).then(function(task) {
      var hash = hashQuoteInputs(task);
      if (hash === task._quote.hash) {
        log.debugId(task, 'Task has not changed, ignoring');
      } else {
        log.debugId(task, 'Task has updated since we last looked, examining');
        return examineQuoteAndUpdateTask(task, project);
      }
    });
  });
}

start();
