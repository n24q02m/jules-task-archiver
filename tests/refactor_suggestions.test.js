const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const utilsScriptPath = path.join(__dirname, '..', 'utils.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')
const utilsScriptContent = fs.readFileSync(utilsScriptPath, 'utf8')

function setupEnvironment(initialStorage = {}) {
  const currentStorage = { ...initialStorage }

  const chromeMock = {
    storage: {
      session: {
        get: async (key) => {
          return key ? { [key]: currentStorage[key] } : currentStorage
        },
        set: async (data) => {
          Object.assign(currentStorage, data)
        }
      },
      sync: { get: async () => ({}) },
      local: { get: async () => ({}) }
    },
    runtime: {
      onMessage: { addListener: () => {} }
    },
    crypto: {
      getRandomValues: (arr) => arr
    }
  }

  const sandbox = {
    chrome: chromeMock,
    fetch: async () => ({ ok: true, json: async () => [] }),
    setTimeout,
    clearTimeout,
    setInterval: () => {},
    clearInterval: () => {},
    Math,
    Date,
    JSON,
    String,
    Array,
    Map,
    Object,
    Error,
    URL,
    Promise,
    console,
    crypto: {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 1000000)
        return arr
      }
    },
    importScripts: () => {}
  }

  vm.createContext(sandbox)
  vm.runInContext(utilsScriptContent + bgScriptContent, sandbox)

  return sandbox
}

describe('processSuggestionsForTab Refactor', () => {
  it('fetchSuggestionsForRepos should fetch and flatten suggestions', async () => {
    const sandbox = setupEnvironment()

    // Mock dependencies
    sandbox.listSuggestions = async (repo) => {
      if (repo === 'repo1') return [{ id: 's1', title: 'S1' }]
      if (repo === 'repo2')
        return [
          { id: 's2', title: 'S2' },
          { id: 's3', title: 'S3' }
        ]
      return []
    }
    sandbox.addLog = () => {}
    sandbox.runInPool = async (items, _concurrency, fn) => {
      const results = []
      for (const item of items) results.push(await fn(item))
      return results
    }
    sandbox.globalLimit = (fn) => fn()

    const work = await sandbox.test_fetchSuggestionsForRepos('label', ['repo1', 'repo2'], {})
    assert.strictEqual(work.length, 3)
    assert.strictEqual(work[0].repo, 'repo1')
    assert.strictEqual(work[0].s.id, 's1')
    assert.strictEqual(work[1].repo, 'repo2')
    assert.strictEqual(work[1].s.id, 's2')
    assert.strictEqual(work[2].repo, 'repo2')
    assert.strictEqual(work[2].s.id, 's3')
  })

  it('applyQuotaLimit should cap suggestions based on quota', async () => {
    const sandbox = setupEnvironment()
    sandbox.addLog = () => {}
    sandbox.getDailySessionQuota = async () => ({ used: 5, limit: 10, remaining: 5 })

    const work = Array(8).fill({ repo: 'repo', s: {} })
    const toStart = await sandbox.test_applyQuotaLimit('label', work, {})
    assert.strictEqual(toStart.length, 5)
  })

  it('applyQuotaLimit should return empty if quota is reached', async () => {
    const sandbox = setupEnvironment()
    sandbox.addLog = () => {}
    sandbox.getDailySessionQuota = async () => ({ used: 10, limit: 10, remaining: 0 })

    const work = Array(8).fill({ repo: 'repo', s: {} })
    const toStart = await sandbox.test_applyQuotaLimit('label', work, {})
    assert.strictEqual(toStart.length, 0)
  })

  it('executeStartSuggestions should respect dryRun', async () => {
    const sandbox = setupEnvironment()
    vm.runInContext('var startedCount = 0; startSuggestion = async () => { startedCount++; }', sandbox)
    sandbox.addLog = () => {}
    sandbox.runInPool = async (items, _concurrency, fn) => {
      for (const item of items) await fn(item)
    }
    sandbox.globalLimit = (fn) => fn()
    sandbox.withRetry = (fn) => fn()
    sandbox.updateState = () => {}

    const toStart = [{ repo: 'repo1', s: { title: 'S1' } }]
    const total = await sandbox.test_executeStartSuggestions('label', toStart, {}, {}, { dryRun: true })

    assert.strictEqual(total, 0)
    assert.strictEqual(sandbox.startedCount, 0)
  })

  it('executeStartSuggestions should start suggestions when not dryRun', async () => {
    const sandbox = setupEnvironment()
    vm.runInContext('var startedCount = 0; startSuggestion = async () => { startedCount++; }', sandbox)
    sandbox.addLog = () => {}
    sandbox.runInPool = async (items, _concurrency, fn) => {
      for (const item of items) await fn(item)
    }
    sandbox.globalLimit = (fn) => fn()
    sandbox.withRetry = (fn) => fn()
    sandbox.updateState = () => {}

    // In our test environment, 'state' should be initialized after running the script
    vm.runInContext("state.status = 'running'; state.progress = { total: 0, archived: 0 };", sandbox)

    const toStart = [
      { repo: 'repo1', s: { title: 'S1' } },
      { repo: 'repo2', s: { title: 'S2' } }
    ]
    const total = await sandbox.test_executeStartSuggestions('label', toStart, {}, {}, { dryRun: false })

    assert.strictEqual(total, 2)
    assert.strictEqual(sandbox.startedCount, 2)
    const finalState = vm.runInContext('state', sandbox)
    assert.strictEqual(finalState.progress.total, 2)
    assert.strictEqual(finalState.progress.archived, 2)
  })
})
