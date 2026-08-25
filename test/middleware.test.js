'use strict'

// Original Fastify test/middlewares.test.js file

const t = require('tap')
const test = t.test
const sget = require('simple-get').concat
const fastify = require('fastify')
const fp = require('fastify-plugin')
const cors = require('cors')
const helmet = require('helmet')
const fs = require('node:fs')
const { pathToRegexp } = require('path-to-regexp')

const middiePlugin = require('../index')

test('use a middleware', t => {
  t.plan(7)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      const useRes = instance.use(function (req, res, next) {
        t.pass('middleware called')
        next()
      })

      t.equal(useRes, instance)
    })

  instance.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  instance.listen({ port: 0 }, err => {
    t.error(err)

    t.teardown(instance.server.close.bind(instance.server))

    sget({
      method: 'GET',
      url: 'http://localhost:' + instance.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.equal(response.statusCode, 200)
      t.equal(response.headers['content-length'], '' + body.length)
      t.same(JSON.parse(body), { hello: 'world' })
    })
  })
})

test('use cors', t => {
  t.plan(3)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(cors())
    })

  instance.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  instance.listen({ port: 0 }, err => {
    t.error(err)

    t.teardown(instance.server.close.bind(instance.server))

    sget({
      method: 'GET',
      url: 'http://localhost:' + instance.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.equal(response.headers['access-control-allow-origin'], '*')
    })
  })
})

test('use helmet', t => {
  t.plan(3)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(helmet())
    })

  instance.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  instance.listen({ port: 0 }, err => {
    t.error(err)

    t.teardown(instance.server.close.bind(instance.server))

    sget({
      method: 'GET',
      url: 'http://localhost:' + instance.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.ok(response.headers['x-xss-protection'])
    })
  })
})

test('use helmet and cors', t => {
  t.plan(4)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(cors())
      instance.use(helmet())
    })

  instance.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  instance.listen({ port: 0 }, err => {
    t.error(err)

    t.teardown(instance.server.close.bind(instance.server))

    sget({
      method: 'GET',
      url: 'http://localhost:' + instance.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.ok(response.headers['x-xss-protection'])
      t.equal(response.headers['access-control-allow-origin'], '*')
    })
  })
})

test('middlewares with prefix', t => {
  t.plan(5)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (req, res, next) {
        req.global = true
        next()
      })
      instance.use('', function (req, res, next) {
        req.global2 = true
        next()
      })
      instance.use('/', function (req, res, next) {
        req.root = true
        next()
      })
      instance.use('/prefix', function (req, res, next) {
        req.prefixed = true
        next()
      })
      instance.use('/prefix/', function (req, res, next) {
        req.slashed = true
        next()
      })
    })

  function handler (request, reply) {
    reply.send({
      prefixed: request.raw.prefixed,
      slashed: request.raw.slashed,
      global: request.raw.global,
      global2: request.raw.global2,
      root: request.raw.root
    })
  }

  instance.get('/', handler)
  instance.get('/prefix', handler)
  instance.get('/prefix/', handler)
  instance.get('/prefix/inner', handler)

  instance.listen({ port: 0 }, err => {
    t.error(err)
    t.teardown(instance.server.close.bind(instance.server))

    t.test('/', t => {
      t.plan(2)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/',
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.same(body, {
          global: true,
          global2: true,
          root: true
        })
      })
    })

    t.test('/prefix', t => {
      t.plan(2)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/prefix',
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.same(body, {
          prefixed: true,
          global: true,
          global2: true,
          root: true,
          slashed: true
        })
      })
    })

    t.test('/prefix/', t => {
      t.plan(2)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/prefix/',
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.same(body, {
          prefixed: true,
          slashed: true,
          global: true,
          global2: true,
          root: true
        })
      })
    })

    t.test('/prefix/inner', t => {
      t.plan(2)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/prefix/inner',
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.same(body, {
          prefixed: true,
          slashed: true,
          global: true,
          global2: true,
          root: true
        })
      })
    })
  })
})

