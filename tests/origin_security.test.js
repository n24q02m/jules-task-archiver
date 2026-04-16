const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '../content.js')
const contentJsContent = fs.readFileSync(contentJsPath, 'utf8')

const mainWorldJsPath = path.join(__dirname, '../main-world.js')
const mainWorldJsContent = fs.readFileSync(mainWorldJsPath, 'utf8')

describe('Origin Security Tests', () => {
  it('content.js: global listener should ignore messages from different origins', () => {
    let messageHandler = null
    const sandbox = {
      window: {
        origin: 'https://jules.google.com',
        addEventListener: (type, handler) => {
          if (type === 'message') messageHandler = handler
        },
        postMessage: () => {}
      },
      chrome: {
        runtime: {
          getURL: () => '',
          sendMessage: () => {},
          onMessage: { addListener: () => {} }
        }
      },
      document: {
        createElement: () => ({ onload: null, remove: () => {} }),
        head: {
          appendChild: (el) => {
            if (el.onload) el.onload()
          }
        },
        documentElement: { appendChild: () => {} }
      },
      console,
      setTimeout,
      clearTimeout,
      Promise,
      URL
    }
    sandbox.window.location = { href: 'https://jules.google.com' }
    vm.createContext(sandbox)
    vm.runInContext(contentJsContent, sandbox)

    assert.ok(messageHandler, 'Message handler should be registered')

    let receivedCount = 0
    sandbox.chrome.runtime.sendMessage = () => {
      receivedCount++
    }

    // This should be ignored
    messageHandler({
      origin: 'https://evil.com',
      source: sandbox.window,
      data: { type: 'JULES_START_CONFIG', config: {} }
    })
    assert.strictEqual(receivedCount, 0, 'Message from different origin should be ignored')

    // This should NOT be ignored
    messageHandler({
      origin: 'https://jules.google.com',
      source: sandbox.window,
      data: { type: 'JULES_START_CONFIG', config: {} }
    })
    assert.strictEqual(receivedCount, 1, 'Message from same origin should be processed')
  })

  it('content.js: extractConfig listener should ignore messages from different origins', async () => {
    let lastHandler = null
    const sandbox = {
      window: {
        origin: 'https://jules.google.com',
        addEventListener: (_type, handler) => {
          lastHandler = handler
        },
        removeEventListener: () => {},
        postMessage: () => {}
      },
      chrome: {
        runtime: {
          getURL: () => '',
          sendMessage: () => {},
          onMessage: { addListener: () => {} }
        }
      },
      document: {
        createElement: () => ({ onload: null, remove: () => {} }),
        head: {
          appendChild: (el) => {
            if (el.onload) el.onload()
          }
        },
        documentElement: { appendChild: () => {} }
      },
      console,
      setTimeout,
      clearTimeout,
      Promise,
      Date,
      URL
    }
    sandbox.window.location = { href: 'https://jules.google.com' }
    vm.createContext(sandbox)
    vm.runInContext(contentJsContent, sandbox)

    // Call extractConfig to trigger the local listener
    const extractPromise = sandbox.extractConfig()

    // The last handler registered should be the one in extractConfig
    const extractHandler = lastHandler

    // Simulate message from different origin
    extractHandler({
      origin: 'https://evil.com',
      source: sandbox.window,
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { val: 'evil' } }
    })

    // Simulate message from same origin
    extractHandler({
      origin: 'https://jules.google.com',
      source: sandbox.window,
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { val: 'good', timestamp: Date.now() } }
    })

    const result = await extractPromise
    assert.strictEqual(result.val, 'good', 'extractConfig should only accept message from same origin')
  })

  it('main-world.js: listener should ignore messages from different origins', () => {
    let messageHandler = null
    const postMessageCalls = []
    const sandbox = {
      window: {
        origin: 'https://jules.google.com',
        addEventListener: (type, handler) => {
          if (type === 'message') messageHandler = handler
        },
        postMessage: (data, target) => {
          postMessageCalls.push({ data, target })
        },
        WIZ_global_data: { SNlM0e: 'token' }
      },
      console,
      Date,
      String,
      JSON,
      URLSearchParams
    }
    vm.createContext(sandbox)
    vm.runInContext(mainWorldJsContent, sandbox)

    assert.ok(messageHandler, 'Message handler should be registered')

    // Initial broadcast
    const initCount = postMessageCalls.length
    assert.strictEqual(
      postMessageCalls[0].target,
      'https://jules.google.com',
      'Initial broadcast should use correct origin'
    )

    // Simulate message from different origin
    messageHandler({
      origin: 'https://evil.com',
      source: sandbox.window,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })
    assert.strictEqual(postMessageCalls.length, initCount, 'Should NOT re-broadcast for different origin')

    // Simulate message from same origin
    messageHandler({
      origin: 'https://jules.google.com',
      source: sandbox.window,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })
    assert.strictEqual(postMessageCalls.length, initCount + 1, 'Should re-broadcast for same origin')
    assert.strictEqual(
      postMessageCalls[initCount].target,
      'https://jules.google.com',
      'Re-broadcast should use correct origin'
    )
  })
})
