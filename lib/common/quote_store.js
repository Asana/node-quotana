var Bluebird = require('bluebird');
var util = require('util');
var Quote = require('./quote');
var parser = require('./parser');
var log = require('./log');

function QuoteStore(client, options) {
  this.client = client;
  this.options = options;
  this.options.type = this.options.type || Quote.Type.SIMPLE;
  this.options.source = this.options.source || 'default';
  this.quotesInOrder = [];
  this.quotesById = {};
}

QuoteStore.prototype.quoteFromTask = function(task) {
  var quote = Quote.fromTask(task);
  quote.id = task.id;
  quote.type = this.options.type;
  quote.source = this.options.source;
  quote.projectId = this.options.id;
  if (quote.status !== Quote.Status.VALID) {
    // If quote hasn't already been parsed/stored, parse it now
    // (but don't store it back in Asana).
    parser.parse(task, quote, this.options.type);
  }
  return quote;
};

QuoteStore.prototype.load = function() {
  var me = this;
  var numQuotesLoaded = 0;
  return new Bluebird(function(resolve, reject) {
    var stream = me.client.stream(
        me.client.tasks.findByProject(me.options.id, {
          opt_fields: Quote.TASK_FIELDS.join(',')
        }));
    stream.on('data', function(quoteTask) {
      // This is a workaround for the API not honoring options through
      // pagination
      // TODO: remove this when API fixed
      if (quoteTask.assignee === undefined) {
        log.debug('Task does not contain complete data', quoteTask);
        return;
      }
      var quote = me.quoteFromTask(quoteTask);
      if (++numQuotesLoaded % 50 === 0) {
        log.debug(
            util.format(
                'Project %d: loaded %d quotes',
                me.options.id, numQuotesLoaded));
      }
      me.quotesInOrder.push(quote);
      me.quotesById[quote.id] = quote;
    });
    stream.on('end', function() {
      log.debug(
          util.format(
              'Project %d: finished loading %d quotes',
              me.options.id, numQuotesLoaded));
      resolve(me.quotesInOrder);
    });
    stream.on('error', function(error) {
      reject(error);
    });
  });
};

QuoteStore.prototype.quote = function(index) {
  if (index === undefined) {
    index = Math.floor(Math.rand() * this.quotes.length);
  }
  return this.quotes[index];
};

module.exports = QuoteStore;
