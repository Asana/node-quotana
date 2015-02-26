var Asana = require('asana');
var Bluebird = require('bluebird');
var fs = require('fs');
var util = require('util');
var _ = require('lodash');

var config = require('./lib/common/config');
config(process.env.QUOTANA_CONFIG);

/**
 * Helper script to import existing JSON quotes into Asana.
 */

var args = process.argv.slice(2);
var filename = args[0];
var projectId = parseInt(args[1], 10);
var startOffset = parseInt(args[2] || 0, 10);
if (typeof(filename) !== 'string' || isNaN(projectId)) {
  console.log('Usage: node import.js QUOTEFILE PROJECT_ID [OFFSET]');
  process.exit(1);
}

var project = _.find(config.projects, function(p) {
  return p.id === projectId;
});
if (!project) {
  console.log('Project not found in config');
}

var quotesFromFile = JSON.parse(fs.readFileSync(filename, 'utf-8'));

console.log(
    util.format(
        'Found %d quotes, importing from index %d into project %d (%s)',
        quotesFromFile.length, startOffset, projectId, project.type));

var client = Asana.Client.create(config);
client.useOauth({ credentials: { refresh_token: config.refreshToken }});

var index = startOffset;
var promise = Bluebird.resolve();
quotesFromFile.slice(startOffset).forEach(function(quote) {
  promise = promise.then(function() {
    console.log(index, quote);
    index++;
    var data = {
      workspace: config.workspaceId,
      name: quote.author,
      notes: quote.quote + '\n' + quote.date,
      projects: [projectId]
    };
    return client.tasks.create(data).catch(function(err) {
      console.log(err.value);
      throw err;
    });
  });
});
