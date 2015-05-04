var Bluebird = require('bluebird');
var util = require('util');
var escapeHtml = require('escape-html');
var Quote = require('../common/quote');
var QuoteVisitor = require('../common/quote_visitor');
var log = require('../common/log');
var parser = require('../common/parser');
var properties = require('../common/properties');
var hashParams = require('./hash_params');

// Imports assumed by the app
//var Asana = require('asana');
//var config = require('config');

var MIN_QUOTES_LOADED_TO_DISPLAY = 100;

function centerElement(e) {
  return e.css({
    left: ($(window).width() - e.outerWidth()) / 2,
    top: ($(window).height() - e.outerHeight()) / 2
  });
}

function App(options) {
  var me = this;
  // Create a client.
  me.client = Asana.Client.create({
    clientId: options.clientId,
    redirectUri: options.redirectUri
  });

  me.options = options;
  me.options.quoteMinCycleTime = options.quoteMinCycleTime || 9000;
  me.options.quoteCycleTimePerChar = options.quoteCycleTimePerChar || 50;

  // Configure the way we want to use Oauth. Popup flow is not a default
  // so we must indicate specifically we want that type of flow.
  me.client.useOauth({
    flowType: Asana.auth.PopupFlow
  });

  me.visitor = new QuoteVisitor(me.client, {
    config: options,
    visit: me._visitQuote.bind(me)
  });

  // @type {Object} Map from quote ID to Quote, all quotes we've ever seen.
  me.quotesById = {};

  // @type {Quote[]} All quotes to display, in order they came in.
  me.filteredQuotes = [];

  // @type {Quote[]} All quotes to display, in shuffled order.
  me.shuffledQuotes = [];

  // @type {Quote[]} Quotes that have just recently come in
  me.timelyQuotes = [];

  me.doneLoading = false;
  me._uiShowing = false;
  me.numQuotesLoaded = 0;

  me.shuffledQuoteIndex = 0;
  me.currentQuote = null;

  // @type {Object} Parameters, stored in hash
  //     source {String} Sources of quotes to filter to
  me.parameters = {};
  hashParams.listen(function(parameters) {
    me.parameters = parameters;
    me.reset();
  });
}

App.prototype._visitQuote = function(task, project) {
  var me = this;

  // We always get the full task record from which to make the quote.
  var quote = me._quoteFromTask(task, project);

  // If the quote is newly updated and found after we're done loading,
  // make it timely so we display it soon.
  var oldQuote = me.quotesById[task.id];
  var isNew = false;
  if (quote.status === Quote.Status.VALID) {
    if (!oldQuote || oldQuote.hash !== quote.hash) {
      isNew = true;
      if (!me.doneLoading) {
        if (++me.numQuotesLoaded % 50 === 0) {
          log.debug(util.format('Loaded %d valid quotes', me.numQuotesLoaded));
        }
      }
    }
  }

  me.quotesById[task.id] = quote;

  if (isNew) {
    me._onNewQuote(quote);
  }
};

App.prototype._onNewQuote = function(quote) {
  var me = this;
  if (me._filterQuote(quote)) {
    me.filteredQuotes.push(quote);
    if (me.doneLoading) {
      // If we're already loaded, then we've shuffled all the quotes and this is
      // a newly modified quote. Enqueue it to show right away.
      me.timelyQuotes.push(quote);
    } else if (!me._uiShowing &&
        me.filteredQuotes.length >= MIN_QUOTES_LOADED_TO_DISPLAY) {
      // If UI isn't showing but we now have enough quotes, start it up!
      me._startUi();
    }
  }
};

/**
 * We have enough quotes loaded to show, start the UI!
 */
App.prototype._startUi = function() {
  var me = this;
  me._uiShowing = true;
  me.ui().html('<div class="quotana-quote"></div>');
  me.reset();
  me.cycleQuotes();
};

App.prototype._quoteFromTask = function(task, project) {
  // Assumes full task record
  var quote = Quote.fromTask(task);
  quote.type = project.type || Quote.Type.SIMPLE;
  quote.source = project.source || 'default';
  quote.projectId = project.id;
  quote.hash = properties.computeHash(task);
  if (quote.status !== Quote.Status.VALID) {
    // If quote hasn't already been parsed/stored, parse it now
    // (but don't store it back in Asana).
    parser.parse(task, quote, quote.type);
  }
  return quote;
};

App.prototype.ui = function() {
  return $('#' + this.options.containerId);
};

