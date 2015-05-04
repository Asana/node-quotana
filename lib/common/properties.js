var crypto = require('crypto');
var config = require('../common/config');

function findProperty(task, id) {
  if (!task.custom_properties) {
    return undefined;
  }
  for (var i = 0; i < task.custom_properties.length; i++) {
    var property = task.custom_properties[i];
    if (property.id === id) {
      return property;
    }
  }
  return undefined;
}

/**
 * @param {Object} task
 * @param {Number} property_id
 * @returns {Number|null} ID of the enum value or null if none / not present.
 */
function enumValue(task, property_id) {
  var property = findProperty(task, property_id);
  return property ? (property.value ? property.value.id : null) : null;
}

/**
 * @param {Object} task
 * @returns {Object?}
 */
function status(task) {
  return enumValue(task, config.statusProperty.id);
}

/**
 * Hash the inputs we use to parse the quote so we know if it changed.
 * @param {Object} task
 * @returns {string}
 */
function computeHash(task) {
  return crypto.createHash('md5')
      .update('name:' + task.name)
      .update('notes:' + task.notes)
      .digest('hex');
}


module.exports = {
  status: status,
  computeHash: computeHash
};
