var asana = require('asana');
var fs = require('fs');
var http = require('http');
var url = require('url');
var util = require('util');
var crypto = require('crypto');
var request = require('request');
var BPromise = require('bluebird');

var TaskListener = require('./lib/task_listener.js');
var TimeoutQueue = require('./lib/timeout_queue.js');
var Quote = require('./lib/quote.js');

/**
 * Important features used:
 *   - If this doesn't win, I'm throwing Asana a party.
 *
 * @type {string}
 */

var REJECTION_COMMENT =
  'Sorry, I can\'t quite understand your quote. Can you put it in a form I can read? I like:\n\n' +
    '<CODE><STRONG>username1:</STRONG> I said this!</CODE>\n' +
    '<CODE><STRONG>username2:</STRONG> Then I said this.</CODE>\n' +
    '<CODE><STRONG>context:</STRONG></CODE> <EM>(optional) as if completing the sentence "This was overheard ..." (ex.: during TGIF)</EM>\n' +
    '<EM>Put a date like </EM><CODE>YYYY-MM-DD</CODE><EM> on its own line and I will assume that is the date occurred, or else I\'ll assume the task was created the same day.</EM>'

var TASK_FIELDS = [
  'name', 'notes', 'followers', 'assignee', 'external', 'completed', 'completed_at',
  'modified_at', 'created_at'
];

