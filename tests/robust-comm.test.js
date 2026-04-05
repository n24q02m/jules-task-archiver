const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')

function setupEnvironment(initialTabs = {}) {
  const chromeMock = {
    storage: {
      session: { get: async () => ({}), set: async () => {} },
      sync: { get: async () => ({}) },
      local: { get: async () => ({}) }
    },
    runtime: {
      onMessage: { addListener: () => {} },
      getPlatformInfo: async () => ({})
    },
    tabs: {
      get: async (id) => initialTabs[id] || { id, url: 'https://jules.google.com/u/0/' },
      sendMessage: async () => ({ status: 'ok' }),
      query: async () => []
    },
    scripting: {
      executeScript: async () => {}
    }
  }

  const sandbox = {
    chrome: chromeMock,
    fetch: async () => ({ ok: true, text: async () => '' }),
    setTimeout: (fn, _ms) => {
      // Fast-forward timeouts for testing
      setImmediate(fn)
    },
    Date,
    Promise,
    Error,
    console,
    URL,
    URLSearchParams,
    parseInt,
    Math
  }

  vm.createContext(sandbox)

  const scriptContent =
    bgScriptContent +
    `
    globalThis.test_sendToTab = sendToTab;
    globalThis.test_JULES_ORIGIN = JULES_ORIGIN;
  `

  vm.runInContext(scriptContent, sandbox)
  return { sandbox, chromeMock }
}

describe('sendToTab Robust Communication', () => {
  it('should succeed immediately if the content script is responsive', async () => {
    const { sandbox, chromeMock } = setupEnvironment()
    let callCount = 0
    chromeMock.tabs.sendMessage = async (_id, _msg) => {
      callCount++
      return { success: true }
    }

    const result = await sandbox.test_sendToTab(123, { action: 'HELLO' })
    assert.strictEqual(result.success, true)
    assert.strictEqual(callCount, 1)
  })

  it('should inject script and retry on first failure', async () => {
    const { sandbox, chromeMock } = setupEnvironment()
    let sendCount = 0
    let injectCount = 0

    chromeMock.tabs.sendMessage = async (_id, msg) => {
      if (!msg || msg.action !== 'PING') sendCount++
      if (sendCount === 1) throw new Error('Could not establish connection')
      return { success: true }
    }

    chromeMock.scripting.executeScript = async () => {
      injectCount++
    }

    const result = await sandbox.test_sendToTab(123, { action: 'HELLO' })
    assert.strictEqual(result.success, true)
    assert.strictEqual(sendCount, 2, 'Should have called sendMessage twice')
    assert.strictEqual(injectCount, 1, 'Should have called executeScript once')
  })

  it('should retry multiple times on subsequent failures', async () => {
    const { sandbox, chromeMock } = setupEnvironment()
    let sendCount = 0

    chromeMock.tabs.sendMessage = async (_id, msg) => {
      if (!msg || msg.action !== 'PING') sendCount++
      if (sendCount <= 2) throw new Error('Fail') // 1st: fail -> inject -> 2nd: fail -> retry -> 3rd: success
      return { success: true }
    }

    const result = await sandbox.test_sendToTab(123, { action: 'HELLO' })
    assert.strictEqual(result.success, true)
    assert.strictEqual(sendCount, 3)
  })

  it('should throw if all retries fail', async () => {
    const { sandbox, chromeMock } = setupEnvironment()
    chromeMock.tabs.sendMessage = async () => {
      throw new Error('Permanent Failure')
    }

    await assert.rejects(sandbox.test_sendToTab(123, { action: 'HELLO' }, 2), {
      message: 'Permanent Failure'
    })
  })

  it('should NOT retry on Security Error', async () => {
    const { sandbox, chromeMock } = setupEnvironment({
      456: { id: 456, url: 'https://evil.com/' }
    })

    let sendCount = 0
    chromeMock.tabs.sendMessage = async (_id, msg) => {
      if (!msg || msg.action !== 'PING') sendCount++
      throw new Error('Extension context invalidated')
    }

    await assert.rejects(sandbox.test_sendToTab(456, { action: 'HELLO' }), {
      message: /Security Error/
    })
    assert.strictEqual(sendCount, 1, 'Should have stopped after security error in ensureContentScript')
  })
})
