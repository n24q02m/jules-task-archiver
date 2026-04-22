const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldJsPath = path.join(__dirname, '..', 'main-world.js')
const contentJsPath = path.join(__dirname, '..', 'content.js')
const mainWorldJsContent = fs.readFileSync(mainWorldJsPath, 'utf8')
const contentJsContent = fs.readFileSync(contentJsPath, 'utf8')

describe('Cross-Origin Messaging Security', () => {
  it('should use window.origin and verify event.origin in main-world.js', () => {
    const postMessageCalls = []
    const listeners = {}

    const sandbox = {
      window: {
        origin: 'https://jules.google.com',
        postMessage: (message, targetOrigin) => {
          postMessageCalls.push({ message, targetOrigin })
        },
        addEventListener: (event, handler) => {
          listeners[event] = handler
        },
        WIZ_global_data: {
          SNlM0e: 'at-token',
          cfb2h: 'bl-token',
          FdrFJe: 'fsid-token'
        }
      },
      Date: { now: () => 1234567890 }
    }

    vm.createContext(sandbox)
    vm.runInContext(mainWorldJsContent, sandbox)

    // Verify initial broadcast uses window.origin
    assert.strictEqual(postMessageCalls.length, 1)
    assert.strictEqual(postMessageCalls[0].targetOrigin, 'https://jules.google.com')

    // Verify listener rejects messages from wrong origin
    const messageHandler = listeners.message
    assert.ok(messageHandler)

    const initialCallCount = postMessageCalls.length

    // Simulate message from evil origin
    messageHandler({
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(postMessageCalls.length, initialCallCount, 'Should not respond to wrong origin')

    // Simulate message from correct origin
    messageHandler({
      source: sandbox.window,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(postMessageCalls.length, initialCallCount + 1, 'Should respond to correct origin')
    assert.strictEqual(postMessageCalls[initialCallCount].targetOrigin, 'https://jules.google.com')
  })

  it('should use window.origin and verify event.origin in content.js', async () => {
    const postMessageCalls = []
    const listeners = []

    const sandbox = {
      window: {
        origin: 'https://jules.google.com',
        postMessage: (message, targetOrigin) => {
          postMessageCalls.push({ message, targetOrigin })
        },
        addEventListener: (event, handler) => {
          listeners.push({ event, handler })
        },
        removeEventListener: (_event, _handler) => {
          // We don't strictly need to implement this for the basic test
        }
      },
      document: {
        createElement: () => ({ remove: () => {} }),
        head: { appendChild: () => {} }
      },
      chrome: {
        runtime: {
          getURL: () => 'main-world.js',
          sendMessage: () => {},
          onMessage: { addListener: () => {} }
        }
      },
      setTimeout: () => 123,
      clearTimeout: () => {},
      Date: { now: () => 1234567890 },
      Promise,
      location: { href: 'https://jules.google.com/u/0/' },
      URL
    }

    // mock for test
    const scriptContent =
      contentJsContent +
      `
      globalThis.test_extractConfig = extractConfig;
    `

    vm.createContext(sandbox)
    vm.runInContext(scriptContent, sandbox)

    // Trigger extractConfig to send JULES_REQUEST_CONFIG
    const extractPromise = sandbox.test_extractConfig()

    // Verify it sent to window.origin
    assert.strictEqual(postMessageCalls.length, 1)
    assert.strictEqual(postMessageCalls[0].targetOrigin, 'https://jules.google.com')
    assert.strictEqual(postMessageCalls[0].message.type, 'JULES_REQUEST_CONFIG')

    // Find the temporary message handler
    const tempHandlerEntry = listeners.find((l) => l.event === 'message' && l.handler.name === 'handler')
    assert.ok(tempHandlerEntry)
    const tempHandler = tempHandlerEntry.handler

    // Simulate response from wrong origin
    tempHandler({
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { token: 'test' } }
    })

    // Test the global handler too
    const globalHandlerEntry = listeners.find((l) => l.event === 'message' && !l.handler.name)
    assert.ok(globalHandlerEntry)
    const globalHandler = globalHandlerEntry.handler

    // The config should still be null if we simulate wrong origin to global handler
    sandbox.cachedConfig = null // reset
    globalHandler({
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { token: 'test' } }
    })

    // We can't directly inspect cachedConfig easily without exposing it, but we can verify it doesn't resolve yet

    // Simulate response from correct origin
    tempHandler({
      source: sandbox.window,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { token: 'good-test' } }
    })

    const config = await extractPromise
    assert.strictEqual(config.token, 'good-test')
  })
})
