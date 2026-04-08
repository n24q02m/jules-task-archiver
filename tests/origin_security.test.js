const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '../content.js')
const mainWorldJsPath = path.join(__dirname, '../main-world.js')
const contentJsCode = fs.readFileSync(contentJsPath, 'utf8')
const mainWorldJsCode = fs.readFileSync(mainWorldJsPath, 'utf8')

function setupSandbox(origin = 'https://jules.google.com') {
  const listeners = []
  const messagesSent = []

  const windowMock = {
    origin,
    postMessage: (data, targetOrigin) => {
      messagesSent.push({ data, targetOrigin })
    },
    addEventListener: (event, handler) => {
      if (event === 'message') {
        listeners.push(handler)
      }
    },
    removeEventListener: (event, handler) => {
      if (event === 'message') {
        const index = listeners.indexOf(handler)
        if (index > -1) {
          listeners.splice(index, 1)
        }
      }
    },
    WIZ_global_data: {
      SNlM0e: 'token',
      cfb2h: 'build',
      FdrFJe: '123'
    }
  }

  // Circular reference for event.source === window checks
  windowMock.window = windowMock

  const chromeMock = {
    runtime: {
      onMessage: {
        addListener: () => {}
      },
      sendMessage: () => {}
    }
  }

  const sandbox = {
    window: windowMock,
    chrome: chromeMock,
    setTimeout: (cb) => { cb(); return 1; },
    clearTimeout: () => {},
    Date: { now: () => 1000 },
    Promise,
    console,
    location: { href: 'https://jules.google.com/u/0/' },
    URL,
    cachedConfig: null
  }

  vm.createContext(sandbox)
  return { sandbox, listeners, messagesSent, windowMock }
}

describe('Origin Security Tests', () => {
  it('content.js should reject messages from untrusted origins', () => {
    const { sandbox, listeners, windowMock } = setupSandbox()

    // Add export for testing
    const testableContentJs = contentJsCode + '\n; globalThis.test_getCachedConfig = () => cachedConfig; globalThis.test_setCachedConfig = (v) => { cachedConfig = v; };'

    vm.runInContext(testableContentJs, sandbox)

    // Check main listener
    assert.ok(listeners.length >= 1, 'Message listener should be registered')
    const listener = listeners[0]

    // Simulate valid message
    listener({
      source: windowMock,
      origin: windowMock.origin,
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { at: 'valid' } }
    })
    assert.strictEqual(sandbox.test_getCachedConfig().at, 'valid', 'Valid origin message should be processed')

    // Clear cache
    sandbox.test_setCachedConfig(null)

    // Simulate invalid message
    listener({
      source: windowMock,
      origin: 'https://evil.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { at: 'evil' } }
    })
    assert.strictEqual(sandbox.test_getCachedConfig(), null, 'Invalid origin message should be rejected')
  })

  it('main-world.js should reject messages from untrusted origins', () => {
    const { sandbox, listeners, messagesSent, windowMock } = setupSandbox()
    vm.runInContext(mainWorldJsCode, sandbox)

    // Get listener
    const listener = listeners[0]

    // Clear initial broadcast message
    messagesSent.length = 0

    // Simulate invalid message
    listener({
      source: windowMock,
      origin: 'https://evil.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(messagesSent.length, 0, 'Should not broadcast config for invalid origin')

    // Simulate valid message
    listener({
      source: windowMock,
      origin: windowMock.origin,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(messagesSent.length, 1, 'Should broadcast config for valid origin')
    assert.strictEqual(messagesSent[0].targetOrigin, windowMock.origin, 'Broadcast target origin should be window.origin')
  })

  it('content.js should use window.origin for target origin when requesting config', async () => {
    const { sandbox, messagesSent, windowMock } = setupSandbox()
    const testableContentJs = contentJsCode + '\n; globalThis.test_extractConfig = extractConfig; globalThis.test_setCachedConfig = (v) => { cachedConfig = v; };'
    vm.runInContext(testableContentJs, sandbox)

    sandbox.test_setCachedConfig(null)
    sandbox.test_extractConfig() // This will call window.postMessage

    const message = messagesSent.find(m => m.data.type === 'JULES_REQUEST_CONFIG')
    assert.ok(message, 'JULES_REQUEST_CONFIG message should be sent')
    assert.strictEqual(message.targetOrigin, windowMock.origin, 'Target origin should be window.origin')
  })
})