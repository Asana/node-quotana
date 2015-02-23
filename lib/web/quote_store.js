var Bluebird = require('bluebird');
var Quote = require('../common/quote');

function QuoteStore(client, options) {
  this.client = client;
  this.options = options;
  this.options.type = this.options.type || Quote.Type.SIMPLE;
  this.options.source = this.options.source || 'default';
  this.quotes = [];
}

QuoteStore.prototype.load = function() {
  var me = this;
  return new Bluebird(function(resolve, reject) {
    var stream = me.client.stream(
        me.client.tasks.findByProject(me.options.id, {
          opt_fields: 'name,notes,created_by,created_at,external'
        }));
    stream.on('data', function(quote) {
      me.quotes.push(me._parseQuote(quote));
    });
    stream.on('end', function() {
      resolve(me.quotes);
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

QuoteStore.prototype._parseQuote = function(task) {
  // TODO: support multiple-speaker quotes based on `type`
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

QuoteStore.prototype._cleanLine = function(line) {
  return line
      .replace(/\n/g, ' ')
      .replace(/'/g, "&#146;")
      .trim();
};

module.exports = QuoteStore;
