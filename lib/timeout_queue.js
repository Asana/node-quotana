

function TimeoutQueue(delayMs) {
  this.delayMs = delayMs;
  this.queue = {};
  this.waiters = {};
}

TimeoutQueue.prototype.enqueue = function(id, func) {
  var me = this;
  var record = me.queue[id];
  if (record) {
    clearTimeout(record.timeout);
  } else {
    record = { func: func };
    me.queue[id] = record;
  }
  setTimeout(function() {
    me._process(id, record);
  }, me.delayMs);
};

TimeoutQueue.prototype._process = function(id, record) {
  var me = this;

  // Remove from the queue
  delete me.queue[id];

  // We're still processing this one; just indicate we're waiting and bail.
  if (me.waiters[id]) {
    me.waiters[id]++;
    return;
  }

  // Indicate we are working on it / provide a way to express waiting.
  me.waiters[id] = 0;
  record.func().then(function() {
    if (me.waiters[id] > 0) {
      delete me.waiters[id];
      me._process(id, record);
    } else {
      delete me.waiters[id];
    }
  });

};

module.exports = TimeoutQueue;