test('middlewares for encoded paths', t => {
  t.plan(3)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use('/encoded', function (req, _res, next) {
        req.slashed = true
        next()
      })
      instance.use('/%65ncoded', function (req, _res, next) {
        req.slashedSpecial = true
        next()
      })
    })

  function handler (request, reply) {
    reply.send({
      slashed: request.raw.slashed,
      slashedSpecial: request.raw.slashedSpecial
    })
  }

  instance.get('/encoded', handler)
  instance.get('/%65ncoded', handler)

  instance.listen({ port: 0 }, err => {
    t.error(err)
    t.teardown(instance.server.close.bind(instance.server))

    t.test('decode the request url and run the middleware', t => {
      t.plan(2)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/%65ncod%65d',
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.same(body, { slashed: true })
      })
    })

    t.test('does not double decode the url', t => {
      t.plan(2)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/%2565ncoded',
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.same(body, { slashedSpecial: true })
      })
    })
  })
})

// The url a middleware prefix is matched against must be normalized exactly the
// way the router normalizes the url it routes on, otherwise a crafted url that
// the router maps onto a guarded prefix skips every middleware of that prefix.
const API_KEY = 'mock-api-key-123'

function guardMiddie (req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    res.statusCode = 401
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Unauthorized', where: 'middie /secret guard' }))
    return
  }
  next()
}

async function buildGuarded (t, routerOptions, hook) {
  const instance = fastify(routerOptions)
  t.teardown(() => instance.close())

  await instance.register(middiePlugin, hook ? { hook } : undefined)
  instance.use('/secret', guardMiddie)

  instance.get('/secret', async () => ({ ok: true, route: '/secret' }))
  instance.get('/secret/data', async () => ({ ok: true, route: '/secret/data' }))

  return instance
}

function buildPlain (t, routerOptions) {
  const instance = fastify(routerOptions)
  t.teardown(() => instance.close())

  instance.get('/secret', async () => ({ ok: true, route: '/secret' }))
  instance.get('/secret/data', async () => ({ ok: true, route: '/secret/data' }))

  return instance
}

async function buildCapturing (t, routerOptions, prefix, routes) {
  const state = { url: null }
  const instance = fastify(routerOptions)
  t.teardown(() => instance.close())

  await instance.register(middiePlugin)
  instance.use(prefix, function (req, _res, next) {
    state.url = req.url
    next()
  })

  for (const route of routes) {
    instance.get(route, async () => ({ ok: true }))
  }

  state.inject = async function (url) {
    state.url = null
    await instance.inject({ method: 'GET', url })
    return state.url
  }

  return state
}

// Matching the prefix against the raw url is what let the crafted variants
// below skip the guard: the very same regexp `use('/secret', fn)` builds does
// not match them, while the router does route them onto the `/secret` route.
test('the prefix regexp alone does not match the crafted variants', t => {
  t.plan(7)

  const regexp = pathToRegexp('/secret', [], { end: false, strict: true })

  t.ok(regexp.exec('/secret'), '/secret matches the raw url')
  t.ok(regexp.exec('/secret/data'), '/secret/data matches the raw url')
  t.notOk(regexp.exec('/secret;foo=bar'), '/secret;foo=bar does not match the raw url')
  t.notOk(regexp.exec('//secret'), '//secret does not match the raw url')
  t.notOk(regexp.exec('///secret'), '///secret does not match the raw url')
  t.notOk(regexp.exec('//secret;foo=bar'), '//secret;foo=bar does not match the raw url')
  t.notOk(regexp.exec('//secret//'), '//secret// does not match the raw url')
})

test('semicolon delimited paths do not bypass a prefixed middleware', async t => {
  const guarded = await buildGuarded(t)
  const plain = buildPlain(t)

  const urls = ['/secret;foo=bar', '/secret;foo=bar?x=1', '/secret;jsessionid=1234']

  for (const url of urls) {
    const control = await plain.inject({ method: 'GET', url })
    const secured = await guarded.inject({ method: 'GET', url })

    t.equal(control.statusCode, 200, `${url} is routed to the /secret handler`)
    t.equal(secured.statusCode, 401, `${url} must be blocked by the middie guard`)
  }

  const allowed = await guarded.inject({
    method: 'GET',
    url: '/secret;foo=bar',
    headers: { 'x-api-key': API_KEY }
  })
  t.equal(allowed.statusCode, 200, 'an authenticated request still goes through')
})

