
function Quote(id) {
  this.task = id;
  this.owner = null;
  this.status = Quote.Status.MODIFIED;
  this.hash = null;
  this.date = null;
  this.lines = [];
  this.context = null;
  this.moderated = false;
  this.type = 'default';
}

Quote._properties = [
  'task', 'owner', 'status', 'hash', 'date', 'lines', 'moderated', 'context'
];

Quote.Type = {
  SIMPLE: 'simple'
};

Quote.Status = {
  // We recognize the quote has been modified recently, and we are waiting
  // to take action on it.
  MODIFIED: "modified",
  // Quote has been parsed and is invalid.
  INVALID: "invalid",
  // Quote has been validated. If modified, could be reparsed.
  VALID: "valid"
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
