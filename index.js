
var resolve = require('resolve-path')
var hash = require('hash-stream')
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
    path = path || ctx.request.path.slice(1) || ''

    // index file support
    var directory = path === '' || path.slice(-1) === '/'
    if (index && directory) path += 'index.html'

    // regular paths can not be absolute
    path = resolve(root, path)

    // hidden file support
    if (!hidden && leadingDot(path)) return

    var stats = yield* stat(path)
    if (!stats || !stats.isFile()) return // 404
    stats.path = path

    // proper method handling
    var method = ctx.request.method
    switch (method) {
      case 'HEAD':
      case 'GET':
        break // continue
      case 'OPTIONS':
        ctx.response.set('Allow', methods)
        ctx.response.status = 204
        return stats
      default:
        ctx.response.set('Allow', methods)
        ctx.response.status = 405
        return stats
    }

    ctx.response.status = 200
    ctx.response.etag = yield* calculate(path)
    ctx.response.lastModified = stats.mtime
    ctx.response.length = stats.size
    ctx.response.type = extname(path)

    if (cachecontrol) ctx.response.set('Cache-Control', cachecontrol)
    if (ctx.request.fresh) ctx.response.status = 304
    else if (method === 'GET') ctx.response.body = fs.createReadStream(path)

    return stats
  }

  function* calculate(path) {
    return (yield hash(path, algorithm)).toString(encoding)
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
