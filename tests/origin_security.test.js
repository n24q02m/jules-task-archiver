const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldScriptPath = path.join(__dirname, '..', 'main-world.js')
const contentScriptPath = path.join(__dirname, '..', 'content.js')

const mainWorldScriptContent = fs.readFileSync(mainWorldScriptPath, 'utf8')
const contentScriptContent = fs.readFileSync(contentScriptPath, 'utf8')

describe('Origin Security Tests', () => {
  it('main-world.js uses secure window.origin for postMessage and checks event origin', () => {
    let postMessageArgs = []
    let messageListener = null

    const windowMock = {
      WIZ_global_data: {},
      postMessage: (data, targetOrigin) => {
        postMessageArgs.push({ data, targetOrigin })
      },
      addEventListener: (type, listener) => {
        if (type === 'message') {
          messageListener = listener
        }
      },
      origin: 'https://jules.google.com',
      fetch: async () => ({})
    }
    // Setup self-referential property
    windowMock.window = windowMock

    const sandbox = {
      window: windowMock,
      Date: { now: () => 1234567890 }
    }
    vm.createContext(sandbox)

    vm.runInContext(mainWorldScriptContent, sandbox)

    // Initial postMessage should use window.origin
    assert.strictEqual(postMessageArgs.length > 0, true, 'postMessage should have been called')
    assert.strictEqual(
      postMessageArgs[0].targetOrigin,
      'https://jules.google.com',
      'Target origin should be window.origin, not "*"'
    )

    // Verify message listener checks origin
    assert.ok(messageListener, 'Message listener should be registered')

    // Test rejection of untrusted origin
    postMessageArgs = [] // Reset
    messageListener({
      source: windowMock,
      origin: 'https://evil.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })
    assert.strictEqual(postMessageArgs.length, 0, 'Listener should reject message from untrusted origin')

    // Test acceptance of trusted origin
    messageListener({
      source: windowMock,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })
    assert.strictEqual(postMessageArgs.length, 1, 'Listener should accept message from trusted origin')
  })

  it('content.js uses secure window.origin for postMessage and checks event origin', async () => {
    const postMessageArgs = []
    const messageListeners = []

    const windowMock = {
      postMessage: (data, targetOrigin) => {
        postMessageArgs.push({ data, targetOrigin })
      },
      addEventListener: (type, listener) => {
        if (type === 'message') {
          messageListeners.push(listener)
        }
      },
      removeEventListener: () => {},
      origin: 'https://jules.google.com'
    }
    windowMock.window = windowMock

    const chromeMock = {
      runtime: {
        sendMessage: () => {},
        onMessage: {
          addListener: () => {}
        }
      }
    }

    const sandbox = {
      window: windowMock,
      chrome: chromeMock,
      Date: { now: () => 1234567890 },
      setTimeout: () => {},
      clearTimeout: () => {},
      Promise,
      URL: class {
        constructor() {
          this.pathname = '/u/0/'
        }
      },
      location: { href: 'https://jules.google.com/u/0/' }
    }
    vm.createContext(sandbox)

    // Run the script to register the initial listener and the extractConfig function
    const scriptContent = `${contentScriptContent}\nglobalThis.test_extractConfig = extractConfig;`
    vm.runInContext(scriptContent, sandbox)

    // Verify the global message listener checks origin
    const globalListener = messageListeners[0]
    assert.ok(globalListener, 'Global message listener should be registered')

    // Simulate evil origin message
    const _cachedConfigSet = false
    sandbox.cachedConfig = null // Accessing cachedConfig directly via vm might not work cleanly, let's just ensure no exception occurs
    globalListener({
      source: windowMock,
      origin: 'https://evil.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { test: true } }
    })

    // Test extractConfig postMessage and listener
    const extractPromise = sandbox.test_extractConfig()

    assert.strictEqual(postMessageArgs.length, 1, 'postMessage should have been called')
    assert.strictEqual(
      postMessageArgs[0].targetOrigin,
      'https://jules.google.com',
      'Target origin should be window.origin, not "*"'
    )

    // Trigger the handler returned from extractConfig (which is now registered)
    const extractListener = messageListeners[1]
    assert.ok(extractListener, 'Extract config listener should be registered')

    // Send message from evil origin
    extractListener({
      source: windowMock,
      origin: 'https://evil.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { safe: false } }
    })

    // Send message from correct origin to resolve the promise
    extractListener({
      source: windowMock,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { safe: true } }
    })

    const config = await extractPromise
    assert.strictEqual(config.safe, true, 'Should resolve with config from trusted origin')
  })
})
