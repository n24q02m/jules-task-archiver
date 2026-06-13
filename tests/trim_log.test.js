const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const utilsScriptPath = path.join(__dirname, '..', 'utils.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')
const utilsScriptContent = fs.readFileSync(utilsScriptPath, 'utf8')

function setupTrimLogSandbox() {
  const sandbox = {
    chrome: {
      storage: {
        session: {
          get: () => Promise.resolve({}),
          set: () => Promise.resolve({})
        },
        sync: {
          get: async () => ({})
        },
        local: {
          get: async () => ({})
        }
      },
      runtime: {
        onMessage: { addListener: () => {} },
        getPlatformInfo: async () => ({})
      },
      webNavigation: {
        getFrame: async () => ({ url: 'https://jules.google.com/u/0/session', documentId: 'doc1' })
      },
      tabs: {
        query: async () => [],
        get: async (id) => ({ id, url: 'https://jules.google.com/u/0/session' }),
        sendMessage: async () => ({})
      },
      scripting: {
        executeScript: async () => {}
      }
    },
    fetch: async () => ({ ok: true, json: async () => [], text: async () => ")]}'\n\n4\n[[]]" }),
    importScripts: () => {},
    setTimeout: () => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    console: console,
    Math,
    Date,
    JSON,
    String,
    Array,
    Map,
    Object,
    Error,
    URLSearchParams,
    URL,
    Promise,
    parseInt,
    crypto
  }
  vm.createContext(sandbox)

  const scriptContent =
    utilsScriptContent +
    bgScriptContent +
    `
    globalThis.test_state = () => state;
    globalThis.test_trimLog = trimLog;
    globalThis.test_MAX_LOG_LINES = MAX_LOG_LINES;
  `

  vm.runInContext(scriptContent, sandbox)

  return sandbox
}

describe('trimLog specific tests', () => {
  it('should trim the log when it exceeds MAX_LOG_LINES', () => {
    const sandbox = setupTrimLogSandbox()
    const state = sandbox.test_state()
    const max = sandbox.test_MAX_LOG_LINES

    // Fill log beyond max
    state.log = Array.from({ length: max + 10 }, (_, i) => `line ${i}`)

    sandbox.test_trimLog()

    assert.strictEqual(state.log.length, max)
    assert.strictEqual(state.log[0], 'line 10')
    assert.strictEqual(state.log[max - 1], `line ${max + 9}`)
  })

  it('should not trim the log when it is exactly MAX_LOG_LINES', () => {
    const sandbox = setupTrimLogSandbox()
    const state = sandbox.test_state()
    const max = sandbox.test_MAX_LOG_LINES

    state.log = Array.from({ length: max }, (_, i) => `line ${i}`)

    sandbox.test_trimLog()

    assert.strictEqual(state.log.length, max)
    assert.strictEqual(state.log[0], 'line 0')
  })

  it('should not trim the log when it is below MAX_LOG_LINES', () => {
    const sandbox = setupTrimLogSandbox()
    const state = sandbox.test_state()

    state.log = ['line 1', 'line 2']

    sandbox.test_trimLog()

    assert.strictEqual(state.log.length, 2)
    assert.strictEqual(state.log[0], 'line 1')
  })

  it('should handle an empty log', () => {
    const sandbox = setupTrimLogSandbox()
    const state = sandbox.test_state()

    state.log = []

    sandbox.test_trimLog()

    assert.strictEqual(state.log.length, 0)
  })
})
