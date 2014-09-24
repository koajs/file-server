
var compressible = require('compressible')
var resolve = require('resolve-path')
var hash = require('hash-stream')
var mime = require('mime-types')
var spdy = require('spdy-push')
var assert = require('assert')
var zlib = require('mz/zlib')
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

  FileServer.prototype.push = function* (path, opts) {
    return yield* push(this.context, path, opts)
  }

  serve.send = send
  serve.push = push
  serve.cache = cache
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
    res.type = file.type
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

  function* push(ctx, path, opts) {
    assert(path, 'you must define a path!')
    if (!ctx.res.isSpdy) return

    opts = opts || {}

    assert(path[0] !== '/', 'you can only push relative paths')
    var uri = path // original path

    // index file support
    var directory = path === '' || path.slice(-1) === '/'
    if (index && directory) path += 'index.html'

    // regular paths can not be absolute
    path = resolve(root, path)

    var file = yield* get(path)
    assert(file, 'can not push file: ' + uri)

    var options = {
      path: '/' + uri,
      priority: opts.priority,
    }

    var headers = options.headers = {
      'content-type': file.type,
      etag: file.etag,
      'last-modified': file.stats.mtime.toUTCString(),
    }

    if (cachecontrol) headers['cache-control'] = cachecontrol

    if (file.compress) {
      headers['content-encoding'] = 'gzip'
      headers['content-length'] = file.compress.stats.size
      options.filename = file.compress.path
    } else {
      headers['content-encoding'] = 'identity'
      headers['content-length'] = file.stats.size
      options.filename = path
    }

    spdy(ctx.res)
      .push(options)
      .send()
      .catch(ctx.onerror)

    return file
  }

  // get the file from cache if possible
  function* get(path) {
    var val = cache[path]
    if (val && val.compress && (yield fs.exists(val.compress.path))) return val

    var stats = yield fs.stat(path).catch(ignoreStatError)
    // we don't want to cache 404s because
    // the cache object will get infinitely large
    if (!stats || !stats.isFile()) return
    stats.path = path

    var file = cache[path] = {
      stats: stats,
      etag: '"' + (yield hash(path, algorithm)).toString(encoding) + '"',
      type: mime.contentType(extname(path)) || 'application/octet-stream',
    }

    if (!compressible(file.type)) return file

    // if we can compress this file, we create a .gz
    var compress = file.compress = {
      path: path + '.gz'
    }

    // delete old .gz files in case the file has been updated
    try {
      yield fs.unlink(compress.path)
    } catch (err) {}

    // save to a random file name first
    var tmp = path + '.' + random() + '.gz'
    yield function (done) {
      fs.createReadStream(path)
      .on('error', done)
      .pipe(zlib.createGzip())
      .on('error', done)
      .pipe(fs.createWriteStream(tmp))
      .on('error', done)
      .on('finish', done)
    }

    compress.stats = yield fs.stat(tmp).catch(ignoreStatError)

    // if the gzip size is larger than the original file,
    // don't bother gzipping
    if (compress.stats.size > stats.size) {
      delete file.compress
      yield fs.unlink(tmp)
    } else {
      // otherwise, rename to the correct path
      yield fs.rename(tmp, compress.path)
    }

    return file
  }
}

function ignoreStatError(err) {
  if (notfound[err.code]) return
  err.status = 500
  throw err
}

function leadingDot(path) {
  return '.' === basename(path)[0]
}

function random() {
  return Math.random().toString(36).slice(2)
}
