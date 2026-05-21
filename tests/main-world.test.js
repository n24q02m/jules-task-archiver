const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')

function setupSandbox(initialWizData = {}) {
  const messages = []
  const listeners = {}

  const windowMock = {
    location: { origin: 'https://jules.google.com' },
    WIZ_global_data: initialWizData,
    postMessage: (data, targetOrigin) => {
      messages.push({ data, targetOrigin })
    },
    addEventListener: (type, listener) => {
      listeners[type] = listeners[type] || []
      listeners[type].push(listener)
    },
    fetch: async () => ({ ok: true }),
    __julesArchiver: undefined,
    Date: {
      now: () => 1234567890
    },
    URLSearchParams: class {
      constructor(init) {
        this.params = new URLSearchParams(init)
      }
      get(name) {
        return this.params.get(name)
      }
    }
  }

  // Circular reference common in browsers
  windowMock.window = windowMock

  const sandbox = {
    window: windowMock,
    console,
    URLSearchParams: windowMock.URLSearchParams,
    JSON,
    Date: windowMock.Date,
    String,
    setTimeout
  }

  vm.createContext(sandbox)
  return { sandbox, windowMock, messages, listeners }
}

describe('main-world.js', () => {
  it('should broadcast config on load', () => {
    const { sandbox, messages } = setupSandbox({
      SNlM0e: 'at-token',
      cfb2h: 'bl-label',
      FdrFJe: 'fsid-token',
      TSDtV: 'beyond:models/gemini-pro'
    })

    vm.runInContext(mainWorldJs, sandbox)

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].data.type, 'JULES_ARCHIVER_CONFIG')
    assert.strictEqual(messages[0].data.config.at, 'at-token')
    assert.strictEqual(messages[0].data.config.bl, 'bl-label')
    assert.strictEqual(messages[0].data.config.fsid, 'fsid-token')
    assert.strictEqual(messages[0].data.config.modelId, 'beyond:models/gemini-pro')
    assert.strictEqual(messages[0].data.config.timestamp, 1234567890)
  })

  it('should handle missing WIZ_global_data', () => {
    const { sandbox, messages } = setupSandbox(null)

    vm.runInContext(mainWorldJs, sandbox)

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].data.config, null)
  })

  it('should handle partial WIZ_global_data', () => {
    const { sandbox, messages } = setupSandbox({
      SNlM0e: 'at-token'
    })

    vm.runInContext(mainWorldJs, sandbox)

    assert.strictEqual(messages[0].data.config.at, 'at-token')
    assert.strictEqual(messages[0].data.config.bl, null)
    assert.strictEqual(messages[0].data.config.modelId, null)
  })

  it('should respond to JULES_REQUEST_CONFIG message', () => {
    const { sandbox, messages, listeners, windowMock } = setupSandbox({
      SNlM0e: 'at-token'
    })

    vm.runInContext(mainWorldJs, sandbox)
    assert.strictEqual(messages.length, 1) // Initial broadcast

    // Simulate request message
    const event = {
      source: windowMock,
      origin: 'https://jules.google.com',
      data: { type: 'JULES_REQUEST_CONFIG' }
    }
    listeners.message.forEach((l) => {
      l(event)
    })

    assert.strictEqual(messages.length, 2)
    assert.strictEqual(messages[1].data.type, 'JULES_ARCHIVER_CONFIG')
  })

  it('should ignore JULES_REQUEST_CONFIG from other sources', () => {
    const { sandbox, messages, listeners } = setupSandbox({
      SNlM0e: 'at-token'
    })

    vm.runInContext(mainWorldJs, sandbox)
    assert.strictEqual(messages.length, 1)

    // Simulate request message from wrong source
    const event = {
      source: {}, // Not window
      data: { type: 'JULES_REQUEST_CONFIG' }
    }
    listeners.message.forEach((l) => {
      l(event)
    })

    assert.strictEqual(messages.length, 1)
  })

  it('should intercept Rja83d fetch and broadcast start config', async () => {
    const { sandbox, messages, windowMock } = setupSandbox({})

    vm.runInContext(mainWorldJs, sandbox)
    assert.strictEqual(messages.length, 1) // Initial broadcast

    // Setup mock payload
    const payload = [
      null,
      null,
      ['model-config', null, null, null, null, null, null, null, null, null, ['flag1']], // payload[2] and payload[2][10]
      null,
      null,
      null,
      null,
      null,
      null,
      [null, null, null, null, ['exp1', 'exp2']] // payload[9][4]
    ]
    const freq = [[['id', JSON.stringify(payload)]]]
    const body = `f.req=${encodeURIComponent(JSON.stringify(freq))}`

    // Call intercepted fetch
    await windowMock.fetch('https://jules.google.com/_/Swebot/data/batchexecute?rpcids=Rja83d', {
      method: 'POST',
      body
    })

    const startMsg = messages.find((m) => m.data.type === 'JULES_START_CONFIG')
    assert.ok(startMsg, 'JULES_START_CONFIG message should be sent')
    assert.deepStrictEqual(startMsg.data.config.modelConfig, payload[2])
    assert.deepStrictEqual(startMsg.data.config.experimentIds, ['exp1', 'exp2'])
    assert.deepStrictEqual(startMsg.data.config.featureFlags, ['flag1'])
    assert.strictEqual(startMsg.data.config.capturedAt, 1234567890)
  })

  it('should ignore other fetch calls', async () => {
    const { sandbox, messages, windowMock } = setupSandbox({})

    vm.runInContext(mainWorldJs, sandbox)
    const initialCount = messages.length

    await windowMock.fetch('https://jules.google.com/other-api')

    assert.strictEqual(messages.length, initialCount)
  })
})
