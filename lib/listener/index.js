#!/usr/bin/env node
// vi: ft=javascript

var crypto = require('crypto');
var Bluebird = require('bluebird');
var util = require('util');
var _ = require('lodash');

var Asana = require('asana');
var Quote = require('../common/quote');
var QuoteVisitor = require('../common/quote_visitor');
var config = require('../common/config');
var parser = require('../common/parser');
var properties = require('../common/properties');
var log = require('../common/log.js');

var DEFAULT_MAX_QUOTE_LENGTH = 350;

// TODO: tests!

// Load configuration. Allow some sensitive parameters to be specified in
// the environment as opposed to a config file.

function mergeRequiredConfig(envName, configName) {
  if (process.env[envName]) {
    config[configName] = process.env[envName];
  } else if (config[configName] === undefined) {
    console.log(
        util.format(
            'Error: must specify %s in config file or %s in env',
            configName, envName));
    process.exit(1);
  }
}

if (process.env.QUOTANA_CONFIG === undefined) {
  console.log('Error: must specify config file with env QUOTANA_CONFIG');
  process.exit(1);
}
config(process.env.QUOTANA_CONFIG);

mergeRequiredConfig('ASANA_REFRESH_TOKEN', 'refreshToken');
mergeRequiredConfig('ASANA_CLIENT_SECRET', 'clientSecret');

var client = Asana.Client.create(config);

var visitor = new QuoteVisitor(client, {
  config: config,
  visit: function(task, project) {
    return visitQuote(task, project).catch(function(e) {
      console.log(e.stack, e.value);
      throw e;
    });
  },
  taskProperties: ['external,assignee']
});

/**
 * Set up the app with credentials so it can begin accessing Asana.
 * @returns {Promise} Resolves when authorized.
 */
function authorize() {
  if (config.refreshToken) {
    // Configuring with a refresh token will auto-refresh the access token.
    client.useOauth({ credentials: { refresh_token: config.refreshToken }});
    return Bluebird.resolve();
  } else {
    client.useOauth();
    return client.authorize().then(function() {
      console.log(
          'ASANA_REFRESH_TOKEN=' + client.dispatcher.authenticator.credentials);
      throw new Error('Configure with refresh token above and run again');
    });
  }
}

/**
 * Start the app. Load the existing quotes and listen for changes/additions.
 * Creates asynchronous processes that run.
 */
function start() {
  authorize().then(function() {
    visitor.start();
  });
}

/**
 * @param choices {Array}
 * @returns {*} A randomly chosen element from `choices`.
 */
function randomChoice(choices) {
  return choices[_.random(choices.length - 1)];
}

/**
 * @returns {String} A comment appropriate for when a quote is too long.
 */
function thanksButLongComment(overage) {
  return randomChoice([
    'Thanks for the quote! Just a heads up, this one is really long and ' +
        'it\'s not going to look great on display. Can you pare it down ' +
        'a little?',
    'Nice! Keep in mind that quotes are best when they\'re short, and this ' +
        'one is long and will probably look janky. Maybe cut it down to ' +
        'just the essential part?',
    'Sweet quote, but it\'s a bit much for the dashboard. Can you reduce it ' +
        'so it will fit better?'
  ]);
}

/**
 * @returns {String} A comment appropriate for successful submission.
 */
function thanksComment() {
  return randomChoice([
    'Thanks!',
    'Good stuff.',
    'Nice.',
    'Love it!',
    'Great - keep \'em coming!',
    'Super.'
  ]);
}

/**
 * @returns {String} A comment appropriate for when the admin is added
 *     for help.
 */
function adminHelpComment() {
  return randomChoice([
    'Looping in some help.',
    'Tell you what, I\'m gonna escalate this to help you out.',
    'cc\'ing someone who may be able to help.',
    'Let\'s get another set of eyes on this.'
  ]);
}

/**
 * @param {String} type The type of quote being parsed
 * @param {Number} numPreviousFailures Number of times the quote has been
 *     unsuccessfully edited / attempted before this failure.
 * @returns {String} A comment appropriate for rejecting the quote.
 */
function rejectionComment(type, numPreviousFailures) {
  var choices;
  if (numPreviousFailures <= 0) {
    var helpUrl = 'http://github.com/Asana/node-quotana#' + (
        (type === 'simple') ? 'simple-quotes' : 'multi-speaker-quotes');
    choices = [
      'Thanks for the quote! I\'m sorry, I can\'t quite understand it. ' +
          'Can you put it in a form I can read? See ' + helpUrl +
          ' for details. If you don\'t put it in the proper format then I ' +
          'can\'t display it correctly.',
      'Hey, I bet your quote is awesome, but I can\'t read it which means it ' +
          'won\'t get onto the dashboard. Would you mind putting it in a ' +
          'format I can understand? See ' + helpUrl + ' for details.',
      'I know I sound pretty weak for a unicorn, but I can\'t read this ' +
          'quote you just published. And if I can\'t read it then I can\'t ' +
          'put it on the dashboard where it belongs. Would you mind making ' +
          'it more readable for me? See ' + helpUrl + ' for help.',
      'So, about this quote .. um, how do I say this .. yeah I just can\'t ' +
          'read it. Perhaps you could massage it into a different form? ' +
          'See ' + helpUrl + ' for what I\'m talking about.'
    ];
  } else if (numPreviousFailures === 1) {
    choices = [
      'Hmm, did you read my last comment? I apologize if the ' +
          'formatting is confusing. Please give it another shot.',
      'Huh? Sorry, sometimes things get lost in translation between Human ' +
          'and Unicorn. Please try again?',
      'This is kinda awkward, but .. yeah, I\'m totally spacing on this one. ' +
          'Can you ensure what you wrote is in the proper format?',
      'I know, Unicorn is a tricky language, not everyone gets it right on ' +
          'the first try. Give it another go?'
    ];
  } else if (numPreviousFailures >= 2) {
    choices = [
      'I know, it\'s frustrating for me too, but I just still can\'t parse ' +
          'your quote. Please double-check the formatting.',
      'Ok, maybe it\'s not you, it\'s me? I dunno, keep trying?',
      'I didn\'t think this was that hard, but maybe I\'m wrong. Are you ' +
          'sure you\'re following the instructions above?',
      'Wow, what a pain in the butt this must be for you. ' +
          'I still don\'t get it.',
      'Duh, sorry, still not getting it. Maybe they should call me ' +
          'Quotidonkey instead? Seriously though please try again.',
      'Forget work about work, I\'m making work about fun. Sorry, ' +
          'one more time?'
    ];
  }
  var text = randomChoice(choices);
  if (numPreviousFailures >= config.failuresUntilAdminFollow) {
    text += '\n\n' + adminHelpComment();
  }
  return text;
}


