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
  it('content.js should ignore messages from different origin', () => {
    const { sandbox, postMessages } = setupSandbox()

    vm.runInContext(contentJs, sandbox)

    const initialCount = postMessages.length

    // Simulate request message from incorrect origin
    const event = {
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    }
    sandbox.window.listeners.message(event)

    assert.strictEqual(postMessages.length, initialCount, 'Should ignore message from incorrect origin')
  })

  it('main-world.js should ignore messages from different origin', () => {
    const { sandbox, postMessages } = setupSandbox()

    vm.runInContext(mainWorldJs, sandbox)

    const initialCount = postMessages.length

    // Simulate request message from incorrect origin
    const event = {
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    }
    sandbox.window.listeners.message(event)

    assert.strictEqual(postMessages.length, initialCount, 'Should ignore message from incorrect origin')
  })

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
})
