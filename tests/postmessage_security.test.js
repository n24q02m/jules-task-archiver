const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldPath = path.join(__dirname, '..', 'main-world.js')
const mainWorldContent = fs.readFileSync(mainWorldPath, 'utf8')

const contentJsPath = path.join(__dirname, '..', 'content.js')
const contentJsContent = fs.readFileSync(contentJsPath, 'utf8')

function setupMainWorldSandbox() {
  const messagesSent = []
  const listeners = []

  const sandbox = {
    window: {
      origin: 'https://jules.google.com',
      addEventListener: (type, handler) => {
        if (type === 'message') listeners.push(handler)
      },
      postMessage: (data, targetOrigin) => {
        messagesSent.push({ data, targetOrigin })
      },
      WIZ_global_data: {
        TSDtV: 'beyond:models/gemini-pro',
        SNlM0e: 'at-token',
        cfb2h: 'build-label',
        FdrFJe: 'fsid-token'
      },
      __julesArchiver: false,
      fetch: async () => ({})
    },
    console: { log: () => {}, error: () => {} },
    Date: { now: () => 123456789 },
    String: String,
    URLSearchParams: URLSearchParams,
    JSON: JSON
  }
  sandbox.window.window = sandbox.window
  sandbox.addEventListener = sandbox.window.addEventListener
  sandbox.postMessage = sandbox.window.postMessage
  sandbox.origin = sandbox.window.origin

  vm.createContext(sandbox)
  vm.runInContext(mainWorldContent, sandbox)

  return { sandbox, messagesSent, listeners }
}

function setupContentJsSandbox() {
  const messagesSent = []
  const listeners = []
  const runtimeMessages = []

  const sandbox = {
    window: {
      origin: 'https://jules.google.com',
      addEventListener: (type, handler) => {
        if (type === 'message') listeners.push(handler)
      },
      removeEventListener: (_type, handler) => {
        const idx = listeners.indexOf(handler)
        if (idx !== -1) listeners.splice(idx, 1)
      },
      postMessage: (data, targetOrigin) => {
        messagesSent.push({ data, targetOrigin })
      }
    },
    chrome: {
      runtime: {
        sendMessage: (msg) => runtimeMessages.push(msg),
        onMessage: { addListener: () => {} }
      }
    },
    console: { log: () => {}, error: () => {} },
    Date: { now: () => 123456789 },
    URL: URL,
    location: { href: 'https://jules.google.com/u/0/' },
    Promise: Promise,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  }
  sandbox.window.window = sandbox.window
  sandbox.addEventListener = sandbox.window.addEventListener
  sandbox.postMessage = sandbox.window.postMessage
  sandbox.origin = sandbox.window.origin

  vm.createContext(sandbox)
  vm.runInContext(contentJsContent, sandbox)

  return { sandbox, messagesSent, listeners, runtimeMessages }
}

describe('PostMessage Security: main-world.js', () => {
  it('should only use window.origin as target for postMessage', () => {
    const { messagesSent } = setupMainWorldSandbox()
    assert.ok(messagesSent.length > 0)
    messagesSent.forEach((msg) => {
      assert.notStrictEqual(msg.targetOrigin, '*', 'Should not use wildcard origin')
      assert.strictEqual(msg.targetOrigin, 'https://jules.google.com')
    })
  })

  it('should verify event.origin in message listener', () => {
    const { sandbox, listeners, messagesSent } = setupMainWorldSandbox()
    const handler = listeners[listeners.length - 1]
    const initialCount = messagesSent.length

    // Simulate message from wrong origin
    handler({
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })
    assert.strictEqual(messagesSent.length, initialCount, 'Should ignore messages from wrong origin')

    // Simulate message from correct origin
    handler({
      source: sandbox.window,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })
    assert.ok(messagesSent.length > initialCount, 'Should respond to messages from correct origin')
  })
})

describe('PostMessage Security: content.js', () => {
  it('should use window.origin as target for postMessage when requesting config', async () => {
    const { sandbox, messagesSent } = setupContentJsSandbox()
    vm.runInContext('extractConfig()', sandbox)

    const reqMsg = messagesSent.find((m) => m.data?.type === 'JULES_REQUEST_CONFIG')
    assert.ok(reqMsg)
    assert.notStrictEqual(reqMsg.targetOrigin, '*', 'Should not use wildcard origin')
    assert.strictEqual(reqMsg.targetOrigin, 'https://jules.google.com')
  })

  it('should verify event.origin in message listener', () => {
    const { listeners, sandbox, runtimeMessages } = setupContentJsSandbox()
    const handler = listeners[0] // There is only one global listener in content.js for messages

    // Simulate message from wrong origin
    handler({
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_START_CONFIG', config: { foo: 'bar' } }
    })
    assert.strictEqual(runtimeMessages.length, 0, 'Should ignore messages from wrong origin')

    // Simulate message from correct origin
    handler({
      source: sandbox.window,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_START_CONFIG', config: { foo: 'bar' } }
    })
    assert.strictEqual(runtimeMessages.length, 1, 'Should process messages from correct origin')
  })
})
