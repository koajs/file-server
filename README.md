
# Koa File Server

An opinionated file server. Designed to sit behind a CDN.

- Crypto-based etags and consequential 304s
- Alias files
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

- `alias` - an object containing aliases
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

### Aliases

```js
{
  'apple-touch-icon.png': 'favicon.ico'
}
```

This would treat all `/apple-touch-icon.png` requests as `/favicon.ico` requests.

## License

The MIT License (MIT)

Copyright (c) 2014 Jonathan Ong me@jongleberry.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
