var Bluebird = require('bluebird');
var util = require('util');
var _ = require('lodash');

var Asana = require('asana');
var Quote = require('../common/quote');
var QuoteStore = require('../common/quote_store');
var parser = require('../common/parser');
var properties = require('../common/properties');
var log = require('../common/log.js');
var Locker = require('./locker.js');
var TimeoutQueue = require('./timeout_queue.js');

/**
 * @param client {Asana.Client}
 * @param options {Object}
 * @option {Object} config
 * @option {Function} visit
 * @option {String[]} [taskProperties]
 * @constructor
 */
function QuoteVisitor(client, options) {
  var me = this;
  me.client = client;
  me.options = options;
  me.config = options.config;
  // We "lock" tasks so we don't do multiple simultaneous operations on them.
  me.locker = new Locker();
  // When we hear about a change on a task, we put it in a queue to deal with
  // when the changes have quiesced.
  me.queue = new TimeoutQueue(me.config.quietPeriodMs);
  me.visit = function() {
    return me.options.visit.apply(null, arguments);
  };
}

/**
 * @returns {Promise[]} A promise for each project.
 */
QuoteVisitor.prototype.start = function() {
  var me = this;
  return me.config.projects.map(function(project) {
    me.client.events.stream(project.id)
        .on('data', function(event) {
          me._onProjectEvent(event, project);
        });
    return new Bluebird(function(resolve, reject) {
      return me.client.stream(
          me.client.tasks.findByProject(project.id, {
            opt_fields: (me.options.taskProperties ||
                Quote.TASK_FIELDS).join(',')
          }))
          .on('data', function(task) {
            me.visit(task, project);
          })
          .on('end', function() {
            resolve();
          })
          .on('error', function(error) {
            reject(error);
          });
    });
  });
};

/**
 * @param id {Number}
 * @returns {Promise<Object>} A task record, annotated with a `_quote` field
 *     which points to the quote associated with it.
 */
QuoteVisitor.prototype.getFullTask = function(id) {
  return this.client.tasks.findById(id, { opt_fields: Quote.TASK_FIELDS.join(',') }).then(
      function(task) {
        log.debugId(id, 'Retrieved task', task);
        task._quote = Quote.fromTask(task);
        return task;
      });
};


QuoteVisitor.prototype.getFullTaskAndVisit = function(id, project) {
  var me = this;
  if (me.locker.tryLock(id)) {
    return me.getFullTask(id).then(function(fullTask) {
      return me.visit(fullTask, project);
    }).finally(function() {
      me.locker.unlock(id);
    });
  } else {
    log.debugId(id, 'task locked, not visiting');
    return Bluebird.resolve();
  }
};


/**
 * React to a notification that a task in a project has been modified in
 * some way.
 *
 * @param event {Object} Task with at least `external` and `assignee`.
 * @param project {Object} Configuration for the quote project the task is in.
 */
QuoteVisitor.prototype._onProjectEvent = function(event, project) {
  var me = this;
  if (event.type === 'task' &&
      (event.action === 'changed' || event.action === 'added')) {
    var id = event.resource.id;
    if (me.locker.tryLock(id)) {
      me.getFullTask(id).then(function(task) {
        if (task.parent !== null) {
          // Skip all subtasks
          return undefined;
        } else if (me._markedForReview(task)) {
          // Task has been explicitly marked for review, visit it.
          return me.visit(task, project);
        } else {
          // Move quote to queue to process.
          return me._enqueueQuote(id, project);
        }
      }).finally(function() {
        me.locker.unlock(id);
      });
    } else {
      log.debugId(id, 'task locked, not handling event');
    }
  }
};


/**
 * Put the task on the queue to process once modification quiesces.
 * @param {Number} id ID of the task
 * @param project {Object} Configuration for the quote project the task is in.
 */
QuoteVisitor.prototype._enqueueQuote = function(id, project) {
  var me = this;
  log.debugId(id, 'Enqueing quote to examine later');
  me.queue.enqueue(id, function() {
    log.debugId(id, 'Picking up task from queue since quiet');
    return me.getFullTask(id).then(function(task) {
      if (properties.computeHash(task) === task._quote.hash) {
        log.debugId(task, 'Task has not changed, ignoring');
      } else {
        log.debugId(task, 'Task has updated since we last looked, visiting');
        return me.visit(task, project);
      }
    });
  });
};

/**
 * @param {Task} task
 * @return {boolean} True iff the Quote has been explicitly marked for review
 * @private
 */
QuoteVisitor.prototype._markedForReview = function(task) {
  var me = this;
  // Assigning a task to the Quoticorn is a signal to review.
  if (task.assignee && task.assignee.id === me.config.moderatorId) {
    return true;
  }

  // If custom properties are in use, marking the task as "needs review" is
  // similarly explicit.
  if (me.config.statusProperty !== undefined) {
    var status = properties.status(task);
    if (status && status.id === me.config.statusProperty.needsReview) {
      return true;
    }
  }

  return false;
};

module.exports = QuoteVisitor;