/**
 * Visit a quote.
 *
 * @param task {Object} Task, maybe only partially loaded record.
 * @param project {Object} Configuration for the quote project the task is in.
 * @return {Promise}
 */
function visitQuote(task, project) {
  // If we have a full record, just go ahead and examine it.
  if (task.notes !== undefined) {
    return examineQuote(task, project);
  }

  // Partial record and no external data yet. Fetch the whole thing to process.
  if (!task.external || !task.external.data) {
    return visitor.getFullTaskAndVisit(task.id, project);
  }

  // We have external data. Let's see whether the quote bears examination.
  var quote = new Quote(task.id);
  quote.fromJson(task.external.data);
  // Task has been directly assigned to us, or when we last visited it we
  // marked it modified and were waiting to examine it. Examine it now!
  if (task.assignee && task.assignee.id === config.moderatorId ||
      quote.status === Quote.Status.MODIFIED) {
    return visitor.getFullTaskAndVisit(task.id, project);
  }

  log.debugId(task, 'visited task, no work necessary');
  return Bluebird.resolve();
}

/**
 * Examine a quote and take action on it.
 *
 * @param task {Object} Task, fully loaded record.
 * @param project {Object} Configuration for the quote project the task is in.
 */
function examineQuote(task, project) {
  var quote = task._quote;
  var isValid = parser.parse(task, quote, project.type);
  if (isValid) {
    return markQuoteValid(task, project);
  } else {
    var numFailures = (quote.numFailures || 0);
    return markQuoteInvalid(
        task, project, rejectionComment(project.type, numFailures)).then(
        function() {
          if (quote.numFailures >= config.failuresUntilAdminFollow) {
            return client.tasks.addFollowers(task.id, {
              followers: [config.administratorId]
            });
          }
        });
  }
}

/**
 * Mark a quote as invalid, updating the task so that the author knows they
 * need to fix it.
 *
 * @param task {Object} Task, fully loaded record.
 * @param project {Object} Configuration for the quote project the task is in.
 * @param rejectionHtml {String} Message to send to author.
 */
function markQuoteInvalid(task, project, rejectionHtml) {
  log.debugId(task, 'quote is invalid, commenting');
  var quote = task._quote;
  quote.status = Quote.Status.INVALID;
  quote.hash = properties.computeHash(task);
  quote.numFailures = (quote.numFailures || 0) + 1;
  var fields = {
    external: {
      data: quote.toJson()
    }
  };
  if (config.statusProperty !== undefined) {
    fields.custom_fields = {};
    fields.custom_fields[config.statusProperty.id] =
        config.statusProperty.needsEditing;
  }
  if (config.assignOnInvalid &&
      quote.owner && quote.owner !== config.moderatorId) {
    fields.assignee = quote.owner;
  } else if (task.assignee && task.assignee.id === config.moderatorId) {
    fields.assignee = null;
  }

  var promise = client.tasks.update(task.id, fields);
  return config.commentOnInvalid ? promise.then(function() {
    return client.stories.createOnTask(task.id, {
      html_text: rejectionHtml
    });
  }) : promise;
}

/**
 * Mark a quote as valid, updating the task so that it can be picked up and
 * displayed by the web app.
 *
 * @param task {Object} Task, fully loaded record.
 * @param project {Object} Configuration for the quote project the task is in.
 */
function markQuoteValid(task, project) {
  log.debugId(task, 'quote is valid');
  var quote = task._quote;
  quote.status = Quote.Status.FINAL;
  quote.hash = properties.computeHash(task);
  quote.numFailures = 0;
  var fields = {
    assignee: null,
    external: {
      data: quote.toJson()
    }
  };
  if (config.statusProperty !== undefined) {
    fields.custom_fields = {};
    fields.custom_fields[config.statusProperty.id] =
        config.statusProperty.accepted;
  }
  var promise = client.tasks.update(task.id, fields);
  return config.commentOnValid ? promise.then(function() {
    var totalChars = quote.lines.reduce(
        function(acc, next) {
          return acc + next.line.length;
        }, 0);
    var overLength = totalChars -
        (project.maxQuoteLength || DEFAULT_MAX_QUOTE_LENGTH);
    if (overLength > 0) {
      return client.stories.createOnTask(task.id, {
        html_text: thanksButLongComment(overLength)
      });
    } else {
      return client.stories.createOnTask(task.id, {
        html_text: thanksComment()
      });
    }
  }) : promise;
}

start();
