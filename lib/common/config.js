var fs = require('fs');
var _ = require('lodash');

/**
 * Singleton configuration. Invoke it with a filename to load it, then
 * use it like an object.
 *
 * @return {Object} Configuration for Quotana.
 *     {Number} clientId Id of the Quotana app
 *     {String} redirectUri Redirect URI for the Quotana app
 *     {Number} failuresUntilAdminFollow After a user makes this many bad
 *         attempts at editing a quote, adds an admin as a follower.
 *     {Number} workspaceId The workspace the projects are in.
 *     {Number} moderatorId The user who will act on the quotes,
 *         should have access to all the projects.
 *     {Number} adminstratorId The user who administers the app
 *     {Number} quietPeriodMs If a quote task is changed then Quotana will wait
 *         this long until parsing it, unless it is assigned to the moderator.
 *     {Number} webServerPort Port web server should listen on. Can also be
 *         set via PORT env variable.
 *     {Boolean} useTaskCompletion True if valid quote tasks should be
 *         marked complete and invalid ones incomplete.
 *     {Object[]} projects List of projects that should be examined.
 *         {Number} id ID of the project in Asana
 *         {Number} maxQuoteLength Max number of characters in quote content.
 *         {String} type Type of quotes project. Choices are `simple` for
 *             quotes that just use the name as author and notes as content,
 *             or `multi` for quotes that represent multiple speakers.
 *         {String} source An arbitrary field that may be used in the UI
 *             to display the source differently for different types of
 *             quote lists (e.g. customer quotes, humor, praise, etc.)
 */
function config(filenameOrObject) {
  var obj;
  if (typeof(filenameOrObject) === 'object') {
    obj = filenameOrObject;
  } else {
    obj = JSON.parse(fs.readFileSync(filenameOrObject, 'utf-8'));
  }
  _.assign(config, obj);
  return config;
}

module.exports = config;