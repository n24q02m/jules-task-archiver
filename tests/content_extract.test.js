const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '../content.js')
const contentJsCode = fs.readFileSync(contentJsPath, 'utf8')

function setupEnvironment() {
  const listeners = new Map()
  const runtimeListeners = []
  let postMessageCalled = false
  let lastPostMessage = null

  const chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://id/${path}`,
      sendMessage: () => {},
      onMessage: {
        addListener: (fn) => runtimeListeners.push(fn)
      }
    }
  }

  const document = {
    createElement: () => ({
      src: '',
      remove: () => {},
      onload: () => {}
    }),
    head: {
      appendChild: () => {}
    },
    documentElement: {
      appendChild: () => {}
    }
  }

  const window = {
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type).push(fn)
    },
    removeEventListener: (type, fn) => {
      if (!listeners.has(type)) return
      const arr = listeners.get(type)
      const idx = arr.indexOf(fn)
      if (idx !== -1) arr.splice(idx, 1)
    },
    postMessage: (data, _targetOrigin) => {
      postMessageCalled = true
      lastPostMessage = data
    },
    location: {
      origin: 'https://jules.google.com',
      href: 'https://jules.google.com/u/0/session'
    }
  }

  const sandbox = {
    chrome,
    document,
    window,
    console,
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
    Date,
    Promise,
    URL,
    location: window.location,
    // Helpers for testing
    fireMessage: (data, origin = 'https://jules.google.com') => {
      const event = { source: window, origin, data }
      const handlers = [...(listeners.get('message') || [])]
      handlers.forEach((fn) => {
        fn(event)
      })
    },
    getListenerCount: (type) => (listeners.get(type) || []).length,
    wasPostMessageCalled: () => postMessageCalled,
    getLastPostMessage: () => lastPostMessage,
    resetPostMessage: () => {
      postMessageCalled = false
      lastPostMessage = null
    }
  }

  vm.createContext(sandbox)
  vm.runInContext(contentJsCode, sandbox)

  return sandbox
}

// Helper to normalize objects from sandbox
function normalize(obj) {
  if (obj === null || obj === undefined) return obj
  return JSON.parse(JSON.stringify(obj))
}

describe('content.js extractConfig', () => {
  it('should return cached config if it is fresh', async () => {
    const sandbox = setupEnvironment()
    const now = Date.now()
    const config = { at: 'test-token', timestamp: now }

    // Populate cache by firing a message
    sandbox.fireMessage({ type: 'JULES_ARCHIVER_CONFIG', config })

    sandbox.resetPostMessage()
    const result = await sandbox.extractConfig()

    assert.deepStrictEqual(normalize(result), config)
    assert.strictEqual(sandbox.wasPostMessageCalled(), false, 'Should not have called postMessage for fresh cache')
  })

  it('should request fresh config if cache is missing', async () => {
    const sandbox = setupEnvironment()
    const newConfig = { at: 'fresh-token', timestamp: Date.now() }

    const promise = sandbox.extractConfig()

    assert.strictEqual(sandbox.wasPostMessageCalled(), true)
    assert.deepStrictEqual(normalize(sandbox.getLastPostMessage()), { type: 'JULES_REQUEST_CONFIG' })

    // Simulate response from main world
    sandbox.fireMessage({ type: 'JULES_ARCHIVER_CONFIG', config: newConfig })

    const result = await promise
    assert.deepStrictEqual(normalize(result), newConfig)
  })

  it('should request fresh config if cache is old (> 5 min)', async () => {
    const sandbox = setupEnvironment()
    const oldTime = Date.now() - 301000 // 5 min 1 sec ago
    const oldConfig = { at: 'old-token', timestamp: oldTime }

    // Populate cache with old data
    sandbox.fireMessage({ type: 'JULES_ARCHIVER_CONFIG', config: oldConfig })

    const newConfig = { at: 'new-token', timestamp: Date.now() }
    const promise = sandbox.extractConfig()

    assert.strictEqual(sandbox.wasPostMessageCalled(), true, 'Should have called postMessage for old cache')

    // Simulate response
    sandbox.fireMessage({ type: 'JULES_ARCHIVER_CONFIG', config: newConfig })

    const result = await promise
    assert.deepStrictEqual(normalize(result), newConfig)
  })

  it('should resolve with current cached value on timeout', async (t) => {
    t.mock.timers.enable()
    const sandbox = setupEnvironment()

    const oldTime = Date.now() - 400000
    const oldConfig = { at: 'stale-token', timestamp: oldTime }
    sandbox.fireMessage({ type: 'JULES_ARCHIVER_CONFIG', config: oldConfig })

    const promise = sandbox.extractConfig()

    t.mock.timers.tick(2000)

    const result = await promise
    assert.deepStrictEqual(normalize(result), oldConfig, 'Should resolve with stale config on timeout')
  })

  it('should resolve with null on timeout if no cache exists', async (t) => {
    t.mock.timers.enable()
    const sandbox = setupEnvironment()

    const promise = sandbox.extractConfig()

    t.mock.timers.tick(2000)

    const result = await promise
    assert.strictEqual(result, null)
  })

  it('should remove message listener on timeout', async (t) => {
    t.mock.timers.enable()
    const sandbox = setupEnvironment()

    // Initial listeners (should be 1 for the global listener)
    const initialCount = sandbox.getListenerCount('message')

    const promise = sandbox.extractConfig()
    assert.strictEqual(sandbox.getListenerCount('message'), initialCount + 1, 'Should have added a temporary listener')

    t.mock.timers.tick(2000)
    await promise

    assert.strictEqual(
      sandbox.getListenerCount('message'),
      initialCount,
      'Should have removed the temporary listener on timeout'
    )
  })
})
