const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldPath = path.join(__dirname, '..', 'main-world.js')
const contentJsPath = path.join(__dirname, '..', 'content.js')

function setupSandbox(scriptPath) {
  const scriptContent = fs.readFileSync(scriptPath, 'utf8')
  const messagesSent = []
  const listeners = []
  const chromeListeners = []

  const windowMock = {
    origin: 'https://jules.google.com',
    WIZ_global_data: { SNlM0e: 'token', cfb2h: 'build', FdrFJe: 'fsid' },
    addEventListener: (type, handler) => {
      if (type === 'message') listeners.push(handler)
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

  const chromeMock = {
    runtime: {
      sendMessage: () => {},
      onMessage: {
        addListener: (handler) => {
          chromeListeners.push(handler)
        }
      }
    }
  }

  const sandbox = {
    window: windowMock,
    chrome: chromeMock,
    console,
    setTimeout,
    clearTimeout,
    Date,
    URL,
    location: { href: 'https://jules.google.com/u/0/' },
    Promise,
    __julesArchiver: false
  }
  // Circular reference for window
  windowMock.window = windowMock
  sandbox.window.source = windowMock // Some scripts check event.source === window

  vm.createContext(sandbox)
  vm.runInContext(scriptContent, sandbox)

  return { sandbox, messagesSent, listeners, chromeListeners, windowMock }
}

describe('main-world.js PostMessage Security', () => {
  it('should use window.origin instead of wildcard "*" in postMessage', () => {
    const { messagesSent } = setupSandbox(mainWorldPath)
    assert.ok(messagesSent.length > 0, 'Should have sent at least one message')
    messagesSent.forEach((msg) => {
      assert.notStrictEqual(msg.origin, '*', 'main-world.js: postMessage should not use wildcard origin')
      assert.strictEqual(msg.origin, 'https://jules.google.com', 'main-world.js: postMessage should use window.origin')
    })
  })

  it('should only accept messages from the same origin', () => {
    const { listeners, messagesSent, windowMock } = setupSandbox(mainWorldPath)
    const countBefore = messagesSent.length

    // Simulate message from different origin
    listeners.forEach((handler) => {
      handler({
        origin: 'https://evil.com',
        source: windowMock,
        data: { type: 'JULES_REQUEST_CONFIG' }
      })
    })

    const countAfter = messagesSent.length
    assert.strictEqual(countAfter, countBefore, 'Should NOT have broadcasted config for message from evil.com')
  })
})

describe('content.js PostMessage Security', () => {
  it('should only accept messages from the same origin', () => {
    const { listeners, sandbox, windowMock } = setupSandbox(contentJsPath)
    let bgMessageSent = false
    sandbox.chrome.runtime.sendMessage = () => {
      bgMessageSent = true
    }

    listeners.forEach((handler) => {
      handler({
        origin: 'https://evil.com',
        source: windowMock,
        data: { type: 'JULES_START_CONFIG', config: {} }
      })
    })

    assert.strictEqual(bgMessageSent, false, 'content.js should NOT relay messages from evil.com')
  })

  it('should use window.origin instead of wildcard "*" in postMessage', async () => {
    const { chromeListeners, messagesSent } = setupSandbox(contentJsPath)

    // Trigger extractConfig via GET_CONFIG message
    const handler = chromeListeners[0]
    if (handler) {
      handler({ action: 'GET_CONFIG' }, {}, () => {})
    }

    // Give it a tick to run the async extractConfig
    await new Promise((resolve) => setTimeout(resolve, 0))

    const requestConfigMsg = messagesSent.find((m) => m.data?.type === 'JULES_REQUEST_CONFIG')
    assert.ok(requestConfigMsg, 'Should have sent JULES_REQUEST_CONFIG')
    assert.notStrictEqual(requestConfigMsg.origin, '*', 'content.js: postMessage should not use wildcard origin')
    assert.strictEqual(
      requestConfigMsg.origin,
      'https://jules.google.com',
      'content.js: postMessage should use window.origin'
    )
  })
})
