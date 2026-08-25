'use strict'

const reusify = require('reusify')
const { pathToRegexp } = require('path-to-regexp')

function middie (complete, options) {
  const middlewares = []
  const pool = reusify(Holder)
  const opts = options || {}
  const ignoreDuplicateSlashes = opts.ignoreDuplicateSlashes === true
  const useSemicolonDelimiter = opts.useSemicolonDelimiter === true
  const ignoreTrailingSlash = opts.ignoreTrailingSlash === true
  const normalizationOptions = {
    ignoreDuplicateSlashes,
    useSemicolonDelimiter,
    ignoreTrailingSlash
  }

  return {
    use,
    run
  }

  function use (url, f) {
    if (f === undefined) {
      f = url
      url = null
    }

    let regexp
    if (url) {
      regexp = pathToRegexp(sanitizePrefixUrl(url), [], {
        end: false,
        strict: true
      })
    }

    if (Array.isArray(f)) {
      for (const val of f) {
        middlewares.push({
          regexp,
          fn: val
        })
      }
    } else {
      middlewares.push({
        regexp,
        fn: f
      })
    }

    return this
  }

  function run (req, res, ctx) {
    if (!middlewares.length) {
      complete(null, req, res, ctx)
      return
    }

    req.originalUrl = req.url

    const sanitizedUrl = sanitizeUrl(req.url)

    const holder = pool.get()
    holder.req = req
    holder.res = res
    holder.sanitizedUrl = sanitizedUrl
    holder.normalizedUrl = normalizePathForMatching(sanitizedUrl, normalizationOptions)
    holder.urlSuffix = req.url.slice(sanitizedUrl.length)
    holder.context = ctx
    holder.done()
  }

  function Holder () {
    this.next = null
    this.req = null
    this.res = null
    this.sanitizedUrl = null
    this.normalizedUrl = null
    this.urlSuffix = null
    this.context = null
    this.i = 0

    const that = this
    this.done = function (err) {
      const req = that.req
      const res = that.res
      const sanitizedUrl = that.sanitizedUrl
      const normalizedUrl = that.normalizedUrl
      const urlSuffix = that.urlSuffix
      const context = that.context
      const i = that.i++

      req.url = req.originalUrl

      if (res.finished === true || res.writableEnded === true) {
        that.req = null
        that.res = null
        that.sanitizedUrl = null
        that.normalizedUrl = null
        that.urlSuffix = null
        that.context = null
        that.i = 0
        pool.release(that)
        return
      }

      if (err || middlewares.length === i) {
        complete(err, req, res, context)
        that.req = null
        that.res = null
        that.sanitizedUrl = null
        that.normalizedUrl = null
        that.urlSuffix = null
        that.context = null
        that.i = 0
        pool.release(that)
      } else {
        const middleware = middlewares[i]
        const fn = middleware.fn
        const regexp = middleware.regexp
        if (regexp) {
          const result = regexp.exec(normalizedUrl)
          if (result) {
            // Strip the matched prefix from the raw (only query/fragment
            // stripped) url whenever it matches there too, so that the
            // percent-encoding of the remaining path is left untouched.
            const rawResult = regexp.exec(sanitizedUrl)
            if (rawResult) {
              req.url = sanitizedUrl.slice(rawResult[0].length)
              if (ignoreDuplicateSlashes) {
                req.url = removeDuplicateSlashes(req.url)
              }
              if (ignoreTrailingSlash) {
                req.url = trimLastSlash(req.url)
              }
            } else {
              req.url = normalizedUrl.slice(result[0].length)
            }
            if (req.url[0] !== '/') {
              req.url = '/' + req.url
            }
            req.url = req.url + urlSuffix
            fn(req, res, that.done)
          } else {
            that.done()
          }
        } else {
          fn(req, res, that.done)
        }
      }
    }
  }
}

function decodeUrlPath (url) {
  try {
    return decodeURIComponent(url)
  } catch (e) {
    return url
  }
}

function sanitizeUrl (url) {
  /* eslint-disable-next-line no-var */
  for (var i = 0, len = url.length; i < len; i++) {
    const charCode = url.charCodeAt(i)
    if (charCode === 63 || charCode === 35) {
      return url.slice(0, i)
    }
  }
  return url
}

function sanitizePrefixUrl (url) {
  if (url === '') return url
  if (url === '/') return ''
  if (url[url.length - 1] === '/') return url.slice(0, -1)
  return url
}

// Drops the query string (`?`), the fragment (`#`) and, when the router is
// configured to use it, the path parameters delimiter (`;`), then decodes
// what is left, the same way the router sanitizes an incoming url.
function sanitizeUrlPath (url, useSemicolonDelimiter) {
  /* eslint-disable-next-line no-var */
  for (var i = 0, len = url.length; i < len; i++) {
    const charCode = url.charCodeAt(i)
    if (charCode === 63 || charCode === 35 || (useSemicolonDelimiter === true && charCode === 59)) {
      return decodeUrlPath(url.slice(0, i))
    }
  }
  return decodeUrlPath(url)
}

function removeDuplicateSlashes (path) {
  return path.replace(/\/\/+/g, '/')
}

function trimLastSlash (path) {
  if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
    return path.slice(0, -1)
  }
  return path
}

// Applies the very same normalization the router applies before looking up a
// route, so that a middleware mounted on a prefix cannot be skipped by a url
// the router does normalize down to that prefix.
function normalizePathForMatching (url, options) {
  let path = url

  if (options.ignoreDuplicateSlashes) {
    path = removeDuplicateSlashes(path)
  }

  path = sanitizeUrlPath(path, options.useSemicolonDelimiter)

  if (options.ignoreTrailingSlash) {
    path = trimLastSlash(path)
  }

  return path
}

module.exports = middie
