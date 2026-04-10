const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')
const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')

function setupSandbox() {
  const messagesSent = []
  const listeners = []

  const window = {
    origin: 'https://jules.google.com',
    WIZ_global_data: {
      SNlM0e: 'token',
      cfb2h: 'label',
      FdrFJe: 'fsid'
    },
    addEventListener: (type, handler) => {
      if (type === 'message') {
        listeners.push(handler)
      }
    },
    removeEventListener: (type, handler) => {
      if (type === 'message') {
        const idx = listeners.indexOf(handler)
        if (idx !== -1) listeners.splice(idx, 1)
      }
    },
    postMessage: (data, origin) => {
      messagesSent.push({ data, origin })
    }
  }

  const chrome = {
    runtime: {
      sendMessage: () => {},
      onMessage: {
        addListener: () => {}
      }
    }
  }

  const sandbox = {
    window,
    chrome,
    console,
    Date,
    URL,
    location: { href: 'https://jules.google.com/u/0/' },
    setTimeout: (fn) => fn(),
    clearTimeout: () => {}
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)

  return { sandbox, messagesSent, listeners, window }
}

describe('Origin Security Tests', () => {
  it('main-world.js should send config to window.origin (Secure)', () => {
    const { sandbox, messagesSent } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    assert.ok(messagesSent.length >= 1)
    assert.strictEqual(messagesSent[0].origin, 'https://jules.google.com')
  })

  it('content.js should send config request to window.origin (Secure)', () => {
    const { sandbox, messagesSent } = setupSandbox()
    vm.runInContext(contentJs, sandbox)

    sandbox.extractConfig()

    const requestMessage = messagesSent.find((m) => m.data.type === 'JULES_REQUEST_CONFIG')
    assert.ok(requestMessage)
    assert.strictEqual(requestMessage.origin, 'https://jules.google.com')
  })

  it('main-world.js listener should REJECT messages from different origin (Secure)', () => {
    const { sandbox, listeners } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    const messagesSent = []
    sandbox.window.postMessage = (data, origin) => {
      messagesSent.push({ data, origin })
    }

    const handler = listeners[0]
    assert.ok(handler)

    handler({
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(messagesSent.length, 0, 'Should NOT have responded to evil origin')

    // Should accept from correct origin
    handler({
      source: sandbox.window,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })
    assert.ok(messagesSent.some((m) => m.data.type === 'JULES_ARCHIVER_CONFIG'))
  })

  it('content.js listener should REJECT messages from different origin (Secure)', () => {
    const { sandbox, listeners } = setupSandbox()
    vm.runInContext(contentJs, sandbox)

    let messageReceived = false
    sandbox.chrome.runtime.sendMessage = (msg) => {
      if (msg.action === 'CACHE_START_CONFIG') messageReceived = true
    }

    const handler = listeners[0]
    assert.ok(handler)

    handler({
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_START_CONFIG', config: {} }
    })

    assert.strictEqual(messageReceived, false, 'Should NOT have processed message from evil origin')

    handler({
      source: sandbox.window,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_START_CONFIG', config: {} }
    })
    assert.strictEqual(messageReceived, true, 'Should HAVE processed message from correct origin')
  })
})
