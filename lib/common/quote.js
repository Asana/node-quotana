
function Quote(id) {
  this.id = id;
  this.owner = null;
  this.status = Quote.Status.MODIFIED;
  this.hash = null;
  this.date = null;
  this.lines = [];
  this.context = null;
  this.moderated = false;
  this.numFailures = 0;
}

// Fields we must read from the task in order to make up a quote.
Quote.TASK_FIELDS = [
  'name', 'notes', 'followers', 'assignee', 'external', 'completed',
  'completed_at', 'modified_at', 'created_at'
];

Quote._properties = [
  'id', 'task', 'owner', 'status', 'hash', 'date', 'lines', 'moderated',
  'context', 'numFailures'
];

Quote.Type = {
  // Simple quote: name = author, notes = full quote, verbatim
  SIMPLE: 'simple',
  // Multi-speaker quote
  MULTI: 'multi'
};

Quote.Status = {
  // We recognize the quote has been modified recently, and we are waiting
  // to take action on it.
  MODIFIED: 'modified',
  // Quote has been parsed and is invalid.
  INVALID: 'invalid',
  // Quote has been validated. If modified, could be reparsed.
  VALID: 'valid'
};

/**
 * @param {Object} task
 * @returns {Quote} The existing or new quote based on the task basics.
 *     For new quotes, the quote details will not be filled in from the task,
 *     it should be parsed / examined separately.
 */
Quote.fromTask = function(task) {
  var quote = new Quote(task.id);
  if (task.external && task.external.data) {
    quote.fromJson(task.external.data);
  } else {
    quote.status = Quote.Status.MODIFIED;
    if (task.followers) {
      var first_follower = task.followers[0];
      quote.owner = first_follower ? first_follower.id : null;
    }
  }
  return quote;
};

Quote.prototype.toJson = function() {
  var me = this;
  var obj = {};
  Quote._properties.forEach(function(key) {
    obj[key] = me[key];
  });
  return JSON.stringify(obj);
};

Quote.prototype.fromJson = function(json) {
  var me = this;
  var obj = JSON.parse(json);
  Quote._properties.forEach(function(key) {
    me[key] = obj[key];
  });
};

module.exports = Quote;
