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
      session: {
        get: async () => ({}),
        set: async () => {}
      }
    },
    runtime: {
      onMessage: { addListener: () => {} },
      getPlatformInfo: async () => ({})
    },
    tabs: {
      get: async (id) => {
        if (initialTabs[id]) return initialTabs[id]
        return { id, url: 'https://jules.google.com/u/0/' }
      },
      sendMessage: async (_tabId, message) => {
        if (message.action === 'PING') {
          // Simulate script not loaded by throwing
          throw new Error('Could not establish connection. Receiving end does not exist.')
        }
        return {}
      }
    },
    scripting: {
      executeScript: async ({ target, files }) => {
        chromeMock.scripting.lastCall = { target, files }
      }
    }
  }

  const sandbox = {
    chrome: chromeMock,
    fetch: async () => ({ ok: true, json: async () => [], text: async () => ")]}'\n\n4\n[[]]" }),
    setTimeout,
    Date,
    Promise,
    Error,
    console,
    URL,
    URLSearchParams
  }

  vm.createContext(sandbox)

  const scriptContent =
    bgScriptContent +
    `
    globalThis.test_ensureContentScript = ensureContentScript;
    globalThis.test_JULES_ORIGIN = JULES_ORIGIN;
  `

  vm.runInContext(scriptContent, sandbox)
  return { sandbox, chromeMock }
}

describe('ensureContentScript Security', () => {
  it('should block injection into non-Jules origin', async () => {
    const { sandbox } = setupEnvironment({
      123: { id: 123, url: 'https://evil.com/' }
    })

    await assert.rejects(sandbox.test_ensureContentScript(123), {
      message: /Security Error: Cannot inject script into non-Jules tab/
    })
  })

  it('should block injection if URL changes to non-Jules origin (TOCTOU)', async () => {
    const { sandbox, chromeMock } = setupEnvironment()

    let callCount = 0
    chromeMock.tabs.get = async (id) => {
      callCount++
      if (callCount === 1) {
        return { id, url: 'https://jules.google.com/u/0/' }
      }
      return { id, url: 'https://evil.com/' }
    }

    // This is expected to fail CURRENTLY because ensureContentScript doesn't re-check the URL
    // We WANT it to fail to prove the vulnerability exists.
    await assert.rejects(sandbox.test_ensureContentScript(123), {
      message: /Security Error: Cannot inject script into non-Jules tab/
    })
  })

  it('should allow injection into valid Jules origin', async () => {
    const { sandbox, chromeMock } = setupEnvironment({
      456: { id: 456, url: 'https://jules.google.com/u/1/' }
    })

    // Mock successful sendMessage after injection to stop the loop
    let injected = false
    chromeMock.tabs.sendMessage = async (_tabId, message) => {
      if (message.action === 'PING') {
        if (injected) return { status: 'ok' }
        throw new Error('Not loaded')
      }
    }
    chromeMock.scripting.executeScript = async () => {
      injected = true
    }

    await sandbox.test_ensureContentScript(456)
    assert.strictEqual(injected, true)
  })
})
