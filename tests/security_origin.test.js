const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '..', 'content.js')
const mainWorldJsPath = path.join(__dirname, '..', 'main-world.js')

function setupSandbox(scriptPath) {
  const scriptContent = fs.readFileSync(scriptPath, 'utf8')

  const messages = []
  const chrome = {
    runtime: {
      sendMessage: (msg) => messages.push({ to: 'background', msg }),
      onMessage: { addListener: () => {} }
    },
    storage: {
      session: { set: () => {} }
    }
  }

  const listeners = []
  const mockWindow = {
    origin: 'https://jules.google.com',
    location: { href: 'https://jules.google.com/u/0/' },
    addEventListener: (type, handler) => {
      if (type === 'message') listeners.push(handler)
    },
    removeEventListener: (type, handler) => {
      if (type === 'message') {
        const idx = listeners.indexOf(handler)
        if (idx !== -1) listeners.splice(idx, 1)
      }
    },
    postMessage: (msg, targetOrigin) => {
      messages.push({ to: 'window', msg, targetOrigin })
    }
  }

  const sandbox = {
    window: mockWindow,
    chrome,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Promise,
    URL,
    location: mockWindow.location
  }

  vm.createContext(sandbox)
  vm.runInContext(scriptContent, sandbox)

  return { sandbox, listeners, messages, mockWindow }
}

describe('PostMessage Origin Security', () => {
  it('content.js should only accept messages from same origin', () => {
    const { listeners, messages, mockWindow } = setupSandbox(contentJsPath)
    const handler = listeners[0]

    // 1. Untrusted origin, correct data
    handler({
      source: mockWindow,
      origin: 'https://evil.com',
      data: { type: 'JULES_START_CONFIG', config: { secret: 'data' } }
    })

    // Check if it sent to background (should NOT have if fixed)
    const backgroundMsgs = messages.filter((m) => m.to === 'background')
    assert.strictEqual(backgroundMsgs.length, 0, 'Should not process messages from untrusted origin')
  })

  it('main-world.js should only accept messages from same origin', () => {
    const { listeners, messages, mockWindow } = setupSandbox(mainWorldJsPath)
    // main-world.js adds a listener at the end
    const handler = listeners[listeners.length - 1]

    // Mock broadcastConfig behavior check via messages
    const initialCount = messages.filter((m) => m.to === 'window').length

    // Untrusted origin
    handler({
      source: mockWindow,
      origin: 'https://evil.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    const finalCount = messages.filter((m) => m.to === 'window').length
    assert.strictEqual(finalCount, initialCount, 'Should not respond to requests from untrusted origin')
  })

  it('scripts should use window.origin instead of "*" in postMessage', () => {
    const content = fs.readFileSync(contentJsPath, 'utf8')
    const mainWorld = fs.readFileSync(mainWorldJsPath, 'utf8')

    // These will FAIL initially
    assert.ok(
      !content.includes("postMessage({ type: 'JULES_REQUEST_CONFIG' }, '*')"),
      'Content script should not use "*" for JULES_REQUEST_CONFIG'
    )
    assert.ok(!mainWorld.includes("'*'"), 'Main world script should not use "*" for any postMessage')
  })
})
