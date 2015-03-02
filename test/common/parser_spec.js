/* jshint mocha:true */
var assert = require('assert');

var parser = require('../../lib/common/parser');
var Quote = require('../../lib/common/quote');

describe('Parser', function() {

  describe('#parseDate', function() {
    it('should return null on empty', function() {
      assert.equal(parser.parseDate(''), null);
    });
    it('should return null on whitespace', function() {
      assert.equal(parser.parseDate('  '), null);
    });
    it('should return null on non-date', function() {
      assert.equal(parser.parseDate('abc'), null);
    });
    it('should return null on date not at beginning', function() {
      assert.equal(parser.parseDate('abc 2014-01-01'), null);
    });
    it('should return null on embedded date', function() {
      assert.equal(parser.parseDate('abc2014-01-01def'), null);
    });
    it('should return null on date not separated', function() {
      assert.equal(parser.parseDate('2014-01-01def'), null);
    });
    it('should return date on full date', function() {
      assert.deepEqual(
          parser.parseDate('2014-01-01'),
          {
            date: new Date('2014-01-01'),
            next: ''
          });
    });
    it('should return date on month-only date', function() {
      assert.deepEqual(
          parser.parseDate('2014-01'),
          {
            date: new Date('2014-01'),
            next: ''
          });
    });
    it('should return date on unknown date', function() {
      assert.deepEqual(
          parser.parseDate('unknown'),
          {
            date: null,
            next: ''
          });
    });
    it('should return date if at beginning of line', function() {
      assert.deepEqual(
          parser.parseDate('2014-01-01 foo'),
          {
            date: new Date('2014-01-01'),
            next: 'foo'
          });
    });
  });

  describe('#parseSpokenLine', function() {
    it('should return null on empty', function() {
      assert.equal(parser.parseSpokenLine(''), null);
    });
    it('should return null on whitespace', function() {
      assert.equal(parser.parseSpokenLine('  '), null);
    });
    it('should return null on non-line', function() {
      assert.equal(parser.parseSpokenLine('abc'), null);
    });
    it('should return speaker and line if adjacent', function() {
      assert.deepEqual(
          parser.parseSpokenLine('greg:hi'),
          {
            speaker: 'greg',
            line: 'hi',
            next: ''
          });
    });
    it('should return speaker and line if separated with space', function() {
      assert.deepEqual(
          parser.parseSpokenLine('greg:  hi'),
          {
            speaker: 'greg',
            line: 'hi',
            next: ''
          });
    });
    it('should allow whitespace in speaker name', function() {
      assert.deepEqual(
          parser.parseSpokenLine('greg s: hi'),
          {
            speaker: 'greg s',
            line: 'hi',
            next: ''
          });
    });
    it('should return speaker and line if line has quotes', function() {
      assert.deepEqual(
          parser.parseSpokenLine('greg: "hi"'),
          {
            speaker: 'greg',
            line: 'hi',
            next: ''
          });
    });
    it('should consume only up until end quote', function() {
      assert.deepEqual(
          parser.parseSpokenLine('greg: "hi" extra'),
          {
            speaker: 'greg',
            line: 'hi',
            next: ' extra'
          });
    });
    it('should consume only up until next colon', function() {
      assert.deepEqual(
          parser.parseSpokenLine('greg: hi malcolm: bye'),
          {
            speaker: 'greg',
            line: 'hi malcolm',
            next: ': bye'
          });
    });
    it('should consume full line if no quotes', function() {
      assert.deepEqual(
          parser.parseSpokenLine('greg: hi extra'),
          {
            speaker: 'greg',
            line: 'hi extra',
            next: ''
          });
    });
  });

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

      it('should populate quote fields', function() {
        var task = {
          created_at: '2014-01-01T00:00:00Z',
          name: 'anything',
          notes: 'greg: hello'
        };
        var quote = new Quote(1);
        assert.equal(true, parser.parse(task, quote, 'multi'));
        assert.equal(quote.status, 'valid');
        assert.equal(quote.date.getTime(), 1388534400000);
        assert.deepEqual(quote.lines, [{
          speaker: 'greg',
          line: 'hello'
        }]);
        assert.deepEqual(quote.speakers, ['greg']);
        assert.equal(quote.context, null);
      });

      describe('linesInDescription', function() {

        it('should identify multiple speakers', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'anything',
            notes: 'greg: hi\nmalcolm: hi\ngreg: i just said that'
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hi'
            },
            {
              speaker: 'malcolm',
              line: 'hi'
            },
            {
              speaker: 'greg',
              line: 'i just said that'
            }
          ]);
          assert.deepEqual(quote.speakers, ['greg', 'malcolm']);
        });

        it('should allow double quotes around lines', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'anything',
            notes: 'greg: "hi"\nmalcolm: hi'
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hi'
            },
            {
              speaker: 'malcolm',
              line: 'hi'
            }
          ]);
          assert.deepEqual(quote.speakers, ['greg', 'malcolm']);
        });

        it('should ignore extra whitespace', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'anything',
            notes: '\n  \n greg: hello\n\nmalcolm: hi'
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            },
            {
              speaker: 'malcolm',
              line: 'hi'
            }
          ]);
        });

        it('should extract date if at end', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'anything',
            notes: 'greg: hello\n2015-05-05'
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            }
          ]);
          assert.equal(quote.date.getTime(), Date.parse('2015-05-05'));
        });

        it('should extract date if at beginning', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'anything',
            notes: '2015-05-05\ngreg: hello'
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            }
          ]);
          assert.equal(quote.date.getTime(), Date.parse('2015-05-05'));
        });

        it('should extract date if at beginning of name', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: '2015-05-05 anything',
            notes: 'greg: hello'
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            }
          ]);
          assert.equal(quote.date.getTime(), Date.parse('2015-05-05'));
        });

        it('should extract context if at end', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'anything',
            notes: 'greg: hello\nto malcolm'
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            }
          ]);
          assert.equal(quote.context, 'to malcolm');
        });

        it('should extract both context and date if at end', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'anything',
            notes: 'greg: hello\nto malcolm\n2015-05-05'
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            }
          ]);
          assert.equal(quote.context, 'to malcolm');
          assert.equal(quote.date.getTime(), Date.parse('2015-05-05'));
        });

        it('should ignore everything below dash separator', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'anything',
            notes: 'greg: hello\n---\nignore: this\nblah blah blah\n2015-05-05'
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            }
          ]);
          assert.equal(quote.context, null);
          assert.equal(quote.date.getTime(), Date.parse('2014-01-01'));
        });

      });

      describe('linesInName', function() {

        it('should identify single speakers', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'greg: hello',
            notes: ''
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            }
          ]);
          assert.equal(quote.context, null);
          assert.equal(quote.date.getTime(), Date.parse('2014-01-01'));
        });

        it('should identify multiple speakers', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'greg: "hello" malcolm: "hi"',
            notes: ''
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            },
            {
              speaker: 'malcolm',
              line: 'hi'
            }
          ]);
        });

        it('should fail if multiple speakers but no quotes', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'greg: hello, malcolm: hi',
            notes: ''
          };
          var quote = new Quote(1);
          assert.equal(false, parser.parse(task, quote, 'multi'));
        });

        it('should extract date from beginning of name', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: '2015-05-05 greg: hello',
            notes: ''
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            }
          ]);
          assert.equal(quote.context, null);
          assert.equal(quote.date.getTime(), Date.parse('2015-05-05'));
        });

        it('should extract context from notes', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: '2015-05-05 greg: hello',
            notes: 'to malcolm'
          };
          var quote = new Quote(1);
          assert.equal(true, parser.parse(task, quote, 'multi'));
          assert.deepEqual(quote.lines, [
            {
              speaker: 'greg',
              line: 'hello'
            }
          ]);
          assert.equal(quote.context, 'to malcolm');
          assert.equal(quote.date.getTime(), Date.parse('2015-05-05'));
        });

      });

      describe('invalid', function() {

        it('should be invalid if no lines in description', function() {
          var task = {
            created_at: '2014-01-01T00:00:00Z',
            name: 'meh',
            notes: 'to malcolm'
          };
          var quote = new Quote(1);
          assert.equal(false, parser.parse(task, quote, 'multi'));
        });

      });
    });
  });

});
