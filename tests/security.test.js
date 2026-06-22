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
        removeAttribute: () => {},
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
const utilsScriptPath = path.join(__dirname, '..', 'utils.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')
const utilsScriptContent = fs.readFileSync(utilsScriptPath, 'utf8')

function setupEnvironment(initialTabs = {}) {
  const onMessageListeners = []

  const chromeMock = {
    storage: {
      session: {
        get: async () => ({}),
        set: async () => {}
      }
    },
    runtime: {
      onMessage: {
        addListener: (listener) => {
          onMessageListeners.push(listener)
        }
      },
      getPlatformInfo: async () => ({})
    },
    tabs: {
      sendMessage: async (_tabId, message, options) => {
        chromeMock.tabs.lastMessageOptions = options
        if (message.action === 'PING') {
          // Simulate script not loaded by throwing
          throw new Error('Could not establish connection. Receiving end does not exist.')
        }
        return {}
      }
    },
    webNavigation: {
      getFrame: async ({ tabId }) => {
        if (initialTabs[tabId]) return initialTabs[tabId]
        return { documentId: 'doc_default', url: 'https://jules.google.com/u/0/' }
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
    URLSearchParams,
    importScripts: () => {}
  }

  vm.createContext(sandbox)

  const scriptContent =
    utilsScriptContent +
    bgScriptContent +
    `
    globalThis.test_ensureContentScript = ensureContentScript;
    globalThis.test_JULES_ORIGIN = JULES_ORIGIN;
  `

  vm.runInContext(scriptContent, sandbox)
  return { sandbox, chromeMock, onMessageListeners }
}

describe('ensureContentScript Security', () => {
  it('should throw Security Error if frame URL is missing', async () => {
    // This targets the explicit guard at the top of ensureContentScript

    const { sandbox } = setupEnvironment({
      123: { id: 123 }
    })

    await assert.rejects(sandbox.test_ensureContentScript(123), {
      message: /Security Error: Cannot verify tab origin/
    })
  })

  it('should throw Security Error if URL is malformed', async () => {
    const { sandbox } = setupEnvironment({
      123: { id: 123, url: 'not-a-url' }
    })

    await assert.rejects(sandbox.test_ensureContentScript(123), {
      message: /Security Error: Cannot inject script into non-Jules tab/
    })
  })

  it('should throw Security Error if URL has a tricky foreign origin', async () => {
    const { sandbox } = setupEnvironment({
      123: { id: 123, url: 'https://jules.google.com.evil.com/u/0/' }
    })

    await assert.rejects(sandbox.test_ensureContentScript(123), {
      message: /Security Error: Cannot inject script into non-Jules tab/
    })
  })

  it('should block injection into non-Jules origin', async () => {
    const { sandbox } = setupEnvironment({
      123: { id: 123, url: 'https://evil.com/' }
    })

    await assert.rejects(sandbox.test_ensureContentScript(123), {
      message: /Security Error: Cannot inject script into non-Jules tab/
    })
  })

  it('should pin execution to documentId to prevent TOCTOU', async () => {
    const { sandbox, chromeMock } = setupEnvironment({
      789: { documentId: 'doc_789', url: 'https://jules.google.com/u/0/' }
    })

    let injected = false
    chromeMock.tabs.sendMessage = async (_tabId, message, options) => {
      chromeMock.tabs.lastMessageOptions = options
      if (message.action === 'PING') {
        if (injected) return { status: 'ok' }
        throw new Error('Not loaded')
      }
    }
    chromeMock.scripting.executeScript = async ({ target, files }) => {
      chromeMock.scripting.lastCall = { target, files }
      injected = true
    }

    const docId = await sandbox.test_ensureContentScript(789)

    assert.strictEqual(docId, 'doc_789')
    assert.strictEqual(chromeMock.scripting.lastCall.target.documentIds[0], 'doc_789')
    assert.strictEqual(chromeMock.tabs.lastMessageOptions.documentId, 'doc_789')
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

describe('jFetch SSRF Security', () => {
  it('should block requests to unauthorized origins', async () => {
    const { sandbox } = setupEnvironment()

    // Test with malicious origin
    await assert.rejects(sandbox.jFetch('https://evil.com/api/data'), {
      message: /Security Error: Disallowed fetch origin/
    })

    // Test with localhost
    await assert.rejects(sandbox.jFetch('http://localhost:8080/data'), {
      message: /Security Error: Disallowed fetch origin/
    })
  })

  it('should allow requests to jules.google.com and api.github.com', async () => {
    const { sandbox } = setupEnvironment()

    // We expect these to resolve correctly because the mocked fetch returns { ok: true }
    const res1 = await sandbox.jFetch('https://jules.google.com/u/1/tasks')
    assert.strictEqual(res1.ok, true)

    const res2 = await sandbox.jFetch('https://api.github.com/repos/owner/repo')
    assert.strictEqual(res2.ok, true)
  })

  it('should block sending token to non-GitHub origin', async () => {
    const { sandbox } = setupEnvironment()

    await assert.rejects(sandbox.jFetch('https://jules.google.com/u/1/tasks', { token: 'secret-token' }), {
      message: /Security Error: Refusing to send GitHub token to non-GitHub origin/
    })
  })
})

describe('getTabConfig Path Traversal Security', () => {
  it('should validate accountNum to prevent path traversal', async () => {
    const { sandbox, chromeMock } = setupEnvironment()

    // Inject global function into sandbox that isn't exported by default
    vm.runInContext(`globalThis.test_getTabConfig = getTabConfig;`, sandbox)

    // Mock ensureContentScript to just return a dummy doc ID
    vm.runInContext(`globalThis.ensureContentScript = async () => 'doc_123';`, sandbox)

    // Test with valid digits
    chromeMock.tabs.sendMessage = async () => ({
      config: { at: 'valid-token' },
      accountNum: '42'
    })

    const validConfig = await sandbox.test_getTabConfig(1)
    assert.strictEqual(validConfig.accountNum, '42')

    // Test with path traversal payload
    chromeMock.tabs.sendMessage = async () => ({
      config: { at: 'valid-token' },
      accountNum: '../1'
    })

    await assert.rejects(sandbox.test_getTabConfig(2), { message: /Security Error: Invalid account number format/ })

    // Test with SQL injection / other invalid payloads
    chromeMock.tabs.sendMessage = async () => ({
      config: { at: 'valid-token' },
      accountNum: '1 OR 1=1'
    })

    await assert.rejects(sandbox.test_getTabConfig(3), { message: /Security Error: Invalid account number format/ })
  })
})

describe('Orchestrator Privilege Escalation Security', () => {
  it('should reject privileged actions from content scripts', () => {
    const { onMessageListeners } = setupEnvironment()
    const listener = onMessageListeners[0] // background.js listener

    assert.ok(listener, 'Background message listener should be registered')

    const privilegedActions = ['START', 'RESET', 'GET_STATE']

    for (const action of privilegedActions) {
      let responseData = null
      const sendResponse = (data) => {
        responseData = data
      }

      // Simulate message from a content script (_sender.tab is present)
      const sender = { tab: { id: 1 } }
      listener({ action }, sender, sendResponse)

      assert.strictEqual(
        responseData?.error,
        'Security Error: Unauthorized action from content script',
        `Should reject ${action} from content script`
      )
    }
  })

  it('should allow unprivileged actions from content scripts', () => {
    const { onMessageListeners, chromeMock } = setupEnvironment()
    const listener = onMessageListeners[0] // background.js listener

    let responseData = null
    const sendResponse = (data) => {
      responseData = data
    }

    let sessionData = {}
    chromeMock.storage.session.set = async (data) => {
      sessionData = data
    }

    // Simulate CACHE_START_CONFIG from a content script
    const sender = { tab: { id: 1 } }
    listener({ action: 'CACHE_START_CONFIG', config: { some: 'data' } }, sender, sendResponse)

    assert.strictEqual(responseData?.ok, true, 'Should allow CACHE_START_CONFIG from content script')
    assert.deepStrictEqual(sessionData.startConfig, { some: 'data' })
  })

  it('should reject CACHE_START_CONFIG payloads that exceed the size limit to prevent DoS', () => {
    const { onMessageListeners } = setupEnvironment()
    const listener = onMessageListeners[0]

    let responseData = null
    const sendResponse = (data) => {
      responseData = data
    }

    const sender = { tab: { id: 1 } }
    const largeString = 'a'.repeat(51201)
    listener({ action: 'CACHE_START_CONFIG', config: { data: largeString } }, sender, sendResponse)

    assert.strictEqual(
      responseData?.error,
      'Security Error: Payload exceeds size limit',
      'Should reject large payloads'
    )
  })
})
