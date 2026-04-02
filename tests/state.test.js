const { describe, it } = require('node:test')
const assert = require('node:assert')
const { setupEnvironment } = require('./test-helper.js')

describe('state management', () => {
  it('should initialize cleanly without existing state', async () => {
    const { sandbox } = setupEnvironment({})
    await sandbox.test_stateReadyPromise
    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'idle')
    assert.strictEqual(state.log.length, 0)
  })

  it('should handle interrupted running state', async () => {
    const existingState = { status: 'running', log: ['Started...'] }
    const { sandbox, sessionSetData } = setupEnvironment({ archiveState: existingState })
    await sandbox.test_stateReadyPromise
    // Wait for the stateReadyPromise's .then to execute
    await new Promise((resolve) => setTimeout(resolve, 10))

    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'error')
    assert.strictEqual(state.error, 'Operation interrupted (browser killed service worker)')
    // Verify it saved the error state back to storage
    assert.strictEqual(sessionSetData.length, 1)
    assert.strictEqual(sessionSetData[0].archiveState.status, 'error')
  })

  it('should persist state on update', async () => {
    const { sandbox, sessionSetData } = setupEnvironment({})
    await sandbox.test_stateReadyPromise
    await new Promise((resolve) => setTimeout(resolve, 10))
    sessionSetData.length = 0

    sandbox.test_updateState({ status: 'done', currentTab: 'u/0' })
    assert.strictEqual(sandbox.test_state().status, 'done')
    assert.strictEqual(sessionSetData.length, 1)
    assert.strictEqual(sessionSetData[0].archiveState.status, 'done')
  })

  it('should add to log and persist on addLog', async () => {
    const { sandbox, sessionSetData } = setupEnvironment({})
    await sandbox.test_stateReadyPromise
    await new Promise((resolve) => setTimeout(resolve, 10))
    sessionSetData.length = 0

    sandbox.test_addLog('First message')
    sandbox.test_addLog('Second message')

    const state = sandbox.test_state()
    assert.strictEqual(state.log.length, 2)
    assert.strictEqual(state.log[0], 'First message')
    assert.strictEqual(state.log[1], 'Second message')

    // addLog calls updateState({}), which sets archiveState: state
    assert.strictEqual(sessionSetData.length, 2)
    assert.deepEqual(sessionSetData[1].archiveState.log, ['First message', 'Second message'])
  })
})
