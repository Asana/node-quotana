#!/usr/bin/env node
// vi: ft=javascript

/**
 * This server exists just to serve up some HTML/JS files, all the interesting
 * stuff happens in the browser JS.
 *
 * Usage:
 *
 *   [export PORT=...]
 *   node lib/webserver/webserver.js
 */
var express = require('express');
var app = express();
var config = require('../common/config');
var fs = require('fs');

if (process.env.QUOTANA_CONFIG === undefined) {
  console.log('Error: must specify config file with env QUOTANA_CONFIG');
  process.exit(1);
}
config(process.env.QUOTANA_CONFIG);
var port = process.env.PORT || config.webServerPort || 5020;

// Don't cache anything - make it easier to debug
app.use(function(req, res, next) {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Quick and dirty - expose all static files in this directory.
app.use('/', express.static(__dirname + '/../../dist'));

app.get('/', function(req, res) {
  res.redirect('/index.html');
});

app.get('/config.js', function(req, res) {
  var filename = process.env.QUOTANA_CONFIG;
  var config = JSON.parse(fs.readFileSync(filename, 'utf-8'));
  delete config.refreshToken;
  delete config.clientSecret;
  var content = 'Quotana.config(\n' +
      JSON.stringify(config) +
      '\n);';
  res.set('Content-Type', 'text/javascript');
  res.send(content);
});

// Run the server!
var server = app.listen(port, function() {
  console.log("Listening on port " + port);
});