test('duplicate slashes do not bypass a prefixed middleware', async t => {
  const routerOptions = { ignoreDuplicateSlashes: true }
  const guarded = await buildGuarded(t, routerOptions)
  const plain = buildPlain(t, routerOptions)

  const urls = ['//secret', '//secret/data', '/secret//data', '///secret']

  for (const url of urls) {
    const control = await plain.inject({ method: 'GET', url })
    const secured = await guarded.inject({ method: 'GET', url })

    t.equal(control.statusCode, 200, `${url} is routed to a /secret route`)
    t.equal(secured.statusCode, 401, `${url} must be blocked by the middie guard`)
  }
})

test('a trailing slash does not bypass a prefixed middleware', async t => {
  const routerOptions = { ignoreTrailingSlash: true }
  const guarded = await buildGuarded(t, routerOptions)
  const plain = buildPlain(t, routerOptions)

  const urls = ['/secret', '/secret/', '/secret/data/']

  for (const url of urls) {
    const control = await plain.inject({ method: 'GET', url })
    const secured = await guarded.inject({ method: 'GET', url })

    t.equal(control.statusCode, 200, `${url} is routed to a /secret route`)
    t.equal(secured.statusCode, 401, `${url} must be blocked by the middie guard`)
  }
})

test('combined normalizations do not bypass a prefixed middleware', async t => {
  const routerOptions = {
    ignoreDuplicateSlashes: true,
    ignoreTrailingSlash: true,
    useSemicolonDelimiter: true
  }
  const guarded = await buildGuarded(t, routerOptions)
  const plain = buildPlain(t, routerOptions)

  const urls = ['//secret;foo=bar', '//secret//', '//secret;foo=bar/', '//secret//data//']

  for (const url of urls) {
    const control = await plain.inject({ method: 'GET', url })
    const secured = await guarded.inject({ method: 'GET', url })

    t.equal(control.statusCode, 200, `${url} is routed to a /secret route`)
    t.equal(secured.statusCode, 401, `${url} must be blocked by the middie guard`)
  }
})

test('crafted paths are blocked whichever hook middie is registered on', async t => {
  for (const hook of ['onRequest', 'preValidation', 'preHandler']) {
    const routerOptions = {
      ignoreDuplicateSlashes: true,
      ignoreTrailingSlash: true,
      useSemicolonDelimiter: true
    }
    const guarded = await buildGuarded(t, routerOptions, hook)

    for (const url of ['/secret', '//secret', '/secret;foo=bar', '/secret/', '//secret;foo=bar/']) {
      const res = await guarded.inject({ method: 'GET', url })
      t.equal(res.statusCode, 401, `hook=${hook} url=${url} must be blocked by the middie guard`)
    }
  }
})

test('req.url stripping with duplicate slashes', async t => {
  const state = await buildCapturing(t, { ignoreDuplicateSlashes: true }, '/secret', ['/secret/data'])

  t.equal(await state.inject('/secret/data'), '/data', 'normal path should strip to /data')
  t.equal(await state.inject('//secret/data'), '/data', '//secret/data should strip to /data, not //data')
  t.equal(await state.inject('/secret//data'), '/data', '/secret//data should strip to /data, not //data')
})

test('req.url stripping with semicolon delimiter', async t => {
  const state = await buildCapturing(t, { useSemicolonDelimiter: true }, '/secret', ['/secret', '/secret/data'])

  t.equal(await state.inject('/secret'), '/', 'normal path should strip to /')
  t.equal(await state.inject('/secret;foo=bar'), '/', '/secret;foo=bar should strip to /, not /;foo=bar')
  // the semicolon delimiter treats everything after `;` as path parameters, so
  // /secret;foo=bar/data has the path /secret, not /secret/data
  t.equal(await state.inject('/secret;foo=bar/data'), '/', '/secret;foo=bar/data has path /secret, strips to /')
})

test('req.url stripping with trailing slash', async t => {
  const state = await buildCapturing(t, { ignoreTrailingSlash: true }, '/secret', ['/secret', '/secret/data'])

  t.equal(await state.inject('/secret'), '/', 'normal path should strip to /')
  t.equal(await state.inject('/secret/'), '/', '/secret/ should strip to /')
  t.equal(await state.inject('/secret/data/'), '/data', '/secret/data/ should strip to /data')
})

