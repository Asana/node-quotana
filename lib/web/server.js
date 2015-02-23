/**
 * This file exists just to serve up some HTML/JS files to demo the
 * browser-side use of Oauth.
 *
 * Usage:
 *
 *   [export PORT=...]
 *   node server.js
 */
var express = require('express');
var app = express();

var port = process.env['PORT'] || 8338;

// Quick and dirty - expose all static files in this directory.
// Don't cache anything - make it easier to debug
app.use(function(req, res, next) {
  req.headers['Cache-Control'] = 'no-cache';
  next();
});
app.use('/', express.static(__dirname + '/../../dist'));

app.get('/', function(req, res) {
  res.redirect('/index.html');
});

// Run the server!
var server = app.listen(port, function() {
  console.log("Listening on port " + port);
});