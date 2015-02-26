/* jshint mocha:true */
var assert = require('assert');

var parser = require('../../lib/common/parser');
var Quote = require('../../lib/common/quote');

describe('Parser', function() {

  describe('#parse', function() {

    describe('simple', function() {

      it('should populate quote fields', function() {
        var task = {
          created_at: '2014-01-01T00:00:00Z',
          name: 'fake name',
          notes: 'fake notes'
        };
        var quote = new Quote(1);
        assert.equal(true, parser.parse(task, quote, 'simple'));
        assert.equal(quote.status, 'valid');
        assert.equal(quote.date.getTime(), 1388534400000);
        assert.deepEqual(quote.lines, [{
          speaker: 'fake name',
          line: 'fake notes'
        }]);
        assert.deepEqual(quote.speakers, ['fake name']);
      });

      it('should trim line content', function() {
        var task = {
          created_at: '2014-01-01T00:00:00Z',
          name: 'fake name',
          notes: '\n  abc,\ndef. '
        };
        var quote = new Quote(1);
        assert.equal(true, parser.parse(task, quote, 'simple'));
        assert.deepEqual(quote.lines, [{
          speaker: 'fake name',
          line: 'abc, def.'
        }]);
      });

      it('should extract date if at end', function() {
        var task = {
          created_at: '2014-01-01T00:00:00Z',
          name: 'fake name',
          notes: 'abc\n2015-05-05\n'
        };
        var quote = new Quote(1);
        assert.equal(true, parser.parse(task, quote, 'simple'));
        assert.deepEqual(quote.lines, [{
          speaker: 'fake name',
          line: 'abc'
        }]);
        assert.equal(quote.date.getTime(), Date.parse('2015-05-05'));
      });

    });

    describe('multi', function() {

      // TODO: we can test out all the crazy formats and cases here.

    });

  });

});
