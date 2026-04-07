const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')

describe('main-world.js: broadcastConfig', () => {
  let sandbox
  let messages = []

  beforeEach(() => {
    messages = []
    sandbox = {
      window: {
        origin: 'https://jules.google.com',
        postMessage: (data, origin) => {
          messages.push({ data, origin })
        },
        addEventListener: () => {},
        fetch: () => {}
      },
      Date: {
        now: () => 123456789
      },
      console,
      setTimeout,
      clearTimeout,
      URLSearchParams,
      JSON,
      String
    }
    // Setup circular reference for window
    sandbox.window.window = sandbox.window
    vm.createContext(sandbox)
  })

  // Helper to normalize objects for comparison across VM boundaries
  function normalize(obj) {
    return JSON.parse(JSON.stringify(obj))
  }

  it('should broadcast full config when WIZ_global_data is present', () => {
    sandbox.window.WIZ_global_data = {
      SNlM0e: 'at-token',
      cfb2h: 'bl-label',
      FdrFJe: 'fsid-token',
      TSDtV: 'beyond:models/gemini-pro'
    }

    vm.runInContext(mainWorldJs, sandbox)

    assert.strictEqual(messages.length, 1)
    const msg = messages[0]
    assert.strictEqual(msg.data.type, 'JULES_ARCHIVER_CONFIG')
    assert.deepStrictEqual(normalize(msg.data.config), {
      at: 'at-token',
      bl: 'bl-label',
      fsid: 'fsid-token',
      modelId: 'beyond:models/gemini-pro',
      timestamp: 123456789
    })
    assert.strictEqual(msg.origin, 'https://jules.google.com')
  })

  it('should broadcast null config when WIZ_global_data is missing', () => {
    sandbox.window.WIZ_global_data = undefined

    vm.runInContext(mainWorldJs, sandbox)

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].data.config, null)
  })

  it('should handle partial WIZ_global_data', () => {
    sandbox.window.WIZ_global_data = {
      SNlM0e: 'at-token'
    }

    vm.runInContext(mainWorldJs, sandbox)

    assert.deepStrictEqual(normalize(messages[0].data.config), {
      at: 'at-token',
      bl: null,
      fsid: null,
      modelId: null,
      timestamp: 123456789
    })
  })

  it('should extract modelId from complex TSDtV string', () => {
    sandbox.window.WIZ_global_data = {
      TSDtV: '%.@.[[null,[[45755236,null,null,null,"beyond:models/gemini-1-5-pro",null,"RZYmC"]]]]'
    }

    vm.runInContext(mainWorldJs, sandbox)

    assert.strictEqual(messages[0].data.config.modelId, 'beyond:models/gemini-1-5-pro')
  })
})
