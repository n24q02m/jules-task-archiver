const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const utilsScriptPath = path.join(__dirname, '..', 'utils.js')
let bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')
const utilsScriptContent = fs.readFileSync(utilsScriptPath, 'utf8')

// Remove top-level code that might cause side effects or require more mocks
bgScriptContent = bgScriptContent.replace(/importScripts\(['"']utils\.js['"']\)/g, '')
// Mock chrome.runtime.onMessage.addListener
bgScriptContent = bgScriptContent.replace(/chrome\.runtime\.onMessage\.addListener/g, '(function(){})')

function setupEnvironment(initialStorage = {}) {
  const currentStorage = { ...initialStorage }
  const logs = []

  const chromeMock = {
    storage: {
      sync: {
        get: async () => ({ ghOwner: 'test-owner' })
      },
      local: {
        get: async () => ({ ghToken: 'test-token' })
      },
      session: {
        get: async (key) => ({ [key]: currentStorage[key] }),
        set: async (data) => {
          Object.assign(currentStorage, data)
        }
      }
    },
    runtime: {
      onMessage: { addListener: () => {} },
      getPlatformInfo: async () => ({})
    }
  }

  const sandbox = {
    chrome: chromeMock,
    fetch: async () => ({ ok: true, json: async () => [] }),
    addLog: (msg) => logs.push(msg),
    runInPool: async (items, _limit, worker) => {
      return Promise.all(items.map(worker))
    },
    // Mock other globals
    API_CONCURRENCY: 5,
    console,
    Promise,
    Map,
    Set,
    JSON,
    Math,
    Array,
    Object,
    String,
    Error,
    // Functions that would normally be there
    getOpenPRs: async () => [],
    taskHasOpenPR: () => false,
    groupTasksByRepo: (tasks) => {
      const map = new Map()
      for (const t of tasks) {
        const repo = t.repo || 'unknown'
        if (!map.has(repo)) map.set(repo, [])
        map.get(repo).push(t)
      }
      return map
    },
    isArchivable: (t) => t.state === null || [2, 4, 12].includes(t.state),
    importScripts: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    setTimeout: (fn, _ms) => {
      fn()
    },
    clearTimeout: () => {}
  }

  vm.createContext(sandbox)

  const scriptContent = `${utilsScriptContent + bgScriptContent}
    globalThis.test_filterArchivableCandidates = filterArchivableCandidates;
    globalThis.test_filterTasksByOpenPRs = filterTasksByOpenPRs;
    globalThis.test_filterArchivableTasks = filterArchivableTasks;
  `
  vm.runInContext(scriptContent, sandbox)

  return { sandbox, logs }
}

describe('filterArchivableTasks refactoring', () => {
  it('filterArchivableCandidates returns all tasks when force=true', () => {
    const { sandbox } = setupEnvironment()
    const tasks = [
      { id: '1', state: 1 },
      { id: '2', state: 2 }
    ]
    const result = sandbox.test_filterArchivableCandidates('test', tasks, { force: true })

    assert.strictEqual(result.candidates.length, 2)
    assert.strictEqual(result.toArchive.length, 2)
    assert.strictEqual(JSON.stringify(result.toSkip), '[]')
  })

  it('filterArchivableCandidates filters by isArchivable when force=false', () => {
    const { sandbox } = setupEnvironment()
    const tasks = [
      { id: '1', state: 1 }, // active
      { id: '2', state: 2 }, // archivable
      { id: '3', state: null } // archivable
    ]
    const result = sandbox.test_filterArchivableCandidates('test', tasks, { force: false })

    assert.strictEqual(result.candidates.length, 2)
    assert.strictEqual(result.candidates[0].id, '2')
    assert.strictEqual(result.candidates[1].id, '3')
    assert.strictEqual(result.toArchive, null)
  })

  it('filterTasksByOpenPRs skips tasks with open PRs', async () => {
    const { sandbox } = setupEnvironment()

    // Mock taskHasOpenPR to simulate PR match
    sandbox.taskHasOpenPR = (task, _prs) => task.id === 'skip-me'
    sandbox.getOpenPRs = async () => [{ title: 'PR' }]

    const candidates = [
      { id: 'keep-me', title: 'Task 1', repo: 'repo1' },
      { id: 'skip-me', title: 'Task 2', repo: 'repo1' }
    ]

    const result = await sandbox.test_filterTasksByOpenPRs('test', candidates)

    assert.strictEqual(result.toArchive.length, 1)
    assert.strictEqual(result.toArchive[0].id, 'keep-me')
    assert.strictEqual(result.toSkip.length, 1)
    assert.strictEqual(result.toSkip[0].id, 'skip-me')
  })

  it('filterArchivableTasks orchestrates correctly', async () => {
    const { sandbox } = setupEnvironment()

    const tasks = [
      { id: '1', state: 2, title: 'Task 1', repo: 'repo1' },
      { id: '2', state: 1, title: 'Task 2', repo: 'repo1' }
    ]

    // Test normal flow
    const result = await sandbox.test_filterArchivableTasks('test', tasks, { force: false })
    assert.strictEqual(result.toArchive.length, 1)
    assert.strictEqual(result.toArchive[0].id, '1')

    // Test force flow
    const resultForce = await sandbox.test_filterArchivableTasks('test', tasks, { force: true })
    assert.strictEqual(resultForce.toArchive.length, 2)
  })
})
