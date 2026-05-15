const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')
const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')

function setupSandbox() {
  const postMessages = []
  const sandbox = {
    window: {},
    document: {
      createElement: () => ({
        src: '',
        onload: () => {},
        remove: () => {}
      }),
      head: { appendChild: () => {} },
      documentElement: { appendChild: () => {} },
      addEventListener: (type, handler) => {
        if (!sandbox.window.listeners) sandbox.window.listeners = {}
        sandbox.window.listeners[type] = handler
      }
    },
    location: {
      origin: 'https://jules.google.com',
      href: 'https://jules.google.com/u/0/'
    },
    chrome: {
      runtime: {
        getURL: (path) => `chrome-extension://id/${path}`,
        sendMessage: () => {},
        onMessage: {
          addListener: () => {}
        }
      }
    },
    postMessage: (data, origin) => {
      postMessages.push({ data, origin })
    },
    addEventListener: (type, handler) => {
      if (!sandbox.listeners) sandbox.listeners = {}
      sandbox.listeners[type] = handler
    },
    removeEventListener: () => {},
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    console,
    URL,
    URLSearchParams,
    Date
  }
  sandbox.window = sandbox
  vm.createContext(sandbox)
  return { sandbox, postMessages }
}

describe('Origin Validation Security', () => {
  it('content.js should not use wildcard origin in postMessage', () => {
    const { sandbox, postMessages } = setupSandbox()

    vm.runInContext(contentJs, sandbox)

    // Trigger extractConfig by calling the GET_CONFIG handler if we can,
    // or since extractConfig is at top level in the sandbox, we can call it.
    if (sandbox.extractConfig) {
      sandbox.extractConfig()
    }

    const wildcards = postMessages.filter((m) => m.origin === '*')
    assert.strictEqual(wildcards.length, 0, 'Found wildcard origin in content.js postMessage')
  })

  it('main-world.js should not use wildcard origin in postMessage', () => {
    const { sandbox, postMessages } = setupSandbox()

    vm.runInContext(mainWorldJs, sandbox)

    const wildcards = postMessages.filter((m) => m.origin === '*')
    assert.strictEqual(wildcards.length, 0, 'Found wildcard origin in main-world.js postMessage')
  })

  it('content.js should reject messages with invalid origin', () => {
    const { sandbox } = setupSandbox()
    vm.runInContext(contentJs, sandbox)

    const listeners = sandbox.window.listeners?.message ? [sandbox.window.listeners.message] : []

    // Also capture any handlers added dynamically (e.g. inside extractConfig)
    if (sandbox.listeners?.message) {
      listeners.push(sandbox.listeners.message)
    }

    assert.ok(listeners.length > 0, 'Should have message listeners in content.js')

    // Simulate cross-origin message
    const event = {
      source: sandbox.window,
      origin: 'https://malicious.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { at: 'fake' } }
    }

    for (const handler of listeners) {
      handler(event)
    }

    // In our simplified test sandbox, if cachedConfig was not set by the event handler, it will remain undefined.
    assert.strictEqual(sandbox.cachedConfig, undefined, 'Should ignore cross-origin config messages')
  })

  it('main-world.js should reject messages with invalid origin', () => {
    const { sandbox, postMessages } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    const initialPostMessagesLength = postMessages.length

    const listener = sandbox.window.listeners?.message
    assert.ok(listener, 'Should have message listener in main-world.js')

    // Simulate cross-origin request
    const event = {
      source: sandbox.window,
      origin: 'https://malicious.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    }

    listener(event)

    // No new postMessage should have been triggered
    assert.strictEqual(postMessages.length, initialPostMessagesLength, 'Should ignore cross-origin config requests')
  })
})
