const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')

function setupEnvironment(initialStorage = {}) {
  const sessionSetData = []
  let currentStorage = { ...initialStorage }

  const chromeMock = {
    storage: {
      session: {
        get: async (key) => {
          return key ? { [key]: currentStorage[key] } : currentStorage
        },
        set: async (data) => {
          sessionSetData.push(data)
          currentStorage = { ...currentStorage, ...data }
        }
      },
      sync: {
        get: async () => ({})
      }
    },
    runtime: {
      onMessage: {
        addListener: () => {}
      },
      getPlatformInfo: async () => ({})
    },
    tabs: {
      query: async () => [],
      sendMessage: async () => ({})
    },
    scripting: {
      executeScript: async () => {}
    }
  }

  const sandbox = {
    chrome: chromeMock,
    fetch: async () => ({ ok: true, json: async () => [] }),
    setTimeout,
    setInterval,
    clearInterval,
    console
  }

  vm.createContext(sandbox)

  const scriptContent =
    bgScriptContent +
    `\n
    // Export necessary variables to the global scope for testing
    globalThis.test_stateReadyPromise = stateReadyPromise;
    globalThis.test_state = () => state;
    globalThis.test_updateState = updateState;
    globalThis.test_addLog = addLog;
  `

  const script = new vm.Script(scriptContent)
  script.runInContext(sandbox)

  return { sandbox, sessionSetData, currentStorage }
}

describe('background.js state management', () => {
  it('should initialize cleanly without existing state', async () => {
    const { sandbox } = setupEnvironment({})
    await sandbox.test_stateReadyPromise
    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'idle')
    assert.strictEqual(state.log.length, 0)
  })

  it('should restore state from storage and handle interrupted running state', async () => {
    const existingState = {
      status: 'running',
      log: ['Started...']
    }
    const { sandbox, sessionSetData } = setupEnvironment({ archiveState: existingState })

    await sandbox.test_stateReadyPromise
    await new Promise((resolve) => setTimeout(resolve, 10))

    const state = sandbox.test_state()

    assert.strictEqual(state.status, 'error')
    assert.strictEqual(state.error, 'Operation interrupted (browser killed service worker)')
    assert.strictEqual(state.log[state.log.length - 1], '\n[!] Service worker was terminated during operation.')

    // It should have called chrome.storage.session.set to save the updated error state
    assert.strictEqual(sessionSetData.length, 1)
    assert.deepStrictEqual(sessionSetData[0].archiveState.status, 'error')
  })

  it('should update state and write to storage in updateState()', async () => {
    const { sandbox, sessionSetData } = setupEnvironment({})
    await sandbox.test_stateReadyPromise
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Clear initial sets if any (none expected from normal init)
    sessionSetData.length = 0

    sandbox.test_updateState({ status: 'done', currentTab: 'u/0' })
    const state = sandbox.test_state()

    assert.strictEqual(state.status, 'done')
    assert.strictEqual(state.currentTab, 'u/0')

    assert.strictEqual(sessionSetData.length, 1)
    assert.strictEqual(sessionSetData[0].archiveState.status, 'done')
    assert.strictEqual(sessionSetData[0].archiveState.currentTab, 'u/0')
  })

  it('should append message to log and update state in addLog()', async () => {
    const { sandbox, sessionSetData } = setupEnvironment({})
    await sandbox.test_stateReadyPromise
    await new Promise((resolve) => setTimeout(resolve, 10))

    sessionSetData.length = 0

    sandbox.test_addLog('Test log message')
    const state = sandbox.test_state()

    assert.strictEqual(state.log.length, 1)
    assert.strictEqual(state.log[0], 'Test log message')

    // addLog calls updateState({}) which should trigger storage.set
    assert.strictEqual(sessionSetData.length, 1)
    assert.strictEqual(sessionSetData[0].archiveState.log[0], 'Test log message')
  })
})

