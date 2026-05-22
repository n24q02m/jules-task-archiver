const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')
const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')

const PAGE_ORIGIN = 'https://jules.google.com'

function setupSandbox() {
  const postMessages = []
  const runtimeMessages = []
  const listeners = {}

  // An explicit window object: `event.source === window` identity checks only
  // work if the same object is used both inside the script and by the test.
  const windowObj = {
    location: { origin: PAGE_ORIGIN, href: `${PAGE_ORIGIN}/u/0/` },
    postMessage: (data, origin) => {
      postMessages.push({ data, origin })
    },
    addEventListener: (type, handler) => {
      listeners[type] = handler
    },
    removeEventListener: () => {}
  }
  windowObj.window = windowObj

  const sandbox = {
    window: windowObj,
    document: {
      createElement: () => ({
        src: '',
        onload: () => {},
        remove: () => {}
      }),
      head: { appendChild: () => {} },
      documentElement: { appendChild: () => {} }
    },
    location: windowObj.location,
    chrome: {
      runtime: {
        getURL: (p) => `chrome-extension://id/${p}`,
        sendMessage: (msg) => {
          runtimeMessages.push(msg)
        },
        onMessage: {
          addListener: () => {}
        }
      }
    },
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    console,
    URL,
    URLSearchParams,
    Date
  }
  vm.createContext(sandbox)
  return { sandbox, windowObj, listeners, postMessages, runtimeMessages }
}

describe('Origin Validation Security', () => {
  it('content.js should not use wildcard origin in postMessage', () => {
    const { sandbox, postMessages } = setupSandbox()

    vm.runInContext(contentJs, sandbox)

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

describe('content.js message handler origin checks', () => {
  it('should relay JULES_START_CONFIG from the trusted same-origin window', () => {
    const { sandbox, windowObj, listeners, runtimeMessages } = setupSandbox()
    vm.runInContext(contentJs, sandbox)

    listeners.message({
      source: windowObj,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_START_CONFIG', config: { capturedAt: 1 } }
    })

    assert.strictEqual(runtimeMessages.length, 1)
    assert.strictEqual(runtimeMessages[0].action, 'CACHE_START_CONFIG')
  })

  it('should ignore a message from a foreign origin', () => {
    const { sandbox, windowObj, listeners, runtimeMessages } = setupSandbox()
    vm.runInContext(contentJs, sandbox)

    listeners.message({
      source: windowObj,
      origin: 'https://evil.example.com',
      data: { type: 'JULES_START_CONFIG', config: { capturedAt: 1 } }
    })

    assert.strictEqual(runtimeMessages.length, 0, 'foreign-origin message must not be relayed')
  })

  it('should ignore a message whose source is not this window', () => {
    const { sandbox, listeners, runtimeMessages } = setupSandbox()
    vm.runInContext(contentJs, sandbox)

    listeners.message({
      source: {},
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_START_CONFIG', config: { capturedAt: 1 } }
    })

    assert.strictEqual(runtimeMessages.length, 0, 'cross-frame message must not be relayed')
  })
})

describe('main-world.js message handler origin checks', () => {
  it('should re-broadcast config for a trusted same-origin request', () => {
    const { sandbox, windowObj, listeners, postMessages } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    const initialCount = postMessages.length // initial broadcast on load
    listeners.message({
      source: windowObj,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(postMessages.length, initialCount + 1, 'trusted request should trigger a broadcast')
  })

  it('should not broadcast for a foreign-origin request', () => {
    const { sandbox, windowObj, listeners, postMessages } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    const initialCount = postMessages.length
    listeners.message({
      source: windowObj,
      origin: 'https://evil.example.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(postMessages.length, initialCount, 'foreign-origin request must not trigger a broadcast')
  })

  it('should not broadcast for a request from a different window', () => {
    const { sandbox, listeners, postMessages } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    const initialCount = postMessages.length
    listeners.message({
      source: {},
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(postMessages.length, initialCount, 'cross-frame request must not trigger a broadcast')
  })
})
