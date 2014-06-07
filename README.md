
# Koa File Server

An opinionated file server. Designed to sit behind a CDN.

- `sha256` etags and consequential 304s
- Caches `fs.stat()` calls
- Caches etag calculations
- OPTIONS and 405 support
- `index.html` files
- Optionally serve hidden files
- Caches gzipped versions of files
- SPDY Push support

Does not support:

- Dynamic files - assumes static files never change
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

### var file = yield* send(this, [path])

```js
var send = require('koa-file-server')(options).send
```

`serve.send()` allows you to serve files as a utility.
This is helpful for arbitrary paths.
The middleware also adds `var file = yield* this.fileServer.send(path)`.

`path` defaults to `this.request.path.slice(1)`,
removing the leading `/` to make the path relative.

For an example, see the middleware's source code.

### var file = yield* push(this, path, [options])

```js
var push = require('koa-file-server')(options).push
```

Optionally SPDY Push a file.
The middleware also adds `var file = yield* this.fileServer.send(path, [opts])`.

Unlike `send()`, `path` is required.
`path` must also be a relative path (without a leading `/`) relative to the `root`.
The push stream's URL will be `'/' + path`.
Errors will be thrown on unknown files.
The only `option` is `priority: 7`.
