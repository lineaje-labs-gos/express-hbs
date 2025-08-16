/* eslint-disable strict */
var request = require('supertest');
var path = require('path');
var rewire = require('rewire');
var assert = require('assert');
var fs = require('fs');


/**
 * Creates instance of example app using an injected version of express-hbs to track the number of times a
 * file is read. Additionally, the $NODE_ENV environment variable may be set.
 *
 * @param env
 * @returns {{app: hbs, readCounts: {}}}
 */
function createApp(env) {
  var readCounts = {};
  // process.chdir(path.resolve(__dirname, '../example'));
  var hbs = rewire('../lib/hbs');
  hbs.__set__('fs', {
    readFileSync: function(filename, encoding) {
      if (typeof readCounts[filename] === 'undefined') {
        readCounts[filename] = 1;
      } else {
        readCounts[filename] += 1;
      }

      return fs.readFileSync(filename, encoding);
    },

    readFile: function(filename, encoding, cb) {
      if (typeof readCounts[filename] === 'undefined') {
        readCounts[filename] = 1;
      } else {
        readCounts[filename] += 1;
      }

      fs.readFile(filename, encoding, cb);
    },
    existsSync: function(filename, encoding) {
      return fs.existsSync(filename, encoding);
    },
    statSync: fs.statSync
  });

  // used mocked hbs in example
  var example = require('../example/app');
  var app = example.create(hbs, env);
  return {app: app, readCounts: readCounts};
}

describe('express-hbs secure layout path handling', function () {
  it('should fallback to default layout when a secure layout path does not exist', function (done) {
    var mock = createApp('production');

    request(mock.app)
      .get('/secure-but-missing-layout')
      .expect(200)
      .expect(/DEFAULT LAYOUT/, done);
  });

  it('should block and error on layout path escaping base directory', function (done) {
    var mock = createApp('development'); // make sure this sets NODE_ENV properly// <---- ADD THIS
    request(mock.app)
      .get('/unsafe-layout-traversal-query?layout=../../../outside')
      .expect(500)
      .end(function (err, res) {
        if (err) return done(err);
        assert.ok(
          res.text.includes('Blocked malicious layout path'),
          'Expected generic 500 response when layout path escapes base dir'
        );
        done();
      });
  });

  it('should render a deeply nested secure layout if it exists', function (done) {
    var mock = createApp('production');

    request(mock.app)
      .get('/deep-nested-layout')
      .expect(200)
      .expect(/DEEP NESTED LAYOUT/, done);
  });

  it('should NOT cache layout if layout path is invalid in development', function (done) {
    var mock = createApp('development');

    request(mock.app)
      .get('/invalid-layout')
      .expect(200)
      .expect(/DEFAULT LAYOUT/)
      .end(function (err) {
        assert.ifError(err);
        var layoutPath = path.resolve(__dirname, '../example/views/layout/invalid-layout.hbs');
        assert.strictEqual(mock.readCounts[layoutPath], undefined);
        done();
      });
  });

  it('should block and error on layout path escaping base directory via req.body', function (done) {
    var mock = createApp('development');
    request(mock.app)
      .post('/unsafe-layout-traversal-body')
      .send({ layout: '../../../outside' }) // layout sent in body
      .expect(500)
      .end(function (err, res) {
        if (err) return done(err);
        assert.ok(
          res.text.includes('Blocked malicious layout path'),
          'Expected error due to malicious layout path in req.body'
        );
        done();
      });
  });


});