const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldPath = path.join(__dirname, '..', 'main-world.js')
const contentScriptPath = path.join(__dirname, '..', 'content.js')

function setupSandbox() {
  const messages = []
  const listeners = []

  const windowMock = {
    origin: 'https://jules.google.com',
    location: { origin: 'https://jules.google.com' },
    postMessage: (data, targetOrigin) => {
      messages.push({ data, targetOrigin })
    },
    addEventListener: (type, listener) => {
      if (type === 'message') {
        listeners.push(listener)
      }
    },
    removeEventListener: (type, listener) => {
      if (type === 'message') {
        const idx = listeners.indexOf(listener)
        if (idx !== -1) listeners.splice(idx, 1)
      }
    },
    WIZ_global_data: {
      SNlM0e: 'at',
      cfb2h: 'bl',
      FdrFJe: 'fsid'
    }
  }

  const chromeMock = {
    runtime: {
      getURL: (path) => path,
      sendMessage: () => {},
      onMessage: { addListener: () => {} }
    }
  }

  const documentMock = {
    createElement: () => ({ src: '', onload: () => {} }),
    head: { appendChild: () => {} },
    documentElement: { appendChild: () => {} }
  }

  const sandbox = {
    window: windowMock,
    document: documentMock,
    chrome: chromeMock,
    console,
    setTimeout,
    clearTimeout,
    Date,
    URL,
    URLSearchParams,
    Promise
  }

  // Attach window properties to global scope as scripts expect
  Object.assign(sandbox, windowMock)

  vm.createContext(sandbox)
  return { sandbox, messages, listeners }
}

describe('Origin Security', () => {
  it('main-world.js should use window.origin in postMessage and verify origin in listener', () => {
    const { sandbox, messages, listeners } = setupSandbox()
    const code = fs.readFileSync(mainWorldPath, 'utf8')
    vm.runInContext(code, sandbox)

    // Check broadcastConfig call (immediate)
    const broadcastMsg = messages.find((m) => m.data.type === 'JULES_ARCHIVER_CONFIG')
    assert.ok(broadcastMsg, 'Should have sent JULES_ARCHIVER_CONFIG')
    assert.strictEqual(broadcastMsg.targetOrigin, 'https://jules.google.com', 'targetOrigin should be window.origin')

    // Check listener
    assert.strictEqual(listeners.length, 1, 'Should have 1 message listener')
    const listener = listeners[0]

    sandbox.broadcastCalled = false
    // Override broadcastConfig to check if it's called
    vm.runInContext(
      'const _orig = broadcastConfig; broadcastConfig = () => { globalThis.broadcastCalled = true; _orig(); }',
      sandbox
    )

    // Simulate malicious message
    listener({
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })
    assert.strictEqual(sandbox.broadcastCalled, false, 'Should ignore message from evil origin')

    // Simulate valid message
    listener({
      source: sandbox.window,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })
    assert.strictEqual(sandbox.broadcastCalled, true, 'Should accept message from valid origin')
  })

  it('content.js should use window.origin in postMessage and verify origin in listener', async () => {
    const { sandbox, messages, listeners } = setupSandbox()

    const code = `${fs.readFileSync(contentScriptPath, 'utf8')}; globalThis.getCachedConfig = () => cachedConfig;`
    vm.runInContext(code, sandbox)

    // Check listener
    const mainListener = listeners[0]
    assert.ok(mainListener, 'Should have a message listener')

    // Simulate malicious config message
    mainListener({
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { at: 'stolen' } }
    })
    assert.strictEqual(sandbox.getCachedConfig(), null, 'Should not update cachedConfig from evil origin')

    // Simulate valid config message
    const now = Date.now()
    mainListener({
      source: sandbox.window,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { at: 'valid', timestamp: now } }
    })
    assert.deepStrictEqual(sandbox.getCachedConfig().at, 'valid', 'Should update cachedConfig from valid origin')

    // Check extractConfig postMessage
    messages.length = 0 // clear
    // We must ensure cachedConfig is NOT fresh to trigger postMessage
    vm.runInContext('cachedConfig.timestamp = 0', sandbox)
    sandbox.extractConfig()
    const requestMsg = messages.find((m) => m.data.type === 'JULES_REQUEST_CONFIG')
    assert.ok(requestMsg, 'Should have sent JULES_REQUEST_CONFIG')
    assert.strictEqual(requestMsg.targetOrigin, 'https://jules.google.com', 'targetOrigin should be window.origin')
  })
})
