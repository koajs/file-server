
var koa = require('koa')
var assert = require('assert')
var request = require('supertest')

var staticServer = require('..')

var app = koa()
app.use(staticServer())
var server = app.listen()

describe('headers', function () {
  var etag

  it('should set content-* and last-modified headers', function (done) {
    request(server)
    .get('/test/file-server.js')
    .expect('content-type', 'application/javascript')
    .expect(200, function (err, res) {
      if (err) return done(err)

      assert.ok(res.headers['content-length'])
      assert.ok(res.headers['last-modified'])
      done()
    })
  })

  it('should set an etag', function (done) {
    request(server)
    .get('/test/file-server.js')
    .expect(200, function (err, res) {
      if (err) return done(err)

      assert.ok(etag = res.headers['etag'])
      done()
    })
  })

  it('if-none-match should serve 304', function (done) {
    request(server)
    .get('/test/file-server.js')
    .set('if-none-match', etag)
    .expect(304, done)
  })

  it('should set Allow w/ OPTIONS', function (done) {
    request(server)
    .options('/test/file-server.js')
    .expect('allow', /HEAD/)
    .expect('allow', /GET/)
    .expect('allow', /OPTIONS/)
    .expect(204, done)
  })

  it('should set Allow w/ 405', function (done) {
    request(server)
    .post('/test/file-server.js')
    .expect('allow', /HEAD/)
    .expect('allow', /GET/)
    .expect('allow', /OPTIONS/)
    .expect(405, done)
  })

  it('should not set cache-control by default', function (done) {
    request(server)
    .get('/test/file-server.js')
    .expect(200, function (err, res) {
      if (err) return done(err)

      assert.ok(!res.headers['cache-control'])
      done()
    })
  })

  it('should set cache-control with maxage', function (done) {
    var app = koa()
    app.use(staticServer({
      maxage: 1000
    }))
    var server = app.listen()

    request(server)
    .get('/test/file-server.js')
    .expect('cache-control', 'public, max-age=1')
    .expect(200, done)
  })
})

describe('non-files', function (done) {
  it('should not be served when a directory', function (done) {
    request(server)
    .get('/test')
    .expect(404, done)
  })
})

describe('index files', function (done) {
  it('should not be served by default', function (done) {
    request(server)
    .get('/test/')
    .expect(404, done)
  })

  it('should be served when enabled', function (done) {
    var app = koa()
    app.use(staticServer({
      index: true
    }))
    var server = app.listen()

    request(server)
    .get('/test/')
    .expect('content-type', 'text/html; charset=utf-8')
    .expect(200, done)
  })
})

describe('hidden files', function () {
  it('should not be served by default', function (done) {
    request(server)
    .get('/.gitignore')
    .expect(404, done)
  })

  it('should be served when enabled', function (done) {
    var app = koa()
    app.use(staticServer({
      hidden: true
    }))
    var server = app.listen()

    request(server)
    .get('/.gitignore')
    .expect(200, done)
  })
})

describe('malicious paths', function () {
  it('..', function (done) {
    request(server)
    .get('/../klajsdfkljasdf')
    .expect(400, done)
  })

  it('//', function (done) {
    request(server)
    .get('//asdfasdffs')
    .expect(400, done)
  })

  it('/./', function (done) {
    request(server)
    .get('/./index.js')
    .expect(200, done)
  })
})

describe('aliases', function () {
  var app = koa()
  app.use(staticServer({
    alias: {
      'package': 'package.json'
    }
  }))
  var server = app.listen()

  it('should work', function (done) {
    request(server)
    .get('/package')
    .expect('content-type', 'application/json')
    .expect(200, done)
  })
})