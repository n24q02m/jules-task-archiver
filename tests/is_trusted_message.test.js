const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')
const PAGE_ORIGIN = 'https://jules.google.com'

function setupSandbox() {
  const windowObj = {
    location: { origin: PAGE_ORIGIN },
    addEventListener: () => {},
    removeEventListener: () => {},
    postMessage: () => {}
  }
  windowObj.window = windowObj

  const sandbox = {
    window: windowObj,
    document: {
      createElement: () => ({ src: '', onload: () => {}, remove: () => {} }),
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
    setTimeout: () => {},
    clearTimeout: () => {},
    URL,
    Date,
    TEST_MODE: true,
    globalThis: {}
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(contentJs, sandbox)
  return { sandbox, windowObj }
}

describe('isTrustedMessage', () => {
  const { sandbox, windowObj } = setupSandbox()
  const isTrusted = sandbox.test_isTrustedMessage

  it('should return true for valid JULES_ARCHIVER_CONFIG', () => {
    const event = {
      source: windowObj,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { at: 'token' } }
    }
    assert.strictEqual(isTrusted(event), true)
  })

  it('should return true for valid JULES_START_CONFIG', () => {
    const event = {
      source: windowObj,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_START_CONFIG', config: { capturedAt: 123 } }
    }
    assert.strictEqual(isTrusted(event), true)
  })

  it('should return true for valid JULES_REQUEST_CONFIG (no config payload)', () => {
    const event = {
      source: windowObj,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_REQUEST_CONFIG' }
    }
    assert.strictEqual(isTrusted(event), true)
  })

  it('should return false if source is not window', () => {
    const event = {
      source: {},
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { at: 'token' } }
    }
    assert.strictEqual(isTrusted(event), false)
  })

  it('should return false if origin is incorrect', () => {
    const event = {
      source: windowObj,
      origin: 'https://evil.com',
      data: { type: 'JULES_ARCHIVER_CONFIG', config: { at: 'token' } }
    }
    assert.strictEqual(isTrusted(event), false)
  })

  it('should return false if type does not start with JULES_', () => {
    const event = {
      source: windowObj,
      origin: PAGE_ORIGIN,
      data: { type: 'OTHER_TYPE', config: { at: 'token' } }
    }
    assert.strictEqual(isTrusted(event), false)
  })

  it('should return false if type is missing', () => {
    const event = {
      source: windowObj,
      origin: PAGE_ORIGIN,
      data: { config: { at: 'token' } }
    }
    assert.strictEqual(isTrusted(event), false)
  })

  it('should return false if data is missing', () => {
    const event = {
      source: windowObj,
      origin: PAGE_ORIGIN
    }
    assert.strictEqual(isTrusted(event), false)
  })

  it('should return false if config is missing for JULES_ARCHIVER_CONFIG', () => {
    const event = {
      source: windowObj,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_ARCHIVER_CONFIG' }
    }
    assert.strictEqual(isTrusted(event), false)
  })

  it('should return false if config is missing for JULES_START_CONFIG', () => {
    const event = {
      source: windowObj,
      origin: PAGE_ORIGIN,
      data: { type: 'JULES_START_CONFIG' }
    }
    assert.strictEqual(isTrusted(event), false)
  })
})