App.prototype.start = function() {
  var me = this;

  // Setup UI
  me.ui().addClass('quotana-ui');
  centerElement($('.quotana-loading'));
  $('#control_edit_quote').click(function() {
    me.navigateToQuote();
    return false;
  });
  $('#control_view_customer').click(function() {
    me.parameters.source = 'customer';
    hashParams.update(me.parameters);
    return false;
  });
  $('#control_view_humor').click(function() {
    me.parameters.source = 'asana';
    hashParams.update(me.parameters);
    return false;
  });
  $('#control_view_all').click(function() {
    delete me.parameters.source;
    hashParams.update(me.parameters);
    return false;
  });

  // Load quotes
  me.client.authorize().then(function() {
    // As soon as we've loaded all quotes, or a minimum number, start
    // showing UI.
    var promises = me.visitor.start();
    Bluebird.all(promises).then(function() {
      log.debug('All quotes loaded!');
      me.doneLoading = true;
      if (!me.uiStarted) {
        me._startUi();
      } else {
        me.reset();
      }
    }).catch(function(err) {
      me.ui().html('<div class="quotana-error">&#128575;</div>');
      centerElement($('.quotana-error'));
      throw err;
    });
  });
};


App.prototype._filterQuote = function(quote) {
  var me = this;
  return quote.status === Quote.Status.VALID &&
      (!me.parameters.source ||
          quote.source === me.parameters.source);
};


App.prototype.reset = function() {
  var me = this;

  // Apply current source filter to quotes
  var allQuotes = Object.keys(me.quotesById).map(function(id) {
    return me.quotesById[id];
  });
  me.filteredQuotes = allQuotes.filter(me._filterQuote.bind(me));

  // Shuffle and start cycling
  me.shuffledQuotes = me.filteredQuotes.sort(function() {
    return Math.round(Math.random()) - 0.5;
  });
  me.shuffledQuoteIndex = 0;

  // Resume cycling if we already were
  if (me.cycleTimeout) {
    me.cycleQuotes();
  }
};

App.prototype.navigateToQuote = function() {
  var me = this;
  if (me.currentQuote) {
    window.open('https://app.asana.com/0/' + me.currentQuote.projectId +
        '/' + me.currentQuote.id);
  }
};

App.prototype.chooseNextQuote = function() {
  var me = this;

  // Prefer timely quotes if any are queued.
  var quote;
  if (me.timelyQuotes.length > 0) {
    quote = me.timelyQuotes.splice(0, 1)[0];
  } else {
    quote = me.shuffledQuotes[me.shuffledQuoteIndex];
    me.shuffledQuoteIndex =
        (me.shuffledQuoteIndex + 1) % me.shuffledQuotes.length;
  }
  return quote;
};

App.prototype.cycleQuotes = function() {
  var me = this;
  var quote = me.chooseNextQuote();
  me.swapQuote(quote);

  var quoteLength = 0;
  quote.lines.forEach(function(line) {
    quoteLength += line.line.length;
  });
  var cycleTime = me.options.quoteMinCycleTime +
      me.options.quoteCycleTimePerChar * quoteLength;
  if (me.cycleTimeout) {
    clearTimeout(me.cycleTimeout);
  }
  me.cycleTimeout = setTimeout(function() {
    me.cycleTimeout = null;
    me.cycleQuotes();
  }, cycleTime);
};


App.prototype.swapQuote = function(newQuote) {
  var me = this;
  log.debug('showing quote', newQuote);

  function formatSpeakers(speakers) {
    return speakers.map(escapeHtml).join(' and ');
  }

  function formatDate(date) {
    if (date === null) {
      return '';
    }
    return util.format(
        '%d-%d-%d',
        date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  var quoteElement = $('.quotana-quote');
  var html = '<p class="quotana-content">';
  newQuote.lines.forEach(function(line, index) {
    if (index > 0) {
      html += '<br/>';
    }
    if (newQuote.lines.length > 1) {
      html += '<span class="quotana-content-speaker">' + escapeHtml(line.speaker) + '</span>';
    }
    html += '<span class="quotana-content-line">' + escapeHtml(line.line) + '<span>';
  });
  html += '</p>';
  html += '<p class="quotana-byline"><span class="quotana-byline-speakers">';
  html += formatSpeakers(newQuote.speakers);
  html += '</span><span class="quotana-byline-date">';
  html += formatDate(newQuote.date);
  html += '</span></p>';
  html += '<p class="quotana-context">';
  if (newQuote.context) {
    html += newQuote.context;
  }
  html += '</p>';

  quoteElement.fadeOut(1000, function() {
    me.currentQuote = newQuote;
    quoteElement.html(html);
    quoteElement.get(0).className = '';
    quoteElement.addClass('quotana-quote');
    quoteElement.addClass('quotana-type-' + newQuote.type);
    quoteElement.addClass('quotana-source-' + newQuote.source);
    quoteElement.css({
      left: ($(window).width() - quoteElement.outerWidth()) / 2,
      top: ($(window).height() - quoteElement.outerHeight()) / 2
    }).fadeIn(1000);
  });

};

module.exports = App;
