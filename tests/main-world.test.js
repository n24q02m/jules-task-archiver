const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldPath = path.join(__dirname, '..', 'main-world.js')
const mainWorldContent = fs.readFileSync(mainWorldPath, 'utf8')

describe('main-world.js: broadcastConfig', () => {
  let sandbox
  let messages = []
  let listeners = {}

  beforeEach(() => {
    messages = []
    listeners = {}
    sandbox = {
      window: {
        postMessage: (data, origin) => {
          messages.push({ data, origin })
        },
        addEventListener: (type, listener) => {
          listeners[type] = listeners[type] || []
          listeners[type].push(listener)
        },
        WIZ_global_data: {
          SNlM0e: 'at-token',
          cfb2h: 'bl-token',
          FdrFJe: 'fsid-token',
          TSDtV: 'beyond:models/gemini-1.5-pro'
        },
        origin: 'https://jules.google.com'
      },
      Date: {
        now: () => 123456789
      },
      console,
      URLSearchParams,
      JSON,
      String,
      setTimeout
    }
    sandbox.window.source = sandbox.window
    vm.createContext(sandbox)
  })

  it('should broadcast config on initialization', () => {
    vm.runInContext(mainWorldContent, sandbox)

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].data.type, 'JULES_ARCHIVER_CONFIG')
    assert.deepStrictEqual(JSON.parse(JSON.stringify(messages[0].data.config)), {
      at: 'at-token',
      bl: 'bl-token',
      fsid: 'fsid-token',
      modelId: 'beyond:models/gemini-1.5-pro',
      timestamp: 123456789
    })
  })

  it('should handle missing WIZ_global_data', () => {
    sandbox.window.WIZ_global_data = undefined
    vm.runInContext(mainWorldContent, sandbox)

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].data.config, null)
  })

  it('should broadcast config when requested via message', () => {
    vm.runInContext(mainWorldContent, sandbox)
    messages = [] // Clear initial broadcast

    const listener = listeners.message[0]
    listener({
      source: sandbox.window,
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].data.type, 'JULES_ARCHIVER_CONFIG')
  })

  it('should not broadcast config if message source is not window', () => {
    vm.runInContext(mainWorldContent, sandbox)
    messages = []

    const listener = listeners.message[0]
    listener({
      source: {}, // Different source
      data: { type: 'JULES_REQUEST_CONFIG' }
    })

    assert.strictEqual(messages.length, 0)
  })

  it('should support model names with dots (e.g. gemini-1.5-pro)', () => {
    sandbox.window.WIZ_global_data.TSDtV = 'some-prefix beyond:models/gemini-1.5-pro some-suffix'
    vm.runInContext(mainWorldContent, sandbox)

    const config = messages[messages.length - 1].data.config
    assert.strictEqual(config.modelId, 'beyond:models/gemini-1.5-pro')
  })

  it('should use window.origin as target for postMessage', () => {
    vm.runInContext(mainWorldContent, sandbox)
    assert.strictEqual(messages[0].origin, 'https://jules.google.com')
  })
})
