const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')

function setupEnvironment() {
  const messageListeners = []
  const chromeMock = {
    runtime: {
      onMessage: {
        addListener: (fn) => messageListeners.push(fn),
        removeListener: (fn) => {
          const idx = messageListeners.indexOf(fn)
          if (idx !== -1) messageListeners.splice(idx, 1)
        }
      },
      getPlatformInfo: async () => ({})
    },
    storage: {
      session: { get: async () => ({}), set: async () => {} },
      sync: { get: async () => ({}) },
      local: { get: async () => ({}) }
    },
    tabs: {
      get: async (id) => ({ id, url: 'https://jules.google.com/u/0/session' }),
      sendMessage: async (tabId, msg) => {
        if (msg.action === 'PING' && chromeMock.tabs.shouldFailPing) {
          return Promise.reject(new Error('Fail PING'))
        }
        return { ok: true }
      }
    },
    scripting: {
      executeScript: async () => {
        chromeMock.scripting.calledExecuteScript = true
        // Simulate content script sending READY message
        setTimeout(() => {
          messageListeners.forEach((fn) => {
            fn({ action: 'READY' }, { tab: { id: 123 } }, () => {})
          })
        }, 10)
      }
    }
  }

  const sandbox = {
    chrome: chromeMock,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Math,
    Date,
    JSON,
    String,
    Array,
    Map,
    Object,
    Error,
    Promise,
    console,
    parseInt
  }

  return { sandbox, chromeMock, messageListeners }
}

describe('ensureContentScript improved', () => {
  it('should inject content script and wait for READY if PING fails', async () => {
    const { sandbox, chromeMock } = setupEnvironment()
    vm.createContext(sandbox)
    new vm.Script(bgScriptContent).runInContext(sandbox)
    chromeMock.tabs.shouldFailPing = true

    const ensureContentScript = sandbox.ensureContentScript

    await ensureContentScript(123)

    assert.strictEqual(chromeMock.scripting.calledExecuteScript, true)
  })

  it('should timeout and fallback to PING if READY never arrives', async () => {
    const { sandbox, chromeMock } = setupEnvironment()

    // Override executeScript to NOT send READY
    chromeMock.scripting.executeScript = async () => {
      chromeMock.scripting.calledExecuteScript = true
      // Don't send READY
    }

    const bgContentSpeedUp = bgScriptContent.replace('5000', '100')
    vm.createContext(sandbox)
    new vm.Script(bgContentSpeedUp).runInContext(sandbox)

    const ensureContentScript = sandbox.ensureContentScript

    // Initial PING should fail to trigger injection
    chromeMock.tabs.shouldFailPing = true

    // Make fallback PING succeed
    const originalSendMessage = chromeMock.tabs.sendMessage
    chromeMock.tabs.sendMessage = async (tabId, msg) => {
      if (msg.action === 'PING') {
        if (chromeMock.tabs.shouldFailPing) {
          chromeMock.tabs.shouldFailPing = false
          throw new Error('Fail PING')
        }
        return { ok: true }
      }
      return originalSendMessage(tabId, msg)
    }

    await ensureContentScript(123)
    assert.strictEqual(chromeMock.scripting.calledExecuteScript, true)
  })

  it('should fail if READY never arrives and fallback PING fails', async () => {
    const { sandbox, chromeMock } = setupEnvironment()

    chromeMock.scripting.executeScript = async () => {
      chromeMock.scripting.calledExecuteScript = true
    }

    const bgContentSpeedUp = bgScriptContent.replace('5000', '100')
    vm.createContext(sandbox)
    new vm.Script(bgContentSpeedUp).runInContext(sandbox)

    const ensureContentScript = sandbox.ensureContentScript

    // Initial PING fails
    chromeMock.tabs.shouldFailPing = true

    // Make fallback PING fail too
    chromeMock.tabs.sendMessage = async () => {
      throw new Error('Total failure')
    }

    await assert.rejects(ensureContentScript(123), /Content script injection timed out/)
  })
})
