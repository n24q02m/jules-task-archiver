const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('main-world.js', () => {
  const scriptPath = path.join(__dirname, '../main-world.js')
  const scriptContent = fs.readFileSync(scriptPath, 'utf8')

  let sandbox
  let messages = []
  let listeners = {}

  beforeEach(() => {
    messages = []
    listeners = {}
    sandbox = {
      window: {
        WIZ_global_data: {
          SNlM0e: 'at-token',
          cfb2h: 'bl-token',
          FdrFJe: 'fsid-token',
          TSDtV: 'beyond:models/gemini-1.5-pro'
        },
        postMessage: (data, origin) => {
          messages.push({ data, origin })
        },
        addEventListener: (type, listener) => {
          listeners[type] = listener
        },
        fetch: () => Promise.resolve({}),
        URLSearchParams: class {
          constructor(s) {
            this.s = s
          }
          get(_k) {
            return null
          }
        }
      },
      Date: {
        now: () => 123456789
      },
      JSON: JSON,
      String: String,
      console: console
    }
    // Self-reference
    sandbox.window.window = sandbox.window
    vm.createContext(sandbox)
  })

  // Helper to normalize objects from sandbox
  function normalize(obj) {
    return JSON.parse(JSON.stringify(obj))
  }

  it('should broadcast config on script load', () => {
    vm.runInContext(scriptContent, sandbox)

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].data.type, 'JULES_ARCHIVER_CONFIG')

    // Using deepStrictEqual with normalization
    assert.deepStrictEqual(normalize(messages[0].data.config), {
      at: 'at-token',
      bl: 'bl-token',
      fsid: 'fsid-token',
      modelId: 'beyond:models/gemini-1.5-pro',
      timestamp: 123456789
    })
  })

  it('should handle missing WIZ_global_data', () => {
    sandbox.window.WIZ_global_data = undefined
    vm.runInContext(scriptContent, sandbox)

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(normalize(messages[0].data.config), null)
  })

  it('should extract modelId with dots', () => {
    sandbox.window.WIZ_global_data.TSDtV = 'beyond:models/gemini-1.5-pro'
    vm.runInContext(scriptContent, sandbox)

    assert.strictEqual(messages[0].data.config.modelId, 'beyond:models/gemini-1.5-pro')
  })

  it('should respond to JULES_REQUEST_CONFIG message', () => {
    vm.runInContext(scriptContent, sandbox)
    messages = [] // Clear initial broadcast

    const eventHandler = listeners.message
    assert.ok(eventHandler)

    eventHandler({
      source: sandbox.window,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].data.type, 'JULES_ARCHIVER_CONFIG')
  })

  it('should ignore messages from other windows', () => {
    vm.runInContext(scriptContent, sandbox)
    messages = []

    const eventHandler = listeners.message
    eventHandler({
      source: {}, // different window
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(messages.length, 0)
  })
})
