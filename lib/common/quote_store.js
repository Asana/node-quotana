var Bluebird = require('bluebird');
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
  if (quote.status !== Quote.Status.VALID) {
    // If quote hasn't already been parsed/stored, parse it now
    // (but don't store it back).
    parser.parse(task, quote, this.options.type);
  }
  return quote;
};

QuoteStore.prototype.load = function() {
  var me = this;
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
      me.quotesInOrder.push(quote);
      me.quotesById[quote.id] = quote;
    });
    stream.on('end', function() {
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