/**
 * This server exists just to serve up some HTML/JS files, all the interesting
 * stuff happens in the browser JS.
 *
 * Usage:
 *
 *   [export PORT=...]
 *   node server.js
 */
var express = require('express');
var app = express();

var port = process.env.PORT || 5020;

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

// Run the server!
var server = app.listen(port, function() {
  console.log("Listening on port " + port);
});