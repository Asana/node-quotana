var Bluebird = require('bluebird');
var Quote = require('./quote');
var parser = require('./parser');

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
  quote.type = this.options.type;
  quote.source = this.options.source;
  if (quote.status !== Quote.Status.VALID) {
    // If quote hasn't already been parsed/stored, parse it now
    // (but don't store it back).
    parser.parse(task, quote, this.options.type);
  }
};

QuoteStore.prototype.load = function() {
  var me = this;
  return new Bluebird(function(resolve, reject) {
    var stream = me.client.stream(
        me.client.tasks.findByProject(me.options.id, {
          opt_fields: Quote.TASK_FIELDS.join(',')
        }));
    stream.on('data', function(quoteTask) {
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

QuoteStore.prototype._parseSimpleQuote = function(task) {
  var quote = new Quote(task.id);
  quote.type = this.options.type;
  quote.source = this.options.source;
  quote.owner = task.created_by;
  quote.status = Quote.Status.VALID;
  quote.date = new Date(task.created_at);
  quote.lines = [{
    speaker: task.name,
    line: this._cleanLine(task.notes)
  }];
  quote.speakers = [task.name];
  return quote;
};

QuoteStore.prototype._parseMultiSpeakerQuote = function(task) {
  var quote = new Quote(task.id);
  if (task.external && task.external.data) {
    quote.fromJson(task.external.data);
  } else {
    quote.type = this.options.type;
    quote.source = this.options.source;
    quote.owner = task.created_by;
    quote.status = Quote.Status.MODIFIED;
    quote.date = new Date(task.created_at);
  }
  return quote;
};

QuoteStore.prototype._cleanLine = function(line) {
  return line
      .replace(/\n/g, ' ')
      .replace(/'/g, "&#146;")
      .trim();
};


module.exports = QuoteStore;