test('req.url stripping with all normalization options combined', async t => {
  const state = await buildCapturing(t, {
    ignoreDuplicateSlashes: true,
    useSemicolonDelimiter: true,
    ignoreTrailingSlash: true
  }, '/secret', ['/secret', '/secret/data'])

  t.equal(await state.inject('//secret;foo=bar/'), '/', '//secret;foo=bar/ should strip to /')
  t.equal(await state.inject('//secret//data//'), '/data', '//secret//data// should strip to /data')
})

test('req.url stripping preserves the query string', async t => {
  const state = await buildCapturing(t, undefined, '/api', ['/api/resource'])

  t.equal(await state.inject('/api/resource?foo=bar'), '/resource?foo=bar', 'single query param preserved')
  t.equal(await state.inject('/api/resource?foo=bar&baz=qux'), '/resource?foo=bar&baz=qux', 'multiple query params preserved')
  t.equal(await state.inject('/api/resource?a=1&b=2&c=3'), '/resource?a=1&b=2&c=3', 'many query params preserved')
})

test('req.url stripping preserves the query string with normalization options', async t => {
  const state = await buildCapturing(t, {
    ignoreDuplicateSlashes: true,
    ignoreTrailingSlash: true
  }, '/secret', ['/secret/data'])

  t.equal(await state.inject('//secret/data?key=value'), '/data?key=value', '//secret/data?key=value preserves query string')
  t.equal(await state.inject('/secret//data/?key=value'), '/data?key=value', '/secret//data/?key=value preserves query string')
})

test('req.url stripping preserves percent-encoded characters', async t => {
  const state = await buildCapturing(t, undefined, '/prefix', ['/prefix/*'])

  t.equal(await state.inject('/prefix/hello%20world'), '/hello%20world', 'percent-encoded space preserved')
  t.equal(await state.inject('/prefix/hello%20world%2Ffoo'), '/hello%20world%2Ffoo', 'percent-encoded slash preserved')
  t.equal(await state.inject('/prefix/path%2Fwith%2Fslashes'), '/path%2Fwith%2Fslashes', 'multiple percent-encoded slashes preserved')
  t.equal(await state.inject('/prefix/%E4%B8%AD%E6%96%87'), '/%E4%B8%AD%E6%96%87', 'percent-encoded unicode preserved')
})

test('router option combinations: crafted variants never bypass the middie guard', async t => {
  const variants = [
    '/secret',
    '//secret',
    '/secret/',
    '/secret?x=1',
    '/secret;foo=bar',
    '/secret;foo=bar?x=1',
    '//secret;foo=bar',
    '//secret//',
    '/%2fsecret',
    '/%2Fsecret',
    '/secret%2F'
  ]
  const hooks = [undefined, 'onRequest', 'preValidation', 'preHandler']

  for (const hook of hooks) {
    for (const ignoreDuplicateSlashes of [false, true]) {
      for (const ignoreTrailingSlash of [false, true]) {
        for (const useSemicolonDelimiter of [false, true]) {
          const routerOptions = { ignoreDuplicateSlashes, ignoreTrailingSlash, useSemicolonDelimiter }
          const label = `hook=${hook || 'default'} dup=${ignoreDuplicateSlashes},trail=${ignoreTrailingSlash},semi=${useSemicolonDelimiter}`

          const guarded = await buildGuarded(t, routerOptions, hook)
          const plain = buildPlain(t, routerOptions)

          for (const url of variants) {
            const control = await plain.inject({ method: 'GET', url })
            const secured = await guarded.inject({ method: 'GET', url })

            t.not(secured.statusCode, 200, `${label} url=${url} should never bypass auth as 200`)

            if (control.statusCode === 200) {
              t.equal(secured.statusCode, 401, `${label} url=${url} matches a route; middie must block it`)
            }
          }
        }
      }
    }
  }
})

