
# Koa File Server

An opinionated file server. Designed to sit behind a CDN.

- Crypto-based etags and consequential 304s
- OPTIONS and 405 support
- Index files
- Serve hidden files

Does not support:

- Directory listing
- Path decoding

## API

```js
var app = require('koa')()
app.use(require('compress')())
app.use(require('koa-file-server')(options))
```

Options are:

- `root` <process.cwd()> - root directory. nothing above this root directory can be served
- `maxage` - cache control max age
- `etag` - options for etags
  - `algorithm` <sha256> - hashing algorithm to use
  - `encoding` <base64> - encoding to use
- `index` - serve `index.html` files
- `hidden` <false> - show hidden files which leading `.`s

### stats = yield* send.call(this, [path])

`var serve = require('koa-file-server')(options)` returns koa middleware, but there is also `serve.send()` which will allow you to serve files on a per-file basis. This is helpful for arbitrary paths.

You must `.call(this)`. `path` defaults to `this.request.path.slice(1)`, removing the leading `/` to make the path relative.

```js
var serve = require('koa-file-server')(options)
var send = serve.send

app.use(function* (next) {
  yield* next // process downstream middleware
  if (this.response.status) return // response is already handled
  yield* send.call(this) // try serving this path
})
```
