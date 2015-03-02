var log = require('./log');
var Quote = require('./quote');
var _ = require('lodash');

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
  var dateToken = parseDate(lines[lines.length - 1]);
  if (dateToken) {
    quote.date = dateToken.date;
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
  // First look at name
  var state = parseName(task.name);
  if (state.error) {
    log.debugId(task, 'Invalid quote: ' + state.error);
    return false;
  }

  state = parseNotes(task.notes, state);
  if (state.error) {
    log.debugId(task, 'Invalid quote: ' + state.error);
    return false;
  }

  if (state.spokenLines.length === 0) {
    log.debugId(task, 'Invalid quote: could not find any valid spoken lines');
    return false;
  }

  // Copy state into quote
  quote.lines = state.spokenLines;
  quote.date = state.date !== undefined ?
      state.date : new Date(Date.parse(task.created_at));
  quote.context = state.context;
  quote.status = Quote.Status.VALID;

  // Compute set of speakers
  state.spokenLines.forEach(function(line) {
    var speaker = line.speaker;
    if (!_.findWhere(quote.speakers, speaker)) {
      quote.speakers.push(speaker);
    }
  });

  return true;
}


var DATE_FORMATS = [
  [/^unknown\b/i, function(match, line) {
    return {
      date: null,
      next: line.substr(match.index + match[0].length)
    };
  }],
  [/^\d\d\d\d-\d\d(-\d\d)?(\s|$)/, function(match, line) {
    // Parsing assumes a time zone if there's extra whitespace!
    return {
      date: new Date(Date.parse(match[0].trim())),
      next: line.substr(match.index + match[0].length)
    };
  }]
];


/**
 * @param {String} line Trimmed line
 * @returns {Object|null}
 *     {Date|null} date Date found from parsing, or null if specifically no date
 *     {String} next Remainder of line without date
 */
function parseDate(line) {
  var result = null;
  DATE_FORMATS.forEach(function(rule) {
    var match = rule[0].exec(line);
    if (!result && match && match.index === 0) {
      result = rule[1](match, line);
    }
  });
  return result;
}

var SPOKEN_LINE_FORMATS = [
  // With quotes
  [/^([^:"]+):\s*"(.*?)"(\s|$)/, function(match, line) {
    return {
      speaker: match[1],
      line: match[2],
      next: line.substr(match.index + match[0].length - match[3].length)
    };
  }],
  // Without quotes
  [/^([^:"]+):\s*(.*?)(:|$)/, function(match, line) {
    return {
      speaker: match[1],
      line: match[2],
      next: line.substr(match.index + match[0].length - match[3].length)
    };
  }]
];

/**
 * @param {String} line Trimmed line
 * @returns {Object|null}
 *     {String} speaker Name of speaker
 *     {String} line Line spoken
 *     {String} next Remainder of line without date
 */

function parseSpokenLine(line) {
  if (line === '') {
    return null;
  }
  var matches = SPOKEN_LINE_FORMATS.map(function(rule) {
    var match = line.match(rule[0]);
    return match ? rule[1](match, line) : null;
  }).filter(function(match) {
    return match;
  });
  return matches[0] || null;
}

/**
 * @param {String} name
 * @returns {Object} Info
 *     {Date|null|undefined} date
 *     {Object[]} spokenLines
 *     {String|null} error
 */
function parseName(name) {
  var state = {
    date: undefined,
    spokenLines: [],
    error: null
  };

  // First, search for a date.
  var remaining = name.trim();
  var dateToken = parseDate(remaining);
  if (dateToken) {
    state.date = dateToken.date;
    remaining = dateToken.next.trim();
  }

  // Now look for spoken lines.
  while (remaining !== '') {
    var spokenLineToken = parseSpokenLine(remaining);
    if (spokenLineToken !== null) {
      state.spokenLines.push({
        speaker: spokenLineToken.speaker,
        line: spokenLineToken.line
      });
      remaining = spokenLineToken.next.trim();
    } else {
      // There was garbage here. If some lines preceded it, this is a problem.
      // Otherwise just finish.
      if (state.spokenLines.length > 0) {
        state.error = 'Found extra stuff after spoken line in task name';
      }
      break;
    }
  }
  return state;
}


/**
 * @param {String} notes
 * @param {Object} state from `parseName`
 * @returns {Object|null} Null if definitely invalid, otherwise the info
 *     {Date|null|undefined} date
 *     {Object[]} spokenLines
 *     {String|null} context
 *     {String|null} error Description of problem encountered when parsing
 */
function parseNotes(notes, state) {
  var ignoring = false;
  state.context = null;

  // Examine each (trimmed) line
  var rawLines = notes.split('\n');
  rawLines.forEach(function(rawLine) {
    if (ignoring || state.error) {
      return;
    }
    var trimmedLine = rawLine.trim();

    if (trimmedLine === '') {
      // Ignore whitespace
      return;
    }

    if (trimmedLine.indexOf('--') === 0) {
      // Ignore everything from here on
      ignoring = true;
      return;
    }

    // First see if it's a date
    var dateToken = parseDate(trimmedLine);
    if (dateToken) {
      state.date = dateToken.date;
      // Ignore rest of line
      return;
    }

    // Now see if it's a spoken line.
    var spokenLineToken = parseSpokenLine(trimmedLine);
    if (spokenLineToken) {
      if (spokenLineToken.next.trim() !== '') {
        // Junk after the line?
        state.error =
            'Found extra stuff at the end of a spoken line in task notes';
        return;
      }
      state.spokenLines.push({
        speaker: spokenLineToken.speaker,
        line: spokenLineToken.line
      });
      return;
    }

    // This may be context, if we haven't added some already
    if (state.context !== null) {
      state.error =
          'Found multiple lines of context in task notes, only one supported.';
      return;
    }
    state.context = trimmedLine;
  });

  return state;
}


function cleanLine(line) {
  return line
      .replace(/\s+/g, ' ')
    // TODO: transform single and double quotes to smart quotes
//      .replace(/'/g, "&#146;")
      .trim();
}

module.exports = {
  parse: parse,
  parseDate: parseDate,
  parseSpokenLine: parseSpokenLine
};