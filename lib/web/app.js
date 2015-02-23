//var Asana = require('asana');
var Bluebird = require('bluebird');
var util = require('util');
var escapeHtml = require('escape-html');
var Quote = require('../common/quote');
var QuoteStore = require('./quote_store');

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

  me.shuffledQuotes = [];
  me.quoteIndex = 0;
}

App.prototype.ui = function() {
  return $('#' + this.options.containerId);
};

App.prototype.start = function() {
  var me = this;
  me.ui().addClass('quotana-ui').html('<div class="quotana-loading"></div>');
  me.client.authorize().then(function() {
    // The client is authorized! Load quotes.
    var promises = me.quoteStores.map(function(store) {
      return store.load();
    });
    Bluebird.all(promises).then(function(quoteGroups) {
      me.ui().html('<div class="quotana-quote"></div>');
      var allQuotes = [];
      allQuotes = allQuotes.concat.apply(allQuotes, quoteGroups);
      me.shuffledQuotes = allQuotes.sort(function() {
        return Math.round(Math.random()) - 0.5;
      });
      me.quoteIndex = 0;
      me.cycleQuotes();
    });
//  }).catch(function(err) {
//    me.ui().html('Error: ' + err);
  });
};

App.prototype.cycleQuotes = function() {
  var me = this;
  var quote = me.shuffledQuotes[me.quoteIndex];
  me.swapQuote(quote);

  var quoteLength = 0;
  quote.lines.forEach(function(line) {
    quoteLength += line.line.length;
  });
  var cycleTime = me.options.quoteMinCycleTime +
      me.options.quoteCycleTimePerChar * quoteLength;
  setTimeout(function() {
    me.quoteIndex = (me.quoteIndex + 1) % me.shuffledQuotes.length;
    me.cycleQuotes();
  }, cycleTime);
};


App.prototype.swapQuote = function(newQuote) {

  function formatSpeakers(speakers) {
    return speakers.map(escapeHtml).join(' and ');
  }

  function formatDate(date) {
    if (date === null) {
      return '';
    }
    return util.format(
        '%d.%d.%d',
            date.getMonth() + 1, date.getDate(), date.getFullYear());
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
    quoteElement.html(html);
    quoteElement.css({
      left: ($(window).width() - quoteElement.outerWidth()) / 2,
      top: ($(window).height() - quoteElement.outerHeight()) / 2
    }).fadeIn(1000);
  });

};

module.exports = App;
