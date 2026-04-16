const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('Origin Security: window.postMessage', () => {
  const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')
  const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')

  function setupSandbox(initialOrigin = 'https://jules.google.com') {
    const postMessages = []
    const listeners = []

    const sandbox = {
      window: {
        postMessage: (msg, targetOrigin) => {
          postMessages.push({ msg, targetOrigin })
          // Simulate immediate delivery for JULES_REQUEST_CONFIG
          if (msg.type === 'JULES_REQUEST_CONFIG') {
            for (const l of listeners) {
              l({
                source: sandbox.window,
                origin: sandbox.window.origin,
                data: msg
              })
            }
          }
        },
        origin: initialOrigin,
        addEventListener: (type, handler) => {
          if (type === 'message') listeners.push(handler)
        },
        removeEventListener: (type, handler) => {
          if (type === 'message') {
            const idx = listeners.indexOf(handler)
            if (idx !== -1) listeners.splice(idx, 1)
          }
        }
      },
      Date: { now: () => 12345 },
      String: String,
      JSON: JSON,
      URLSearchParams: class {
        get() {
          return JSON.stringify([[['rpcId', '{"2":"config","9":{"4":[]}}']]])
        }
      },
      URL: URL,
      location: { href: 'https://jules.google.com/u/0/' },
      console: console,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      Promise: Promise,
      chrome: {
        runtime: {
          getURL: (path) => path,
          sendMessage: () => {},
          onMessage: {
            addListener: () => {}
          }
        }
      },
      document: {
        createElement: () => ({ src: '', onload: () => {} }),
        head: { appendChild: () => {} },
        documentElement: { appendChild: () => {} }
      }
    }
    sandbox.window.window = sandbox.window
    vm.createContext(sandbox)
    return { sandbox, postMessages, listeners }
  }

  it('main-world.js should use window.origin as targetOrigin for JULES_ARCHIVER_CONFIG', () => {
    const { sandbox, postMessages } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    const archiverConfig = postMessages.find((m) => m.msg.type === 'JULES_ARCHIVER_CONFIG')
    assert.ok(archiverConfig, 'Should have sent JULES_ARCHIVER_CONFIG')
    assert.strictEqual(
      archiverConfig.targetOrigin,
      sandbox.window.origin,
      'JULES_ARCHIVER_CONFIG should use window.origin'
    )
  })

  it('main-world.js should use window.origin as targetOrigin for JULES_START_CONFIG', async () => {
    const { sandbox, postMessages } = setupSandbox()

    // Setup fetch mock
    sandbox.window.fetch = async (_url, _opts) => {
      return { ok: true }
    }

    vm.runInContext(mainWorldJs, sandbox)

    // Trigger fetch to trigger JULES_START_CONFIG
    const mockFetch = sandbox.window.fetch
    await mockFetch('https://jules.google.com/_/Swebot/data/batchexecute?rpcids=Rja83d', {
      body: 'f.req=%5B%5B%5B%22Rja83d%22%2C%22%5Bnull%2Cnull%2C%5B%5D%5D%22%2Cnull%2C%22generic%22%5D%5D%5D'
    })

    const startConfig = postMessages.find((m) => m.msg.type === 'JULES_START_CONFIG')
    assert.ok(startConfig, 'Should have sent JULES_START_CONFIG')
    assert.strictEqual(startConfig.targetOrigin, sandbox.window.origin, 'JULES_START_CONFIG should use window.origin')
  })

  it('main-world.js should reject messages from different origin', () => {
    const { sandbox, postMessages, listeners } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    // Clear initial broadcast
    postMessages.length = 0

    // Simulate message from different origin
    for (const l of listeners) {
      l({
        source: sandbox.window,
        origin: 'https://evil.com',
        data: { type: 'JULES_REQUEST_CONFIG' }
      })
    }

    assert.strictEqual(postMessages.length, 0, 'Should not have responded to message from different origin')
  })

  it('content.js should use window.origin for JULES_REQUEST_CONFIG', async () => {
    const { sandbox, postMessages } = setupSandbox()
    vm.runInContext(contentJs, sandbox)

    vm.runInContext('extractConfig()', sandbox)

    const requestConfig = postMessages.find((m) => m.msg.type === 'JULES_REQUEST_CONFIG')
    assert.ok(requestConfig, 'Should have sent JULES_REQUEST_CONFIG')
    assert.strictEqual(requestConfig.targetOrigin, sandbox.window.origin)
  })

  it('content.js should reject messages from different origin', () => {
    const { sandbox, listeners } = setupSandbox()
    vm.runInContext(contentJs, sandbox)

    for (const l of listeners) {
      l({
        source: sandbox.window,
        origin: 'https://evil.com',
        data: { type: 'JULES_ARCHIVER_CONFIG', config: { secret: 'data' } }
      })
    }

    const result = vm.runInContext('cachedConfig', sandbox)
    assert.strictEqual(result, null, 'Should not have updated cachedConfig from different origin')
  })
})
