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

  it('should restore state from storage without error if not running', async () => {
    const existingState = {
      status: 'done',
      log: ['Finished']
    }
    const { sandbox, sessionSetData } = setupEnvironment({ archiveState: existingState })

    await sandbox.test_stateReadyPromise
    await new Promise((resolve) => setTimeout(resolve, 10))

    const state = sandbox.test_state()

    assert.strictEqual(state.status, 'done')
    assert.deepStrictEqual(state.log, ['Finished'])

    // It should not have called chrome.storage.session.set
    assert.strictEqual(sessionSetData.length, 0)
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

    // Set some initial state fields
    sandbox.test_updateState({ status: 'running', currentTab: 'u/0', progress: { archived: 5 } })
    let state = sandbox.test_state()

    assert.strictEqual(state.status, 'running')
    assert.strictEqual(state.currentTab, 'u/0')
    assert.deepStrictEqual(state.progress, { archived: 5 })

    // Partial update: changing only status, others should remain intact
    sandbox.test_updateState({ status: 'done' })
    state = sandbox.test_state()

    assert.strictEqual(state.status, 'done')
    assert.strictEqual(state.currentTab, 'u/0') // Retained
    assert.deepStrictEqual(state.progress, { archived: 5 }) // Retained

    assert.strictEqual(sessionSetData.length, 2)
    assert.strictEqual(sessionSetData[1].archiveState.status, 'done')
    assert.strictEqual(sessionSetData[1].archiveState.currentTab, 'u/0')
  })

  it('should append message to log and update state in addLog()', async () => {
    const { sandbox, sessionSetData } = setupEnvironment({})
    await sandbox.test_stateReadyPromise
    await new Promise((resolve) => setTimeout(resolve, 10))

    sessionSetData.length = 0

    sandbox.test_addLog('Test log message 1')
    sandbox.test_addLog('Test log message 2')
    const state = sandbox.test_state()

    assert.strictEqual(state.log.length, 2)
    assert.strictEqual(state.log[0], 'Test log message 1')
    assert.strictEqual(state.log[1], 'Test log message 2')

    // addLog calls updateState({}) which should trigger storage.set
    assert.strictEqual(sessionSetData.length, 2)
    assert.deepEqual(sessionSetData[1].archiveState.log, ['Test log message 1', 'Test log message 2'])
  })
})
