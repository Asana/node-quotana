var log = require('./log');
var Quote = require('./quote');
var _ = require('lodash');

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
  [/unknown/i, function(matches) {
    return null;
  }],
  [/\d\d\d\d-\d\d(-\d\d)?/, function(matches) {
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
  quote.status = Quote.Status.VALID;
  quote.date = new Date(task.created_at);

  // If there's a date as the last line of the notes, pull it out and use it
  // as the date.
  var notes = task.notes.trim();
  var lines = notes.split('\n');
  var date = parseDate(lines[lines.length - 1]);
  if (date !== undefined) {
    quote.date = date;
    notes = lines.slice(0, lines.length - 1).join('\n');
  }

  quote.lines = [{
    speaker: task.name,
    line: cleanLine(notes)
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

  spokenLines.forEach(function(line) {
    var speaker = line.speaker;
    if (!_.findWhere(quote.speakers, speaker)) {
      quote.speakers.push(speaker);
    }
  });
  return true;
}

/**
 * @param rawLine {String}
 * @returns {Date|null|undefined}
 */
function parseDate(rawLine) {
  var date;
  DATE_FORMATS.forEach(function(rule) {
    var match = rawLine.match(rule[0]);
    if (match) {
      date = rule[1](match);
      if (typeof(date) === 'number') {
        date = new Date(date);
      }
      return false;
    }
  });
  return date;
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

function cleanLine(line) {
  return line
      .replace(/\s+/g, ' ')
    // TODO: transform single and double quotes to smart quotes
//      .replace(/'/g, "&#146;")
      .trim();
}

module.exports = {
  parse: parse
};