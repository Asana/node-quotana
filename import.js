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

var dryRun = false;
var multi = true;
var args = process.argv.slice(2);
var filename = args[0];
var projectId = parseInt(args[1], 10);
var startOffset = parseInt(args[2] || 0, 10);
var limit = parseInt(args[3] || 0, 10);
if (typeof(filename) !== 'string' || isNaN(projectId)) {
  console.log('Usage: node import.js QUOTEFILE PROJECT_ID [OFFSET] [LIMIT]');
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
//client.useOauth({ credentials: { refresh_token: config.refreshToken }});
client.useBasicAuth('ErQ69.iLYR2QNGWdvKojzVgTjqUKHTwk');

var index = startOffset;
var promise = Bluebird.resolve();
quotesFromFile.slice(startOffset, startOffset + (limit || 10000)).forEach(function(quote) {
  promise = promise.then(function() {
    console.log(index, quote);
    index++;

    if (quote.unsafe) {
      return Bluebird.resolve();
    }

    var data = {
      workspace: config.workspaceId,
      projects: [projectId]
    };
    if (multi) {
      data.notes = '';
      var authors = [];
      var authorsSeen = {};
      for (var i = 0; i < quote.quote.length; i += 2) {
        var author = quote.quote[i];
        if (!(author in authorsSeen)) {
          authorsSeen[author] = true;
          authors.push(author);
        }
        var line = quote.quote[i + 1];
        data.notes += author + ': ' + line + '\n';
      }
      if (quote.context) {
        data.notes += quote.context + '\n';
      }
      data.notes += '\n' + quote.date + '\n';
      data.name = quote.date + ' ' + authors.join(' and ');
    } else {
      data.name = quote.author;
      data.notes = quote.quote + '\n' + quote.date;
    }

    if (dryRun) {
      console.log('Would post:', data);
      return Bluebird.resolve();
    } else {
      return client.tasks.create(data).catch(function(err) {
        console.log(err.value);
        throw err;
      });
    }
  });
});
