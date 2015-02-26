var exec = require('child_process').exec;
var gulp = require('gulp');
var path = require('path');
var jshint = require('gulp-jshint');
var mocha = require('gulp-mocha');
var browserify = require('browserify');
var vinylSourceStream = require('vinyl-source-stream');
var fs = require('fs');

var distDir = path.join(__dirname, 'dist');

var root = '*.js';
var lib = 'lib/**/*.js';
var test = 'test/**/*.js';

gulp.task('test', ['spec']);

gulp.task('build-web', ['public-files']);

gulp.task('public-files', ['build-webjs'], function() {
  gulp.src(path.join(__dirname, 'public/**')).pipe(gulp.dest(distDir));
});

gulp.task('build-webjs', ['public-config'], function() {
  return browserify(
      {
        entries: ['./lib/web/index.js'],
        standalone: 'Quotana'
      })
      .bundle()
      .pipe(vinylSourceStream('quotana.js'))
      .pipe(gulp.dest('public'));
});

gulp.task('public-config', function() {
  var filename = process.env.QUOTANA_CONFIG;
  var config = JSON.parse(fs.readFileSync(filename, 'utf-8'));
  delete config.refreshToken;
  delete config.clientSecret;
  var content = 'module.exports = require("../lib/common/config")(\n' +
      JSON.stringify(config) +
      '\n);';
  fs.writeFileSync(distDir + '/public_config.js', content, 'utf-8');
});

/**
 * Lints all of the JavaScript files and fails if the tasks do not pass
 */
gulp.task('lint', function() {
  return gulp.src([root, lib, test])
      .pipe(jshint())
      .pipe(jshint.reporter('jshint-stylish'))
      .pipe(jshint.reporter('fail'));
});

/**
 * Tests the code with mocha and ensures 100% code coverage
 */
gulp.task('spec', ['lint'], function(callback) {
  gulp.src(test)
      .pipe(mocha({
        reporter: process.env.TRAVIS ? 'spec' : 'nyan'
      }));
});