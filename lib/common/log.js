var _ = require('lodash');
var config = require('../common/config');

function debug() {
  if (config.debug) {
    console.log.apply(console, arguments);
  }
}

function debugId(id) {
  if (typeof(id) === 'object') {
    id = id.id;
  }

  var args = ['[' + id + ']'].concat(_.slice(arguments, 1));
  console.log.apply(console, args);
}

exports.debug = debug;
exports.debugId = debugId;