var exec = require('child_process').exec;
var gulp = require('gulp');
var path = require('path');
var browserify = require('browserify');
var vinylSourceStream = require('vinyl-source-stream');

var distDir = path.join(__dirname, 'dist');

gulp.task('build-web', ['public-files', 'build-webjs']);

gulp.task('public-files', function() {
  gulp.src(path.join(__dirname, 'public/**')).pipe(gulp.dest(distDir));
});

gulp.task('build-webjs', function() {
  return browserify(
      {
        entries: ['./lib/web/index.js'],
        standalone: 'Quotana'
      })
      .bundle()
      .pipe(vinylSourceStream('quotana.js'))
      .pipe(gulp.dest('public'));
});

