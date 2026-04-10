const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldPath = path.join(__dirname, '..', 'main-world.js')
const contentScriptPath = path.join(__dirname, '..', 'content.js')

function setupSandbox() {
  const postMessages = []
  const listeners = []

  const sandbox = {
    window: {
      origin: 'https://jules.google.com',
      WIZ_global_data: {
        SNlM0e: 'at',
        cfb2h: 'bl',
        FdrFJe: 'fsid'
      },
      postMessage: (data, origin) => {
        postMessages.push({ data, origin })
      },
      addEventListener: (type, handler) => {
        if (type === 'message') {
          listeners.push(handler)
        }
      },
      removeEventListener: () => {},
      fetch: async () => ({ ok: true })
    },
    chrome: {
      runtime: {
        sendMessage: () => {},
        onMessage: { addListener: () => {} }
      }
    },
    console,
    setTimeout,
    clearTimeout,
    Date,
    URL,
    location: { href: 'https://jules.google.com/u/0/' },
    Promise
  }
  sandbox.postMessage = sandbox.window.postMessage
  sandbox.addEventListener = sandbox.window.addEventListener

  vm.createContext(sandbox)
  return { sandbox, postMessages, listeners }
}

describe('Origin Security', () => {
  it('main-world.js should use secure target origin in postMessage', () => {
    const { sandbox, postMessages } = setupSandbox()
    const code = fs.readFileSync(mainWorldPath, 'utf8')
    vm.runInContext(code, sandbox)

    assert.ok(postMessages.length > 0, 'Should have called postMessage')
    postMessages.forEach((msg) => {
      assert.strictEqual(msg.origin, 'https://jules.google.com', 'postMessage should use restricted origin')
    })
  })

  it('content.js should use secure target origin in postMessage', async () => {
    const { sandbox, postMessages } = setupSandbox()
    const code = fs.readFileSync(contentScriptPath, 'utf8')
    vm.runInContext(code, sandbox)

    // In content.js extractConfig is top-level so it should be available if not wrapped in IIFE
    const extractConfig = sandbox.extractConfig
    if (extractConfig) {
      extractConfig()
      const requestMsg = postMessages.find((m) => m.data?.type === 'JULES_REQUEST_CONFIG')
      assert.ok(requestMsg, 'Should have sent JULES_REQUEST_CONFIG')
      assert.strictEqual(requestMsg.origin, 'https://jules.google.com', 'postMessage should use restricted origin')
    }
  })

  it('Listeners should verify event origin', () => {
    // This is a bit tricky to test with side effects, but we can check if they block wrong origins
    const { sandbox, listeners, postMessages } = setupSandbox()
    const mwCode = fs.readFileSync(mainWorldPath, 'utf8')
    vm.runInContext(mwCode, sandbox)

    // The listener in main-world.js is index 0
    const mwListener = listeners[0]

    const initialCount = postMessages.length

    // Message from wrong origin
    mwListener({
      origin: 'https://evil.com',
      source: sandbox.window,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(postMessages.length, initialCount, 'Should NOT respond to message from wrong origin')

    // Message from correct origin
    mwListener({
      origin: 'https://jules.google.com',
      source: sandbox.window,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.ok(postMessages.length > initialCount, 'Should respond to message from correct origin')
  })
})
