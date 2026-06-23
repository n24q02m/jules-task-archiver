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
        get: async (key) => {
          return key ? { [key]: currentStorage[key] } : currentStorage
        },
        set: async (data) => {
          currentStorage = { ...currentStorage, ...data }
        }
      },
      sync: {
        get: async (keys) => {
          const res = {}
          if (Array.isArray(keys)) {
            for (const k of keys) res[k] = currentStorage[k]
          } else if (typeof keys === 'string') {
            res[keys] = currentStorage[keys]
          } else {
            return currentStorage
          }
          return res
        }
      },
      local: {
        get: async (keys) => {
          const res = {}
          if (Array.isArray(keys)) {
            for (const k of keys) res[k] = currentStorage[k]
          } else if (typeof keys === 'string') {
            res[keys] = currentStorage[keys]
          } else {
            return currentStorage
          }
          return res
        }
      }
    },
    runtime: {
      onMessage: { addListener: () => {} },
      getPlatformInfo: async () => ({})
    }
  }

  let fetchMock = async () => ({
    ok: true,
    json: async () => []
  })

  const sandbox = {
    chrome: chromeMock,
    fetch: (...args) => fetchMock(...args),
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
    URLSearchParams,
    URL,
    Promise,
    console,
    parseInt,
    crypto,
    importScripts: () => {},
    setFetchMock: (fn) => {
      fetchMock = fn
    }
  }

  vm.createContext(sandbox)

  const scriptContent =
    utilsScriptContent +
    bgScriptContent +
    `\n
    globalThis.test_filterArchivableTasks = filterArchivableTasks;
    globalThis.test_state = () => state;
    globalThis.test_addLog = addLog;
    `

  vm.runInContext(scriptContent, sandbox)

  return { sandbox }
}