describe('background.js sendToTab error paths and retries', () => {
  it('should retry and eventually throw if content script never loads', async () => {
    let sendMessageAttempts = 0
    let executeScriptCalls = 0

    const chromeMock = {
      storage: {
        session: { get: async () => ({}), set: async () => {} },
        sync: { get: async () => ({}) }
      },
      runtime: {
        onMessage: { addListener: () => {} },
        getPlatformInfo: async () => ({})
      },
      tabs: {
        get: async () => ({ url: 'https://jules.google.com/u/0' }),
        sendMessage: async () => {
          sendMessageAttempts++
          throw new Error('Could not establish connection')
        }
      },
      scripting: {
        executeScript: async () => {
          executeScriptCalls++
        }
      }
    }

    const sandbox = {
      chrome: chromeMock,
      setTimeout: (cb) => cb(), // fast forward
      setInterval: () => {},
      console,
      Promise: global.Promise
    }

    vm.createContext(sandbox)
    const script = new vm.Script(`${bgScriptContent}\nglobalThis.test_sendToTab = sendToTab;`)
    script.runInContext(sandbox)

    await assert.rejects(
      async () => {
        await sandbox.test_sendToTab(1, { action: 'TEST' }, 3)
      },
      { message: 'Could not establish connection' }
    )

    // 1 (init) + 1 (PING init) + 10 (PING poll) + 1 (post ensure) + 2 (retries) = 15
    assert.strictEqual(sendMessageAttempts, 15)
    assert.strictEqual(executeScriptCalls, 1)
  })

  it('should recover if ensureContentScript successfully injects the script', async () => {
    let sendMessageAttempts = 0
    let executeScriptCalls = 0
    let scriptInjected = false

    const chromeMock = {
      storage: {
        session: { get: async () => ({}), set: async () => {} },
        sync: { get: async () => ({}) }
      },
      runtime: {
        onMessage: { addListener: () => {} },
        getPlatformInfo: async () => ({})
      },
      tabs: {
        get: async () => ({ url: 'https://jules.google.com/u/0' }),
        sendMessage: async (_tabId, msg) => {
          sendMessageAttempts++
          if (!scriptInjected) {
            throw new Error('Could not establish connection')
          }
          return { success: true, msg: msg.action }
        }
      },
      scripting: {
        executeScript: async () => {
          executeScriptCalls++
          scriptInjected = true
        }
      }
    }

    const sandbox = {
      chrome: chromeMock,
      setTimeout: (cb) => cb(),
      setInterval: () => {},
      console,
      Promise: global.Promise
    }

    vm.createContext(sandbox)
    const script = new vm.Script(`${bgScriptContent}\nglobalThis.test_sendToTab = sendToTab;`)
    script.runInContext(sandbox)

    const result = await sandbox.test_sendToTab(1, { action: 'TEST' }, 3)

    assert.deepStrictEqual(result, { success: true, msg: 'TEST' })
    // 1 (init) + 1 (PING after inject) + 1 (post ensure) = 3
    assert.strictEqual(sendMessageAttempts, 4)
    assert.strictEqual(executeScriptCalls, 1)
  })

  it('should fall back to retry loop if ensureContentScript fails completely', async () => {
    let sendMessageAttempts = 0

    const chromeMock = {
      storage: {
        session: { get: async () => ({}), set: async () => {} },
        sync: { get: async () => ({}) }
      },
      runtime: {
        onMessage: { addListener: () => {} },
        getPlatformInfo: async () => ({})
      },
      tabs: {
        get: async () => ({ url: 'https://invalid.com' }), // Will make ensureContentScript throw
        sendMessage: async (_tabId, _msg) => {
          sendMessageAttempts++
          if (sendMessageAttempts < 3) {
            throw new Error('Not ready yet')
          }
          return { success: true }
        }
      },
      scripting: {
        executeScript: async () => {
          assert.fail('Should not execute script on non-jules tab')
        }
      }
    }

    const sandbox = {
      chrome: chromeMock,
      setTimeout: (cb) => cb(),
      setInterval: () => {},
      console,
      Promise: global.Promise
    }

    vm.createContext(sandbox)
    const script = new vm.Script(`${bgScriptContent}\nglobalThis.test_sendToTab = sendToTab;`)
    script.runInContext(sandbox)

    const result = await sandbox.test_sendToTab(1, { action: 'TEST' }, 3)

    assert.deepStrictEqual(result, { success: true })
    assert.strictEqual(sendMessageAttempts, 3)
  })
})
