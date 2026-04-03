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
    globalThis.test_getTabLabel = getTabLabel;
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

describe('getTabLabel', () => {
  it('should extract single-digit account ID from URL', () => {
    const { sandbox } = setupEnvironment({})
    const tab = { url: 'https://jules.google.com/u/1/tasks' }
    assert.strictEqual(sandbox.test_getTabLabel(tab), 'u/1')
  })

  it('should extract multi-digit account ID from URL', () => {
    const { sandbox } = setupEnvironment({})
    const tab = { url: 'https://jules.google.com/u/12/tasks' }
    assert.strictEqual(sandbox.test_getTabLabel(tab), 'u/12')
  })

  it('should return default if no account ID is in URL', () => {
    const { sandbox } = setupEnvironment({})
    const tab = { url: 'https://jules.google.com/tasks' }
    assert.strictEqual(sandbox.test_getTabLabel(tab), 'default')
  })

  it('should handle URLs with query parameters correctly', () => {
    const { sandbox } = setupEnvironment({})
    const tab = { url: 'https://jules.google.com/u/3/tasks?query=hello' }
    assert.strictEqual(sandbox.test_getTabLabel(tab), 'u/3')
  })

  it('should return default for URLs with invalid account ID format', () => {
    const { sandbox } = setupEnvironment({})
    const tab = { url: 'https://jules.google.com/u/abc/tasks' }
    assert.strictEqual(sandbox.test_getTabLabel(tab), 'default')
  })
})
