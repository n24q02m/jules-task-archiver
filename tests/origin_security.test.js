const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('Origin Security: window.postMessage and Listeners', () => {
  const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')
  const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')

  function setupSandbox() {
    const postMessages = []
    const listeners = []
    const origin = 'https://jules.google.com'

    const windowMock = {
      origin,
      postMessage: (data, targetOrigin) => {
        postMessages.push({ data, targetOrigin })
      },
      addEventListener: (type, handler) => {
        if (type === 'message') {
          listeners.push(handler)
        }
      },
      removeEventListener: (_type, _handler) => {
        // mock remove
      },
      WIZ_global_data: {
        SNlM0e: 'at-token',
        cfb2h: 'bl-token',
        FdrFJe: 'fsid-token',
        TSDtV: 'beyond:models/gemini-pro'
      },
      fetch: async () => ({})
    }

    const sandbox = {
      window: windowMock,
      URL: class {
        constructor(url) {
          this.href = url
          this.pathname = new URL(url, 'http://x.y').pathname
        }
      },
      setTimeout,
      clearTimeout,
      Date,
      Promise,
      console,
      URLSearchParams: class {
        get() {
          return null
        }
      }
    }
    // Self references
    windowMock.window = windowMock
    sandbox.postMessage = windowMock.postMessage.bind(windowMock)
    sandbox.addEventListener = windowMock.addEventListener.bind(windowMock)
    sandbox.removeEventListener = windowMock.removeEventListener.bind(windowMock)

    vm.createContext(sandbox)
    return { sandbox, postMessages, listeners, origin }
  }

  it('main-world.js should use window.origin in postMessage', () => {
    const { sandbox, postMessages, origin } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    assert.ok(postMessages.length > 0, 'Should have posted at least one message')
    postMessages.forEach((msg) => {
      assert.strictEqual(msg.targetOrigin, origin, 'Target origin should be restricted to window.origin')
    })
  })

  it('main-world.js listener should reject messages from different origin', () => {
    const { sandbox, listeners, origin } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    sandbox.broadcastCalled = false
    // Override broadcastConfig to check if it's called
    vm.runInContext(
      'const _orig = broadcastConfig; broadcastConfig = () => { globalThis.broadcastCalled = true; _orig(); }',
      sandbox
    )

    const handler = listeners[0]
    handler({
      origin: 'https://evil.com',
      source: sandbox.window,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(sandbox.broadcastCalled, false, 'Should not broadcast config if origin is different')

    handler({
      origin: origin,
      source: sandbox.window,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(sandbox.broadcastCalled, true, 'Should broadcast config if origin matches')
  })

  it('content.js should use window.origin in extractConfig postMessage', async () => {
    // Mock chrome.runtime.sendMessage
    const { sandbox, postMessages, origin } = setupSandbox()
    sandbox.chrome = {
      runtime: { sendMessage: () => {}, onMessage: { addListener: () => {} } }
    }
    vm.runInContext(contentJs, sandbox)

    // Trigger extractConfig
    vm.runInContext('extractConfig()', sandbox)

    const pm = postMessages.find((m) => m.data.type === 'JULES_REQUEST_CONFIG')
    assert.ok(pm, 'Should have sent JULES_REQUEST_CONFIG')
    assert.strictEqual(pm.targetOrigin, origin, 'Target origin should be restricted to window.origin')
  })

  it('content.js listener should reject messages from different origin', () => {
    const { sandbox, listeners, origin } = setupSandbox()
    let lastSentMessage = null
    sandbox.chrome = {
      runtime: {
        sendMessage: (msg) => {
          lastSentMessage = msg
        },
        onMessage: { addListener: () => {} }
      }
    }
    vm.runInContext(contentJs, sandbox)

    const mainListener = listeners.find((l) => l.toString().includes('JULES_START_CONFIG'))
    assert.ok(mainListener, 'Should find the message listener')

    // Test JULES_START_CONFIG rejection
    mainListener({
      origin: 'https://evil.com',
      source: sandbox.window,
      data: { type: 'JULES_START_CONFIG', config: { some: 'data' } }
    })
    assert.strictEqual(lastSentMessage, null, 'Should not relay config if origin is different')

    mainListener({
      origin: origin,
      source: sandbox.window,
      data: { type: 'JULES_START_CONFIG', config: { some: 'data' } }
    })
    assert.ok(lastSentMessage, 'Should relay config if origin matches')
    assert.strictEqual(lastSentMessage.action, 'CACHE_START_CONFIG')
  })
})
