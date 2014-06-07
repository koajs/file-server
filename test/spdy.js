
var co = require('co')
var koa = require('koa')
var path = require('path')
var assert = require('assert')
var https = require('https')
var spdy = require('spdy')

var staticServer = require('..')

describe('spdy push', function () {
  it('should push a file', co(function* () {
    var stream = yield* request('index.js')
    stream.url.should.equal('/index.js')
    stream.headers['content-type'].should.match(/application\/javascript/)
    stream.headers['content-encoding'].should.equal('gzip')
    stream.headers['content-length'].should.be.ok
    stream.headers['etag'].should.be.ok
    stream.headers['last-modified'].should.be.ok
  }))

  it('should not gzip small files', co(function* () {
    var stream = yield* request('test/index.html')
    stream.url.should.equal('/test/index.html')
    stream.headers['content-type'].should.match(/text\/html/)
    stream.headers['content-encoding'].should.equal('identity')
    stream.headers['content-length'].should.be.ok
    stream.headers['etag'].should.be.ok
    stream.headers['last-modified'].should.be.ok
  }))

  it('should throw on / files', co(function* () {
    var res = yield* request('/index.js')
    res.statusCode.should.equal(500)
  }))

  it('should throw on unknown files', co(function* () {
    var res = yield* request('asdfasdf')
    res.statusCode.should.equal(500)
  }))
})

function* request(path) {
  var app = koa()
  app.use(staticServer())
  app.use(function* () {
    this.response.status = 204
    yield* this.fileServer.push(path)
  })

  var server = spdy.createServer(require('spdy-keys'), app.callback())
  yield function (done) {
    server.listen(done)
  }

  var res
  var agent = spdy.createAgent({
    host: '127.0.0.1',
    port: server.address().port,
    rejectUnauthorized: false,
  })
  // note: agent may throw errors!

  // we need to add a listener to the `push` event
  // otherwise the agent will just destroy all the push streams
  var streams = []
  agent.on('push', function (stream) {
    if (res) res.emit('push', stream)
    streams.push(stream)
  })

  var req = https.request({
    host: '127.0.0.1',
    agent: agent,
    method: 'GET',
    path: '/',
  })

  res = yield function (done) {
    req.once('response', done.bind(null, null))
    req.once('error', done)
    req.end()
  }

  res.streams = streams
  res.agent = agent

  if (res.statusCode === 204) {
    if (!res.streams.length) {
      yield function (done) {
        res.once('push', done.bind(null, null))
      }
    }

    return res.streams[0]
  }

  return res
}
