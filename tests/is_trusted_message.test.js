const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '../content.js')
const contentJsCode = fs.readFileSync(contentJsPath, 'utf8')

const PAGE_ORIGIN = 'https://jules.google.com'

function setupSandbox() {
  const windowObj = {
    location: { origin: PAGE_ORIGIN, href: `${PAGE_ORIGIN}/u/0/session` },
    addEventListener: () => {},
    removeEventListener: () => {},
    postMessage: () => {}
  }
  windowObj.window = windowObj

  const sandbox = {
    window: windowObj,
    document: {
      createElement: () => ({
        src: '',
        remove: () => {},
        onload: () => {}
      }),
      head: { appendChild: () => {} },
      documentElement: { appendChild: () => {} }
    },
    chrome: {
      runtime: {
        getURL: (p) => `chrome-extension://id/${p}`,
        sendMessage: () => {},
        onMessage: { addListener: () => {} }
      }
    },
    location: windowObj.location,
    console,
    URL,
    URLSearchParams,
    Date,
    Promise,
    setTimeout: () => {},
    clearTimeout: () => {},
    TEST_MODE: true
  }

  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(contentJsCode, sandbox)
  return sandbox
}

describe('content.js isTrustedMessage', () => {
  it('should return true for valid JULES_ARCHIVER_CONFIG message', () => {
    const sandbox = setupSandbox()
    const event = {
      source: sandbox.window,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { some: 'data' } }
    }
    assert.strictEqual(sandbox.test_isTrustedMessage(event), true)
  })

  it('should return true for valid JULES_START_CONFIG message', () => {
    const sandbox = setupSandbox()
    const event = {
      source: sandbox.window,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_START_CONFIG', config: { some: 'data' } }
    }
    assert.strictEqual(sandbox.test_isTrustedMessage(event), true)
  })

  it('should return true for JULES_REQUEST_CONFIG even without config payload', () => {
    const sandbox = setupSandbox()
    const event = {
      source: sandbox.window,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_REQUEST_CONFIG' }
    }
    assert.strictEqual(sandbox.test_isTrustedMessage(event), true)
  })

  it('should return false if source is not window', () => {
    const sandbox = setupSandbox()
    const event = {
      source: {},
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { some: 'data' } }
    }
    assert.strictEqual(sandbox.test_isTrustedMessage(event), false)
  })

  it('should return false if origin mismatch', () => {
    const sandbox = setupSandbox()
    const event = {
      source: sandbox.window,
      origin: 'https://evil.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { some: 'data' } }
    }
    assert.strictEqual(sandbox.test_isTrustedMessage(event), false)
  })

  it('should return false if data is missing', () => {
    const sandbox = setupSandbox()
    const event = {
      source: sandbox.window,
      origin: PAGE_ORIGIN
    }
    assert.strictEqual(sandbox.test_isTrustedMessage(event), false)
  })

  it('should return false if type does not start with JULES_', () => {
    const sandbox = setupSandbox()
    const event = {
      source: sandbox.window,
      origin: PAGE_ORIGIN,
      data: { type: 'NOT_JULES_CONFIG', config: { some: 'data' } }
    }
    assert.strictEqual(sandbox.test_isTrustedMessage(event), false)
  })

  it('should return false if _CONFIG type is missing config payload', () => {
    const sandbox = setupSandbox()
    const event = {
      source: sandbox.window,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_ARCHIVER_CONFIG' }
    }
    assert.strictEqual(sandbox.test_isTrustedMessage(event), false)
  })

  it('should return false if type is not a string', () => {
    const sandbox = setupSandbox()
    const event = {
      source: sandbox.window,
      origin: PAGE_ORIGIN,
      data: { type: 123 }
    }
    assert.strictEqual(sandbox.test_isTrustedMessage(event), false)
  })
})
