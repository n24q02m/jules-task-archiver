const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '../content.js')
const contentJsCode = fs.readFileSync(contentJsPath, 'utf8')

function setupEnvironment() {
  const listeners = new Map()
  let runtimeListener = null
  let postMessageCalled = false
  let lastPostMessage = null
  const sentMessages = []

  const chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://id/${path}`,
      sendMessage: (msg) => {
        sentMessages.push(msg)
      },
      onMessage: {
        addListener: (fn) => {
          runtimeListener = fn
        }
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
    TEST_MODE: true,
    // Helpers for testing
    fireMessage: (data, origin = 'https://jules.google.com', source = window) => {
      const event = { source, origin, data }
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
    },
    getSentMessages: () => sentMessages,
    fireRuntimeMessage: (msg, sender, sendResponse) => {
      if (runtimeListener) return runtimeListener(msg, sender, sendResponse)
    }
  }

  sandbox.globalThis = sandbox
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

    // Populate cache via direct access
    sandbox.test_cachedConfig.set(config)

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

    // Populate cache via direct access
    sandbox.test_cachedConfig.set(oldConfig)

    const newConfig = { at: 'new-token', timestamp: Date.now() }
    const promise = sandbox.extractConfig()

    assert.strictEqual(sandbox.wasPostMessageCalled(), true, 'Should have called postMessage for old cache')

    // Simulate response
    sandbox.fireMessage({ type: 'JULES_ARCHIVER_CONFIG', config: newConfig })

    const result = await promise
    assert.deepStrictEqual(normalize(result), newConfig)
  })

  it('should request fresh config if cache exists but lacks timestamp', async () => {
    const sandbox = setupEnvironment()
    const configNoTS = { at: 'no-ts-token' }

    // Populate cache via direct access
    sandbox.test_cachedConfig.set(configNoTS)

    const newConfig = { at: 'new-token', timestamp: Date.now() }
    const promise = sandbox.extractConfig()

    assert.strictEqual(sandbox.wasPostMessageCalled(), true, 'Should have called postMessage when timestamp is missing')

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
    sandbox.test_cachedConfig.set(oldConfig)

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

  it('should ignore untrusted window messages in extractConfig handler', async () => {
    const sandbox = setupEnvironment()
    const promise = sandbox.extractConfig()

    // Untrusted origin
    sandbox.fireMessage({ type: 'JULES_ARCHIVER_CONFIG', config: { at: 'evil' } }, 'https://evil.com')
    // Untrusted source
    sandbox.fireMessage({ type: 'JULES_ARCHIVER_CONFIG', config: { at: 'evil' } }, 'https://jules.google.com', {})

    // Message type mismatch
    sandbox.fireMessage({ type: 'OTHER_TYPE', config: { at: 'wrong' } })

    // Valid message should still work after noise
    const validConfig = { at: 'valid', timestamp: Date.now() }
    sandbox.fireMessage({ type: 'JULES_ARCHIVER_CONFIG', config: validConfig })

    const result = await promise
    assert.deepStrictEqual(normalize(result), validConfig)
  })
})

describe('content.js Message Listeners', () => {
  it('should relay JULES_START_CONFIG to background', () => {
    const sandbox = setupEnvironment()
    const startConfig = { modelConfig: { foo: 'bar' }, experimentIds: [1, 2] }

    sandbox.fireMessage({ type: 'JULES_START_CONFIG', config: startConfig })

    const sent = sandbox.getSentMessages()
    assert.strictEqual(sent.length, 1)
    assert.deepStrictEqual(normalize(sent[0]), {
      action: 'CACHE_START_CONFIG',
      config: startConfig
    })
  })

  it('should ignore untrusted JULES_START_CONFIG messages', () => {
    const sandbox = setupEnvironment()
    sandbox.fireMessage({ type: 'JULES_START_CONFIG', config: { bad: 1 } }, 'https://evil.com')
    assert.strictEqual(sandbox.getSentMessages().length, 0)
  })

  it('should handle PING runtime message', () => {
    const sandbox = setupEnvironment()
    let responseData = null
    sandbox.fireRuntimeMessage({ action: 'PING' }, {}, (response) => {
      responseData = response
    })
    assert.strictEqual(responseData.ok, true)
    assert.strictEqual(responseData.account, 'default')
  })

  it('should handle GET_CONFIG runtime message', async () => {
    const sandbox = setupEnvironment()
    const config = { at: 'tok', timestamp: Date.now() }
    sandbox.test_cachedConfig.set(config)

    let responseData = null
    const result = sandbox.fireRuntimeMessage({ action: 'GET_CONFIG' }, {}, (response) => {
      responseData = response
    })

    // It returns true for async response
    assert.strictEqual(result, true)

    // Wait for the promise in extractConfig to resolve
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepStrictEqual(normalize(responseData.config), config)
    assert.strictEqual(responseData.accountNum, '0')
    assert.strictEqual(responseData.account, 'default')
  })

  it('should handle unknown runtime message', () => {
    const sandbox = setupEnvironment()
    let responseData = null
    sandbox.fireRuntimeMessage({ action: 'UNKNOWN' }, {}, (response) => {
      responseData = response
    })
    assert.strictEqual(responseData.error, 'Unknown action')
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
