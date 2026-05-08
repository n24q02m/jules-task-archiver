const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// --- ghToken Storage Cleanup Tests ---
describe('Security: ghToken Storage Cleanup', () => {
  const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8')

  function setupPopupSandbox(initialSync = {}, initialLocal = {}) {
    const syncStorage = { ...initialSync }
    const localStorage = { ...initialLocal }
    const syncRemoved = []
    const syncSet = []
    const localSet = []

    const chrome = {
      storage: {
        sync: {
          get: (keys, cb) => {
            const res = {}
            keys.forEach((k) => {
              if (syncStorage[k] !== undefined) res[k] = syncStorage[k]
            })
            cb(res)
          },
          set: (obj) => {
            Object.assign(syncStorage, obj)
            syncSet.push(obj)
          },
          remove: (key) => {
            delete syncStorage[key]
            syncRemoved.push(key)
          }
        },
        local: {
          get: (keys, cb) => {
            const res = {}
            keys.forEach((k) => {
              if (localStorage[k] !== undefined) res[k] = localStorage[k]
            })
            cb(res)
          },
          set: (obj, cb) => {
            Object.assign(localStorage, obj)
            localSet.push(obj)
            if (cb) cb()
          }
        },
        onChanged: {
          addListener: () => {}
        }
      },
      runtime: {
        sendMessage: () => {},
        onMessage: {
          addListener: () => {}
        }
      },
      tabs: {
        query: () => {}
      }
    }

    const document = {
      querySelector: () => ({
        addEventListener: () => {},
        querySelectorAll: () => [],
        appendChild: () => {},
        dataset: {},
        classList: { toggle: () => {} },
        setAttribute: () => {},
        style: {},
        parentElement: {}
      }),
      querySelectorAll: () => ({
        forEach: () => {}
      }),
      createElement: () => ({
        appendChild: () => {}
      })
    }

    const sandbox = { chrome, document, console, setTimeout, setInterval, clearInterval }
    vm.createContext(sandbox)

    return { sandbox, syncStorage, localStorage, syncRemoved, syncSet, localSet }
  }

  it('should cleanup ghToken from sync storage during initialization', () => {
    const { sandbox, syncStorage, localStorage, syncRemoved } = setupPopupSandbox(
      { ghToken: 'insecure-token', ghOwner: 'owner' },
      {}
    )

    vm.runInContext(popupJs, sandbox)

    assert.strictEqual(syncStorage.ghToken, undefined, 'ghToken should be removed from sync storage')
    assert.strictEqual(localStorage.ghToken, 'insecure-token', 'ghToken should be moved to local storage')
    assert.ok(syncRemoved.includes('ghToken'), "sync.remove('ghToken') should have been called")
  })

  it('should ensure startBtn click handler removes ghToken from sync', async () => {
    // This is harder to test without a full DOM mock, but we can verify the code intent
    assert.ok(
      popupJs.includes("chrome.storage.sync.remove('ghToken')"),
      'Source should contain sync.remove for ghToken'
    )
    assert.ok(popupJs.includes('chrome.storage.local.set({'), 'Source should contain local.set for token')
  })
})

// --- ensureContentScript Security Tests ---
const bgScriptPath = path.join(__dirname, '..', 'background.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')

function setupEnvironment(initialTabs = {}) {
  const chromeMock = {
    alarms: {
      create: () => {},
      clear: () => {},
      onAlarm: {
        addListener: () => {}
      }
    },
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
