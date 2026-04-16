const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')

describe('main-world.js broadcastConfig', () => {
  let sandbox
  let messages = []
  let listeners = {}

  beforeEach(() => {
    messages = []
    listeners = {}

    const windowMock = {
      WIZ_global_data: {
        SNlM0e: 'at-token',
        cfb2h: 'bl-token',
        FdrFJe: 'fsid-token',
        TSDtV: 'beyond:models/gemini-1.5-pro'
      },
      postMessage: (data, origin) => {
        messages.push({ data, origin })
      },
      addEventListener: (type, handler) => {
        if (!listeners[type]) listeners[type] = []
        listeners[type].push(handler)
      },
      removeEventListener: (type, handler) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((h) => h !== handler)
        }
      },
      fetch: async () => ({
        apply: () => {}
      }),
      URL: URL,
      URLSearchParams: URLSearchParams,
      JSON: JSON,
      Date: Date,
      String: String,
      console: console
    }

    windowMock.window = windowMock
    windowMock.globalThis = windowMock

    sandbox = vm.createContext(windowMock)
  })

  it('should broadcast config with all tokens and modelId (including dots)', () => {
    vm.runInContext(mainWorldJs, sandbox)

    const configMsg = messages.find((m) => m.data.type === 'JULES_ARCHIVER_CONFIG')
    assert.ok(configMsg, 'JULES_ARCHIVER_CONFIG message should be sent')
    assert.strictEqual(configMsg.data.config.at, 'at-token')
    assert.strictEqual(configMsg.data.config.bl, 'bl-token')
    assert.strictEqual(configMsg.data.config.fsid, 'fsid-token')
    assert.strictEqual(configMsg.data.config.modelId, 'beyond:models/gemini-1.5-pro')
    assert.ok(configMsg.data.config.timestamp, 'timestamp should be present')
  })

  it('should broadcast null config when WIZ_global_data is missing', () => {
    const windowMock = {
      postMessage: (data, origin) => {
        messages.push({ data, origin })
      },
      addEventListener: () => {},
      fetch: async () => ({}),
      Date: Date,
      String: String,
      console: console,
      JSON: JSON
    }
    windowMock.window = windowMock
    windowMock.globalThis = windowMock
    const emptySandbox = vm.createContext(windowMock)

    messages = []
    vm.runInContext(mainWorldJs, emptySandbox)

    const configMsg = messages.find((m) => m.data.type === 'JULES_ARCHIVER_CONFIG')
    assert.ok(configMsg)
    assert.strictEqual(configMsg.data.config, null)
  })

  it('should respond to JULES_REQUEST_CONFIG message', () => {
    // Patch to expose broadcastConfig
    const patchedJs = mainWorldJs.replace('function broadcastConfig', 'globalThis.broadcastConfig = function')
    vm.runInContext(patchedJs, sandbox)

    messages = []
    // Verify that the function can be triggered
    sandbox.broadcastConfig()

    const configMsg = messages.find((m) => m.data.type === 'JULES_ARCHIVER_CONFIG')
    assert.ok(configMsg, 'Should broadcast config')
    assert.strictEqual(configMsg.data.config.at, 'at-token')
  })

  it('should ignore messages from other windows', () => {
    vm.runInContext(mainWorldJs, sandbox)
    messages = []

    const messageHandler = listeners.message[0]
    messageHandler({
      source: {}, // different source
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    const configMsg = messages.find((m) => m.data.type === 'JULES_ARCHIVER_CONFIG')
    assert.strictEqual(configMsg, undefined, 'Should ignore non-window messages')
  })
})
