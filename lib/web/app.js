var Bluebird = require('bluebird');
var util = require('util');
var escapeHtml = require('escape-html');
var Quote = require('../common/quote');
var QuoteStore = require('../common/quote_store');
var log = require('../common/log');
var hashParams = require('./hash_params');

// Imports assumed by the app
//var Asana = require('asana');
//var config = require('config');

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

  me.quoteStores = options.projects.map(function(project) {
    return new QuoteStore(me.client, project);
  });

  // @type {Quote[]} All known valid quotes.
  me.allQuotes = [];

  // @type {Quote[]} All quotes to display, in shuffled order.
  me.shuffledQuotes = [];

  // @type {Quote[]} Quotes that have just recently come in
  me.timelyQuotes = [];

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
    // The client is authorized! Load quotes.
    var promises = me.quoteStores.map(function(store) {
      return store.load();
    });
    Bluebird.all(promises).then(function(quoteGroups) {
      me.ui().html('<div class="quotana-quote"></div>');
      var allQuotes = [];
      allQuotes = allQuotes.concat.apply(allQuotes, quoteGroups);
      var validQuotes = allQuotes.filter(function(quote) {
        return quote.status === Quote.Status.VALID;
      });
      me.allQuotes = validQuotes;
      log.debug(util.format('All quotes loaded (%d valid)', validQuotes.length));
      me.reset();
      me.cycleQuotes();
    }).catch(function(err) {
      me.ui().html('<div class="quotana-error">&#128575;</div>');
      centerElement($('.quotana-error'));
      throw err;
    });
  });
};


App.prototype.reset = function() {
  var me = this;

  // Apply current source filter to quotes
  var filteredQuotes = me.parameters.source ?
      me.allQuotes.filter(function(quote) {
        return quote.source === me.parameters.source;
      }) :
      me.allQuotes;

  // Shuffle and start cycling
  me.shuffledQuotes = filteredQuotes.sort(function() {
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

  // Prefer timely quotes over untimely ones
  var quote = me.shuffledQuotes[me.shuffledQuoteIndex];
  me.shuffledQuoteIndex = (me.shuffledQuoteIndex + 1) % me.shuffledQuotes.length;
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
