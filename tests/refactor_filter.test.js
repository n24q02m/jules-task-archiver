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
  let currentStorage = { ...initialStorage }

  const chromeMock = {
    storage: {
      session: {
        get: async (key) => key ? { [key]: currentStorage[key] } : currentStorage,
        set: async (data) => { currentStorage = { ...currentStorage, ...data } }
      },
      sync: {
        get: async (keys) => {
          const res = {}
          for (const k of keys) res[k] = currentStorage[k]
          return res
        }
      },
      local: {
        get: async (keys) => {
          const res = {}
          for (const k of keys) res[k] = currentStorage[k]
          return res
        }
      }
    },
    runtime: {
      onMessage: { addListener: () => {} }
    }
  }

  const sandbox = {
    chrome: chromeMock,
    setTimeout: (fn) => fn(),
    setInterval: () => 1,
    clearInterval: () => {},
    Math, Date, JSON, String, Array, Map, Object, Error, URL, Promise, console,
    importScripts: () => {}
  }

  vm.createContext(sandbox)
  const scriptContent = utilsScriptContent + bgScriptContent + `
    globalThis.test_filterArchivableCandidates = filterArchivableCandidates;
    globalThis.test_filterTasksByOpenPRs = filterTasksByOpenPRs;
    globalThis.test_state = () => state;
  `
  const script = new vm.Script(scriptContent)
  script.runInContext(sandbox)
  return { sandbox }
}

describe('Refactored Filtering Helpers', () => {
  it('filterArchivableCandidates should separate archivable from active tasks', () => {
    const { sandbox } = setupEnvironment()
    const tasks = [
      { id: '1', state: 2, title: 'Archivable' },
      { id: '2', state: 1, title: 'Active' },
      { id: '3', state: 4, title: 'Archivable 2' }
    ]

    const candidates = sandbox.test_filterArchivableCandidates('test', tasks)
    assert.strictEqual(candidates.length, 2)
    assert.strictEqual(candidates[0].id, '1')
    assert.strictEqual(candidates[1].id, '3')
    const state = sandbox.test_state()
    assert.ok(state.log.some(l => l.includes('2 archivable, 1 active')))
  })

  it('filterTasksByOpenPRs should skip tasks with open PRs', async () => {
    const { sandbox } = setupEnvironment({ ghOwner: 'owner', ghToken: 'token' })
    const candidates = [
      { id: '1', repo: 'owner/repo', owner: 'owner', repoName: 'repo', title: 'Feature X' },
      { id: '2', repo: 'owner/repo', owner: 'owner', repoName: 'repo', title: 'Feature Y' }
    ]

    sandbox.getOpenPRs = async () => [{ titleLower: 'feature x' }]

    const { toArchive, toSkip } = await sandbox.test_filterTasksByOpenPRs('test', candidates)

    assert.strictEqual(toArchive.length, 1)
    assert.strictEqual(toArchive[0].id, '2')
    assert.strictEqual(toSkip.length, 1)
    assert.strictEqual(toSkip[0].id, '1')
  })
})
