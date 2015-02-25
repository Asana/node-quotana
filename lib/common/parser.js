var log = require('./log');
var Quote = require('./quote');

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

function parse(task, quote, type) {
  if (type === Quote.Type.SIMPLE) {
    return parseSimple(task, quote);
  } else if (type === Quote.Type.MULTI) {
    return parseMulti(task, quote);
  } else {
    log.debug('Unknown quote type', type);
    return false;
  }
}

function parseSimple(task, quote) {
  quote.owner = task.created_by;
  quote.status = Quote.Status.VALID;
  quote.date = new Date(task.created_at);
  quote.lines = [{
    speaker: task.name,
    line: _cleanLine(task.notes)
  }];
  quote.speakers = [task.name];
  return true;
}

function parseMulti(task, quote) {
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
    log.debugId(task, 'Invalid quote, found bad lines');
    return false;
  }
  if (spokenLines.length === 0) {
    //xcxc If no lines in notes, try name of task.
  }
  if (spokenLines.length === 0) {
    log.debugId(task, 'Invalid quote, no spoken lines');
    return false;
  }

  quote.lines = spokenLines;
  quote.date = date || Date.parse(task.created_at);
  quote.context = context;

  return true;
}


function parseDate(rawLine) {
  var ms = Date.parse(rawLine.trim());
  return isNaN(ms) ? null : ms;
}

function parseContext(rawLine) {
  var match = rawLine.match(/^context:\s*(.*)$/i);
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

module.exports = {
  parse: parse
};