describe('filterArchivableTasks', () => {
  it('should archive all tasks when force option is true', async () => {
    const { sandbox } = setupEnvironment()
    const tasks = [
      { id: '1', state: 1, title: 'Task 1' },
      { id: '2', state: 2, title: 'Task 2' }
    ]
    const options = { force: true }

    const result = await sandbox.test_filterArchivableTasks('TEST', tasks, options)

    assert.strictEqual(result.toArchive.length, 2)
    assert.strictEqual(result.toSkip.length, 0)
    assert.strictEqual(result.toArchive[0].id, '1')
    assert.strictEqual(result.toArchive[1].id, '2')

    const state = sandbox.test_state()
    assert.ok(state.log.some((l) => l.includes('FORCE: archiving all 2 tasks')))
  })

  it('should filter non-archivable tasks when force is false', async () => {
    const { sandbox } = setupEnvironment()
    const tasks = [
      { id: '1', state: 1, title: 'Active Task', repo: 'owner/repo', owner: 'owner', repoName: 'repo' },
      { id: '2', state: 2, title: 'Archivable Task 2', repo: 'owner/repo', owner: 'owner', repoName: 'repo' },
      { id: '3', state: 4, title: 'Archivable Task 4', repo: 'owner/repo', owner: 'owner', repoName: 'repo' },
      { id: '4', state: 12, title: 'Archivable Task 12', repo: 'owner/repo', owner: 'owner', repoName: 'repo' },
      { id: '5', state: null, title: 'Null State Task', repo: 'owner/repo', owner: 'owner', repoName: 'repo' }
    ]
    const options = { force: false }

    sandbox.setFetchMock(async () => ({
      ok: true,
      json: async () => []
    }))

    const result = await sandbox.test_filterArchivableTasks('TEST', tasks, options)

    assert.strictEqual(result.toArchive.length, 4)
    assert.strictEqual(result.toArchive[0].id, '2')
    assert.strictEqual(result.toArchive[1].id, '3')
    assert.strictEqual(result.toArchive[2].id, '4')
    assert.strictEqual(result.toArchive[3].id, '5')
    assert.strictEqual(result.toSkip.length, 0)
  })

  it('should skip tasks with matching open PRs (case-insensitive)', async () => {
    const { sandbox } = setupEnvironment({ ghOwner: 'owner' })
    const tasks = [
      { id: '1', state: 2, title: 'Fix BUG', repo: 'owner/repo', owner: 'owner', repoName: 'repo' },
      { id: '2', state: 2, title: 'New feature', repo: 'owner/repo', owner: 'owner', repoName: 'repo' }
    ]
    const options = { force: false }

    sandbox.setFetchMock(async (url) => {
      if (url.includes('/repos/owner/repo/pulls')) {
        return {
          ok: true,
          json: async () => [{ title: 'fix bug PR', head: { ref: 'branch' } }]
        }
      }
      return { ok: true, json: async () => [] }
    })

    const result = await sandbox.test_filterArchivableTasks('TEST', tasks, options)

    assert.strictEqual(result.toArchive.length, 1)
    assert.strictEqual(result.toArchive[0].id, '2')
    assert.strictEqual(result.toSkip.length, 1)
    assert.strictEqual(result.toSkip[0].id, '1')

    const state = sandbox.test_state()
    assert.ok(state.log.some((l) => l.includes('SKIP [1] Fix BUG (matching open PR)')))
  })

  it('should handle tasks across multiple repositories', async () => {
    const { sandbox } = setupEnvironment({ ghOwner: 'owner' })
    const tasks = [
      { id: '1', state: 2, title: 'Repo1 Task', repo: 'owner/repo1', owner: 'owner', repoName: 'repo1' },
      { id: '2', state: 2, title: 'Repo2 Task', repo: 'owner/repo2', owner: 'owner', repoName: 'repo2' }
    ]
    const options = { force: false }

    const fetchedRepos = []
    sandbox.setFetchMock(async (url) => {
      if (url.includes('/repos/owner/repo1/pulls')) {
        fetchedRepos.push('repo1')
        return { ok: true, json: async () => [{ title: 'Repo1 Task', head: { ref: 'b1' } }] }
      }
      if (url.includes('/repos/owner/repo2/pulls')) {
        fetchedRepos.push('repo2')
        return { ok: true, json: async () => [] }
      }
      return { ok: true, json: async () => [] }
    })

    const result = await sandbox.test_filterArchivableTasks('TEST', tasks, options)

    assert.strictEqual(result.toArchive.length, 1)
    assert.strictEqual(result.toArchive[0].id, '2')
    assert.strictEqual(result.toSkip.length, 1)
    assert.strictEqual(result.toSkip[0].id, '1')
    assert.strictEqual(fetchedRepos.length, 2)
    assert.ok(fetchedRepos.includes('repo1'))
    assert.ok(fetchedRepos.includes('repo2'))
  })

  it('should return empty arrays when no tasks are archivable', async () => {
    const { sandbox } = setupEnvironment()
    const tasks = [
      { id: '1', state: 1, title: 'Active Task' },
      { id: '2', state: 3, title: 'Another Active Task' }
    ]
    const options = { force: false }

    const result = await sandbox.test_filterArchivableTasks('TEST', tasks, options)

    assert.strictEqual(result.toArchive.length, 0)
    assert.strictEqual(result.toSkip.length, 0)

    const state = sandbox.test_state()
    assert.ok(state.log.some((l) => l.includes('No archivable tasks among 2')))
  })

  it('should use ghOwner from sync storage if task has no owner', async () => {
    const { sandbox } = setupEnvironment({ ghOwner: 'global-owner' })
    const tasks = [
      { id: '1', state: 2, title: 'Task', repo: 'repo1', repoName: 'repo1' } // no owner
    ]
    const options = { force: false }

    let fetchedUrl = ''
    sandbox.setFetchMock(async (url) => {
      fetchedUrl = url
      return { ok: true, json: async () => [] }
    })

    await sandbox.test_filterArchivableTasks('TEST', tasks, options)

    assert.ok(fetchedUrl.includes('/repos/global-owner/repo1/pulls'))
  })
})