test('res.end should block middleware execution', t => {
  t.plan(4)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (req, res, next) {
        res.end('hello')
      })

      instance.use(function (req, res, next) {
        t.fail('we should not be here')
      })
    })

  instance.addHook('onRequest', (req, res, next) => {
    t.ok('called')
    next()
  })

  instance.addHook('preHandler', (req, reply, next) => {
    t.fail('this should not be called')
  })

  instance.addHook('onSend', (req, reply, payload, next) => {
    t.fail('this should not be called')
  })

  instance.addHook('onResponse', (request, reply, next) => {
    t.ok('called')
    next()
  })

  instance.get('/', function (request, reply) {
    t.fail('we should no be here')
  })

  instance.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.equal(res.payload, 'hello')
  })
})

test('middlewares should be able to respond with a stream', t => {
  t.plan(4)

  const instance = fastify()

  instance.addHook('onRequest', (req, res, next) => {
    t.ok('called')
    next()
  })

  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (req, res, next) {
        const stream = fs.createReadStream(process.cwd() + '/test/middleware.test.js', 'utf8')
        stream.pipe(res)
        res.once('finish', next)
      })

      instance.use(function (req, res, next) {
        t.fail('we should not be here')
      })
    })

  instance.addHook('preHandler', (req, reply, next) => {
    t.fail('this should not be called')
  })

  instance.addHook('onSend', (req, reply, payload, next) => {
    t.fail('this should not be called')
  })

  instance.addHook('onResponse', (request, reply, next) => {
    t.ok('called')
    next()
  })

  instance.get('/', function (request, reply) {
    t.fail('we should no be here')
  })

  instance.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
  })
})

test('Use a middleware inside a plugin after an encapsulated plugin', t => {
  t.plan(4)
  const f = fastify()
  f.register(middiePlugin)

  f.register(function (instance, opts, next) {
    instance.use(function (req, res, next) {
      t.ok('first middleware called')
      next()
    })

    instance.get('/', function (request, reply) {
      reply.send({ hello: 'world' })
    })

    next()
  })

  f.register(fp(function (instance, opts, next) {
    instance.use(function (req, res, next) {
      t.ok('second middleware called')
      next()
    })

    next()
  }))

  f.inject('/', (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.same(JSON.parse(res.payload), { hello: 'world' })
  })
})

test('middlewares should run in the order in which they are defined', t => {
  t.plan(9)
  const f = fastify()
  f.register(middiePlugin)

  f.register(fp(function (instance, opts, next) {
    instance.use(function (req, res, next) {
      t.equal(req.previous, undefined)
      req.previous = 1
      next()
    })

    instance.register(fp(function (i, opts, next) {
      i.use(function (req, res, next) {
        t.equal(req.previous, 2)
        req.previous = 3
        next()
      })
      next()
    }))

    instance.use(function (req, res, next) {
      t.equal(req.previous, 1)
      req.previous = 2
      next()
    })

    next()
  }))

  f.register(function (instance, opts, next) {
    instance.use(function (req, res, next) {
      t.equal(req.previous, 3)
      req.previous = 4
      next()
    })

    instance.get('/', function (request, reply) {
      t.equal(request.raw.previous, 5)
      reply.send({ hello: 'world' })
    })

    instance.register(fp(function (i, opts, next) {
      i.use(function (req, res, next) {
        t.equal(req.previous, 4)
        req.previous = 5
        next()
      })
      next()
    }))

    next()
  })

  f.inject('/', (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.same(JSON.parse(res.payload), { hello: 'world' })
  })
})

