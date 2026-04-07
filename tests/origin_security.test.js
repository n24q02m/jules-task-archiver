const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '../content.js')
const contentJsContent = fs.readFileSync(contentJsPath, 'utf8')

const mainWorldJsPath = path.join(__dirname, '../main-world.js')
const mainWorldJsContent = fs.readFileSync(mainWorldJsPath, 'utf8')

function setupContentSandbox() {
  const runtimeMessages = []
  const listeners = []

  const windowMock = {
    addEventListener: (type, handler) => {
      if (type === 'message') listeners.push(handler)
    },
    removeEventListener: (type, handler) => {
      if (type === 'message') {
        const idx = listeners.indexOf(handler)
        if (idx !== -1) listeners.splice(idx, 1)
      }
    },
    postMessage: () => {},
    origin: 'https://jules.google.com',
    location: { href: 'https://jules.google.com/u/0/' }
  }

  const chromeMock = {
    runtime: {
      sendMessage: (msg) => {
        runtimeMessages.push(msg)
      },
      onMessage: {
        addListener: () => {}
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
    Promise,
    URL,
    location: windowMock.location
  }

  vm.createContext(sandbox)
  vm.runInContext(contentJsContent, sandbox)

  return { sandbox, listeners, runtimeMessages }
}

describe('Security: content.js origin check', () => {
  it('should REJECT messages from non-Jules origin', () => {
    const { sandbox, listeners, runtimeMessages } = setupContentSandbox()

    // Simulate message from evil.com
    const evilEvent = {
      origin: 'https://evil.com',
      source: sandbox.window,
      data: { type: 'JULES_START_CONFIG', config: { mal: 'icious' } }
    }

    // Call the listeners
    for (const l of listeners) {
      l(evilEvent)
    }

    const sentCount = runtimeMessages.filter((m) => m.action === 'CACHE_START_CONFIG').length
    assert.strictEqual(sentCount, 0, 'Should reject message from incorrect origin')
  })

  it('should ACCEPT messages from Jules origin', () => {
    const { sandbox, listeners, runtimeMessages } = setupContentSandbox()

    // Simulate message from jules.google.com
    const goodEvent = {
      origin: 'https://jules.google.com',
      source: sandbox.window,
      data: { type: 'JULES_START_CONFIG', config: { ok: 'good' } }
    }

    for (const l of listeners) {
      l(goodEvent)
    }

    const sentCount = runtimeMessages.filter((m) => m.action === 'CACHE_START_CONFIG').length
    assert.strictEqual(sentCount, 1, 'Should accept message from correct origin')
  })
})

function setupMainWorldSandbox() {
  const listeners = []
  const broadcasts = []

  const windowMock = {
    addEventListener: (type, handler) => {
      if (type === 'message') listeners.push(handler)
    },
    postMessage: (msg, origin) => {
      broadcasts.push({ msg, origin })
    },
    origin: 'https://jules.google.com',
    location: { href: 'https://jules.google.com/u/0/' },
    WIZ_global_data: { SNlM0e: 'token' }
  }

  const sandbox = {
    window: windowMock,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Promise,
    URL,
    URLSearchParams,
    JSON,
    String,
    location: windowMock.location
  }

  vm.createContext(sandbox)
  vm.runInContext(mainWorldJsContent, sandbox)

  return { sandbox, listeners, broadcasts }
}

describe('Security: main-world.js origin check', () => {
  it('should REJECT messages from non-window origin', () => {
    const { sandbox, listeners, broadcasts } = setupMainWorldSandbox()

    // Initial broadcast on script load
    const initialCount = broadcasts.length

    // Simulate message from evil.com requesting config
    const evilEvent = {
      origin: 'https://evil.com',
      source: sandbox.window,
      data: { type: 'JULES_REQUEST_CONFIG' }
    }

    // Call the listeners
    for (const l of listeners) {
      l(evilEvent)
    }

    assert.strictEqual(broadcasts.length, initialCount, 'Should not broadcast again for incorrect origin')
  })

  it('should ACCEPT messages from window origin', () => {
    const { sandbox, listeners, broadcasts } = setupMainWorldSandbox()

    const initialCount = broadcasts.length

    // Simulate message from window requesting config
    const goodEvent = {
      origin: sandbox.window.origin,
      source: sandbox.window,
      data: { type: 'JULES_REQUEST_CONFIG' }
    }

    for (const l of listeners) {
      l(goodEvent)
    }

    assert.strictEqual(broadcasts.length, initialCount + 1, 'Should broadcast again for correct origin')
    assert.strictEqual(
      broadcasts[broadcasts.length - 1].origin,
      sandbox.window.origin,
      'Should use window origin as target'
    )
  })
})
