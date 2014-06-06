
var compressible = require('compressible')
var lookup = require('mime-types').lookup
var resolve = require('resolve-path')
var hash = require('hash-stream')
var zlib = require('zlib')
var Path = require('path')
var fs = require('mz/fs')

var extname = Path.extname
var basename = Path.basename

var methods = 'HEAD,GET,OPTIONS'
var notfound = {
  ENOENT: true,
  ENAMETOOLONG: true,
  ENOTDIR: true,
}

module.exports = function (root, options) {
  if (typeof root === 'object') {
    options = root
    root = null
  }

  options = options || {}
  root = root || options.root || process.cwd()

  var cache = Object.create(null)
  var maxage = options.maxage
  var cachecontrol = maxage != null
    ? ('public, max-age=' + (maxage / 1000 | 0))
    : ''
  var etagoptions = options.etag || {}
  var algorithm = etagoptions.algorithm || 'sha256'
  var encoding = etagoptions.encoding || 'base64'
  var index = options.index
  var hidden = options.hidden

  // this.fileServer.send(), etc.
  function FileServer(context) {
    this.context = context
  }

  FileServer.prototype.send = function* (path) {
    return yield* send(this.context, path)
  }

  serve.send = send
  return serve

  // middleware
  function* serve(next) {
    this.fileServer = new FileServer(this)

    yield* next

    // response is handled
    if (this.response.body) return
    if (this.response.status !== 404) return

    yield* send(this)
  }

  // utility
  function* send(ctx, path) {
    var req = ctx.request
    var res = ctx.response

    path = path || req.path.slice(1) || ''

    // index file support
    var directory = path === '' || path.slice(-1) === '/'
    if (index && directory) path += 'index.html'

    // regular paths can not be absolute
    path = resolve(root, path)

    // hidden file support
    if (!hidden && leadingDot(path)) return

    var file = yield* get(path)
    if (!file) return // 404

    // proper method handling
    var method = req.method
    switch (method) {
      case 'HEAD':
      case 'GET':
        break // continue
      case 'OPTIONS':
        res.set('Allow', methods)
        res.status = 204
        return file
      default:
        res.set('Allow', methods)
        res.status = 405
        return file
    }

    res.status = 200
    res.etag = file.etag
    res.lastModified = file.stats.mtime
    res.type = extname(path)
    if (cachecontrol) res.set('Cache-Control', cachecontrol)

    if (req.fresh) {
      res.status = 304
      return file
    }
    
    if (method === 'HEAD') return file

    if (file.compress && req.acceptsEncodings('gzip', 'identity') === 'gzip') {
      res.set('Content-Encoding', 'gzip')
      res.length = file.compress.stats.size
      res.body = fs.createReadStream(file.compress.path)
    } else {
      res.set('Content-Encoding', 'identity')
      res.length = file.stats.size
      res.body = fs.createReadStream(path)
    }

    return file
  }

  // get the file from cache if possible
  function* get(path) {
    if (cache[path]) return cache[path]

    var stats = yield* stat(path)
    // we don't want to cache 404s because
    // the cache object will get infinitely large
    if (!stats || !stats.isFile()) return
    stats.path = path

    var file = cache[path] = {
      stats: stats,
      etag: (yield hash(path, algorithm)).toString(encoding),
    }

    // if we can compress this file, we create a .gz
    if (compressible(lookup(extname(path)))) {
      var compress = file.compress = {
        path: path + '.gz'
      }

      // delete old .gz files in case the file has been updated
      try {
        yield fs.unlink(compress.path)
      } catch (err) {}

      yield function (done) {
        fs.createReadStream(path)
        .on('error', done)
        .pipe(zlib.createGzip())
        .on('error', done)
        .pipe(fs.createWriteStream(compress.path))
        .on('error', done)
        .on('finish', done)
      }

      compress.stats = yield fs.stat(compress.path)

      // if the gzip size is larger than the original file,
      // don't bother gzipping
      if (compress.stats.size > stats.size) {
        delete file.compress
        yield fs.unlink(compress.path)
      }
    }

    return file
  }
}

function* stat(filename) {
  try {
    return yield fs.stat(filename)
  } catch (err) {
    if (notfound[err.code]) return
    err.status = 500
    throw err
  }
}

function leadingDot(path) {
  return '.' === basename(path)[0]
}
