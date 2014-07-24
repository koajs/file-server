
var koa = require('koa')
var path = require('path')
var assert = require('assert')
var request = require('supertest')

var staticServer = require('..')

var app = koa()
app.use(staticServer())
var server = app.listen()

describe('root', function () {
  it('should root priority than options.root', function (done) {
    var app = koa()
    app.use(staticServer(__dirname, {
      root: path.dirname(__dirname)
    }))
    var server = app.listen();
    request(server)
    .get('/file-server.js')
    .expect('content-type', /application\/javascript/)
    .expect(200, done)
  })

  it('should options.root work', function (done) {
    var app = koa()
    app.use(staticServer({
      root: __dirname
    }))
    var server = app.listen();
    request(server)
    .get('/file-server.js')
    .expect('content-type', /application\/javascript/)
    .expect(200, done)
  })
})

describe('headers', function () {
  var etag

  it('should set content-* and last-modified headers', function (done) {
    request(server)
    .get('/test/file-server.js')
    .expect('content-type', /application\/javascript/)
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

describe('compression', function () {
  it('should compress large files', function (done) {
    request(server)
    .get('/index.js')
    .expect('Content-Encoding', 'gzip')
    .expect('Content-Type', /application\/javascript/)
    .expect(200, done)
  })

  it('should not compress small files', function (done) {
    request(server)
    .get('/test/index.html')
    .expect('Content-Encoding', 'identity')
    .expect('Content-Type', /text\/html/)
    .expect(200, done)
  })

  it('should not compress uncompressible files', function (done) {
    request(server)
    .get('/LICENSE')
    .expect('Content-Encoding', 'identity')
    .expect(200, done)
  })
})

describe('.fileServer.send()', function () {
  it('should send a file', function (done) {
    app.use(function* (next) {
      if (this.request.path !== '/asdfasdf.js') return yield* next

      yield* this.fileServer.send('test/file-server.js')
    })

    request(app.listen())
    .get('/asdfasdf.js')
    .expect('content-type', /application\/javascript/)
    .expect(200, done)
  })
})

describe('404s', function () {
  it('should return 404', function (done) {
    app.use(function* (next) {
      if (this.request.path !== '/404') return yield* next

      yield* this.fileServer.send('lkjasldfjasdf.js')
    })

    request(app.listen())
    .get('/404')
    .expect(404, done)
  })
})