test('should not double-prefix inherited middleware paths in child scopes', async function (t) {
  t.plan(3)

  const instance = fastify()
  t.teardown(instance.close.bind(instance))

  await instance.register(middiePlugin)

  instance.use('/admin', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  instance.get('/admin/root-data', function (request, reply) {
    reply.send({ data: 'root-secret' })
  })

  await instance.register(async function (child) {
    child.get('/secret', function (request, reply) {
      reply.send({ data: 'child-secret' })
    })
  }, { prefix: '/admin' })

  const rootNoAuth = await instance.inject({ method: 'GET', url: '/admin/root-data' })
  t.equal(rootNoAuth.statusCode, 403)

  const childNoAuth = await instance.inject({ method: 'GET', url: '/admin/secret' })
  t.equal(childNoAuth.statusCode, 403)

  const childWithAuth = await instance.inject({
    method: 'GET',
    url: '/admin/secret',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(childWithAuth.statusCode, 200)
})

test('should allow child scopes register middleware with same prefix', async function (t) {
  t.plan(7)

  const instance = fastify()
  t.teardown(instance.close.bind(instance))

  await instance.register(middiePlugin)

  const count = { admin: 0, child: 0 }

  instance.use('/admin', function (req, res, next) {
    count.admin++
    next()
  })

  instance.get('/admin/root-data', function (request, reply) {
    reply.send({ data: 'admin' })
  })

  await instance.register(async function (child) {
    child.use('/admin', function (req, res, next) {
      count.child++
      next()
    })

    child.get('/secret', function (request, reply) {
      reply.send({ data: 'child' })
    })

    child.get('/admin', function (request, reply) {
      reply.send({ data: 'child-admin' })
    })
  }, { prefix: '/admin' })

  const root = await instance.inject({ method: 'GET', url: '/admin/root-data' })
  t.equal(root.statusCode, 200)
  t.same(JSON.parse(root.payload), { data: 'admin' })

  const child = await instance.inject({ method: 'GET', url: '/admin/secret' })
  t.equal(child.statusCode, 200)
  t.same(JSON.parse(child.payload), { data: 'child' })

  const childAdmin = await instance.inject({ method: 'GET', url: '/admin/admin' })
  t.equal(childAdmin.statusCode, 200)
  t.same(JSON.parse(childAdmin.payload), { data: 'child-admin' })

  t.same(count, { admin: 3, child: 1 })
})

test('should enforce inherited middleware in nested grandchild scopes', async function (t) {
  t.plan(6)

  const instance = fastify()
  t.teardown(instance.close.bind(instance))

  await instance.register(middiePlugin)

  instance.use('/admin', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  instance.get('/admin/root-data', function (request, reply) {
    reply.send({ data: 'root-secret' })
  })

  await instance.register(async function (parent) {
    parent.get('/info', function (request, reply) {
      reply.send({ data: 'parent-info' })
    })

    await parent.register(async function (grandchild) {
      grandchild.get('/deep', function (request, reply) {
        reply.send({ data: 'nested-secret' })
      })
    }, { prefix: '/sub' })
  }, { prefix: '/admin' })

  const rootNoAuth = await instance.inject({ method: 'GET', url: '/admin/root-data' })
  t.equal(rootNoAuth.statusCode, 403)

  const parentNoAuth = await instance.inject({ method: 'GET', url: '/admin/info' })
  t.equal(parentNoAuth.statusCode, 403)

  const grandchildNoAuth = await instance.inject({ method: 'GET', url: '/admin/sub/deep' })
  t.equal(grandchildNoAuth.statusCode, 403)

  const grandchildWithAuth = await instance.inject({
    method: 'GET',
    url: '/admin/sub/deep',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(grandchildWithAuth.statusCode, 200)
  t.same(JSON.parse(grandchildWithAuth.payload), { data: 'nested-secret' })

  const parentWithAuth = await instance.inject({
    method: 'GET',
    url: '/admin/info',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(parentWithAuth.statusCode, 200)
})

test('should enforce inherited middleware across three nesting levels', async function (t) {
  t.plan(3)

  const instance = fastify()
  t.teardown(instance.close.bind(instance))

  await instance.register(middiePlugin)

  instance.use('/api', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  await instance.register(async function (l1) {
    await l1.register(async function (l2) {
      await l2.register(async function (l3) {
        l3.get('/resource', function (request, reply) {
          reply.send({ data: 'deep-resource' })
        })
      }, { prefix: '/c' })
    }, { prefix: '/b' })
  }, { prefix: '/api/a' })

  const noAuth = await instance.inject({ method: 'GET', url: '/api/a/b/c/resource' })
  t.equal(noAuth.statusCode, 403)

  const withAuth = await instance.inject({
    method: 'GET',
    url: '/api/a/b/c/resource',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(withAuth.statusCode, 200)
  t.same(JSON.parse(withAuth.payload), { data: 'deep-resource' })
})

test('should not apply middleware to unrelated nested prefixes', async function (t) {
  t.plan(4)

  const instance = fastify()
  t.teardown(instance.close.bind(instance))

  await instance.register(middiePlugin)

  instance.use('/admin', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  await instance.register(async function (child) {
    child.get('/data', function (request, reply) {
      reply.send({ data: 'public' })
    })

    await child.register(async function (grandchild) {
      grandchild.get('/info', function (request, reply) {
        reply.send({ data: 'public-nested' })
      })
    }, { prefix: '/nested' })
  }, { prefix: '/public' })

  const publicData = await instance.inject({ method: 'GET', url: '/public/data' })
  t.equal(publicData.statusCode, 200)
  t.same(JSON.parse(publicData.payload), { data: 'public' })

  const publicNested = await instance.inject({ method: 'GET', url: '/public/nested/info' })
  t.equal(publicNested.statusCode, 200)
  t.same(JSON.parse(publicNested.payload), { data: 'public-nested' })
})

test('should not apply middleware when prefix shares string prefix but not path segment', async function (t) {
  t.plan(4)

  const instance = fastify()
  t.teardown(instance.close.bind(instance))

  await instance.register(middiePlugin)

  instance.use('/admin', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  await instance.register(async function (child) {
    child.get('/settings', function (request, reply) {
      reply.send({ data: 'panel-settings' })
    })
  }, { prefix: '/admin-panel' })

  await instance.register(async function (child) {
    child.get('/settings', function (request, reply) {
      reply.send({ data: 'admin-settings' })
    })
  }, { prefix: '/admin/real' })

  const panelNoAuth = await instance.inject({ method: 'GET', url: '/admin-panel/settings' })
  t.equal(panelNoAuth.statusCode, 200)
  t.same(JSON.parse(panelNoAuth.payload), { data: 'panel-settings' })

  const realNoAuth = await instance.inject({ method: 'GET', url: '/admin/real/settings' })
  t.equal(realNoAuth.statusCode, 403)

  const realWithAuth = await instance.inject({
    method: 'GET',
    url: '/admin/real/settings',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(realWithAuth.statusCode, 200)
})

test('should enforce middleware with partial prefix overlap in nested scopes', async function (t) {
  t.plan(3)

  const instance = fastify()
  t.teardown(instance.close.bind(instance))

  await instance.register(middiePlugin)

  instance.use('/admin', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  await instance.register(async function (child) {
    await child.register(async function (grandchild) {
      grandchild.get('/settings', function (request, reply) {
        reply.send({ data: 'admin-settings' })
      })
    }, { prefix: '/panel' })
  }, { prefix: '/admin' })

  const noAuth = await instance.inject({ method: 'GET', url: '/admin/panel/settings' })
  t.equal(noAuth.statusCode, 403)

  const withAuth = await instance.inject({
    method: 'GET',
    url: '/admin/panel/settings',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(withAuth.statusCode, 200)
  t.same(JSON.parse(withAuth.payload), { data: 'admin-settings' })
})

// A guard mounted on the root path is rewritten to the child prefix by the
// prefixing `use`, so it is the grandchild scope that loses it: `/` becomes
// `/admin` in the child and `/admin/sub/admin` in the grandchild.
test('should not narrow a middleware mounted on the root path in nested scopes', async function (t) {
  t.plan(4)

  const instance = fastify()
  t.teardown(instance.close.bind(instance))

  await instance.register(middiePlugin)

  instance.use('/', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  await instance.register(async function (child) {
    child.get('/data', function (request, reply) {
      reply.send({ data: 'child' })
    })

    await child.register(async function (grandchild) {
      grandchild.get('/deep', function (request, reply) {
        reply.send({ data: 'grandchild' })
      })
    }, { prefix: '/sub' })
  }, { prefix: '/admin' })

  const childNoAuth = await instance.inject({ method: 'GET', url: '/admin/data' })
  t.equal(childNoAuth.statusCode, 403)

  const grandchildNoAuth = await instance.inject({ method: 'GET', url: '/admin/sub/deep' })
  t.equal(grandchildNoAuth.statusCode, 403)

  const grandchildWithAuth = await instance.inject({
    method: 'GET',
    url: '/admin/sub/deep',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(grandchildWithAuth.statusCode, 200)
  t.same(JSON.parse(grandchildWithAuth.payload), { data: 'grandchild' })
})