var LINE_FORMATS = [
  // Colon separates speaker and line, quotes optional
  [/^([^:"]+):\s*"?(.*?)"?$/, function(matches) {
    return {
      speaker: matches[1],
      line: matches[2]
    };
  }],

  // No colon, just quotes
  [/^([^"]+)\s*"(.*?)"$/, function(matches) {
    return {
      speaker: matches[1],
      line: matches[2]
    };
  }]

];

var DATE_FORMATS = [
  [/\d\d\d\d-\d\d-\d\d/, function(matches) {
    return Date.parse(matches[0]);
  }]
];

/**
 * When a quote has not been modified for some period, or when it is assigned
 * to the moderator, it gets processed.
 */

var SAND_OPTIONS = {
  projectId: 1303,
  clientId: 67108918,
  moderatorId: 20764546327859,
  clientSecret: '9bc3ca6c288c446cedb2da302a9e59ed',
  refreshToken: '0/3994b404ac6da05898bec7b49f866134',
  pollIntervalMs: 3 * 1000,
  quietPeriodMs: 5 * 1000
};

var PROD_OPTIONS = {
  //projectId: 10106509426394,  // actual quotes project
  projectId: 20747454565305,  // quotes sandbox
  clientId: 20775305011453,
  moderatorId: 20764546327859,
  clientSecret: 'e1e99fc07ad2dfbb09bad459ff57b3ed',
  refreshToken: 'xcxc',
  pollIntervalMs: 5 * 1000,
  quietPeriodMs: 5 * 60 * 1000
};

//xcxc for sand
asana.Dispatcher.ROOT_URL = 'https://localhost.asana.com:8180/api/1.0';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;


var options = SAND_OPTIONS;

var client;
var queue = new TimeoutQueue(options.quietPeriodMs);

function slog() {
  console.log.apply(console, arguments);
}

//xcxc move to node client
function refreshAccessToken(refreshToken) {
  return new BPromise(function(resolve, reject) {
    var params = {
      method: 'POST',
      url: 'https://localhost.asana.com:8180/-/oauth_token',
      form: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: options.clientId,
        client_secret: options.clientSecret
      }
    };
    request(params, function(err, res, payload) {
      if (err) {
        return reject(err);
      }
      var json = null;
      try {
        json = JSON.parse(payload);
      } catch (e) {
        return reject(e);
      }
      if (json.error) {
        return reject(json.error);
      }

      return resolve(json.access_token);
    });
  });

}


function getTask(id) {
  return client.tasks.findById(id, { opt_fields: TASK_FIELDS.join(",") }).then(
      function(task) {
        slog("Retrieved task", id, task);
        var quote = new Quote(id);
        if (task.external && task.external.data) {
          quote.fromJson(task.external.data);
        } else {
          var first_follower = task.followers[0];
          quote.owner = first_follower ? first_follower.id : null;
        }
        task._quote = quote;
        return task;
      });
}

function onProjectEvents(events) {
  console.log("got events", events);
  return BPromise.all(events.map(onProjectEvent));
}

function onProjectEvent(event) {
  if (event.type === 'task' &&
      (event.action === 'changed' || event.action === 'added')) {
    return onTaskModified(event.resource.id);
  } else {
    return BPromise.resolve();
  }
}

/**
 * React to a notification that a task has been modified in some way.
 * @param id
 */
function onTaskModified(id) {
  return getTask(id).then(function(task) {
    if (task.assignee && task.assignee.id === options.moderator_id) {
      // Task has been directly assigned to us, attempt to parse it.
      return parseQuoteAndUpdateTask(task);
    } else {
      // Move quote to queue to process.
      return enqueueQuote(id);
    }
  });
}


/**
 * Hash the inputs we use to parse the quote so we know if it changed.
 * @param task
 * @returns {string}
 */
function hashQuoteInputs(task) {
  return crypto.createHash('md5')
      .update('name:' + task.name)
      .update('notes:' + task.notes)
      .digest('hex');
}


function markQuoteInvalid(task) {
  var quote = task._quote;
  quote.status = Quote.Status.INVALID;
  quote.hash = hashQuoteInputs(task);
  var fields = {
    completed: false,
    external: {
      data: quote.toJson()
    }
  };
  if (quote.owner && quote.owner !== options.moderatorId) {
    fields.assignee = quote.owner;
  }
  return client.tasks.update(task.id, fields).then(function() {
    client.stories.createOnTask(task.id, {
      html_text: REJECTION_COMMENT
    });
  });
}

function markQuoteComplete(task) {
  var quote = task._quote;
  quote.status = Quote.Status.FINAL;
  quote.hash = hashQuoteInputs(task);
  return client.tasks.update(task.id, {
    assignee: null,
    completed: true,
    external: {
      data: quote.toJson()
    }
  });
}

function parseDate(rawLine) {
  var ms = Date.parse(rawLine.trim());
  return isNaN(ms) ? null : ms;
}

function parseContext(rawLine) {
  var match = rawLine.match(/^context:\s*(.*)$/);
  return match ? match[1] : null;
}

function parseSpokenLine(rawLine) {
  rawLine = rawLine.trim();
  if (rawLine === '') {
    return null;
  }
  var matches = LINE_FORMATS.map(function(rule) {
    var match = rawLine.match(rule[0]);
    return match ? rule[1](match) : null;
  }).filter(function(match) {
    return match;
  });
  return matches[0] || null;
}

/**
 * Try to parse the quote and update the task according to what parsed.
 * @param task
 */
function parseQuoteAndUpdateTask(task) {

  slog("Examining quote", task);

  var context = null;
  var spokenLines = [];
  var date = null;
  var badLines = [];
  var rawLines = task.notes.split('\n');
  rawLines.forEach(function(rawLine) {
    var spokenLine = parseSpokenLine(rawLine);
    if (spokenLine) {
      spokenLines.push(spokenLine);
      return;
    } else if (date === null && (date = parseDate(rawLine))) {
      return;
    } else if (context === null && (context = parseContext(rawLine))) {
      return;
    } else {
      badLines.push(rawLine);
    }
  });

  if (badLines.length > 0) {
    slog("Invalid quote, found bad lines", badLines);
    return markQuoteInvalid(task);
  }
  if (spokenLines.length === 0) {
    //xcxc If no lines in notes, try name of task.
  }
  if (spokenLines.length === 0) {
    slog("Invalid quote, found no spoken lines");
    return markQuoteInvalid(task);
  }

  var quote = task._quote;
  quote.lines = spokenLines;
  quote.date = date || Date.parse(task.created_at);
  quote.context = context;

  slog("Got valid quote!", quote);

  return markQuoteComplete(task);
}

/**
 * Put the task on the queue to process once modification quiesces
 * @param task
 */
function enqueueQuote(id) {
  slog("Enqueing quote to examine later", id);
  queue.enqueue(id, function() {
    slog("Picking up task from queue since quiet", id);
    return getTask(id).then(function(task) {
      var hash = hashQuoteInputs(task);
      if (hash === task._quote.hash) {
        slog("Task has not changed, ignoring");
      } else {
        slog("Task has updated since we last looked, examining");
        return parseQuoteAndUpdateTask(task);
      }
    });
  });
}

function run() {
  refreshAccessToken(options.refreshToken).then(function(accessToken) {
    client = asana.Client.oauth(accessToken);
    var listener = new TaskListener(client, options.projectId);
    listener.poll(onProjectEvents, options.pollIntervalMs);

    http.createServer(function(req, res) {
      var requestUrl = url.parse(req.url);
      if (requestUrl.pathname.indexOf('/quotes.json') === 0) {
        client.tasks.findAll({
          project: options.projectId,
          completed: '1980-01-01T00:00:00Z00:00',
          opt_fields: 'external'
        }).then(function(tasks) {
          res.write("QUOTES = ");
          res.write(JSON.stringify(
              tasks.map(function(task) {
                return JSON.parse(task.external.data);
              })));
          res.end();
        });
      } else {
        var html = fs.readFileSync("/Users/asana/Dropbox/Asana-shared/quotes/quotes-new.html");
        res.write(html);
        res.end();
      }
    }).listen(5678);
  });
}

run();


module.exports = {
  run: run
};
