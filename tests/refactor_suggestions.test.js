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
        get: async (key) => (key ? { [key]: currentStorage[key] } : currentStorage),
        set: async (data) => {
          currentStorage = { ...currentStorage, ...data }
        }
      },
      sync: { get: async () => ({}) },
      local: { get: async () => ({}) }
    },
    runtime: {
      onMessage: { addListener: () => {} }
    },
    webNavigation: {
      getFrame: async () => ({ url: 'https://jules.google.com/u/0/session', documentId: 'doc1' })
    },
    tabs: {
      get: async (id) => ({ id, url: 'https://jules.google.com/u/0/session' }),
      sendMessage: async () => ({
        config: { at: 'token', bl: 'build', fsid: '123' },
        accountNum: '0'
      })
    },
    scripting: { executeScript: async () => {} }
  }

  const sandbox = {
    chrome: chromeMock,
    fetch: async () => ({ ok: true, text: async () => ")]}'\n\n4\n[[]]" }),
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    setInterval: () => 1,
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
    importScripts: () => {}
  }

  vm.createContext(sandbox)

  const scriptContent =
    utilsScriptContent +
    bgScriptContent +
    `
    globalThis.test_processSuggestionsForTab = processSuggestionsForTab;
    globalThis.test_discoverSuggestions = discoverSuggestions;
    globalThis.test_applySuggestionQuota = applySuggestionQuota;
    globalThis.test_executeStartSuggestions = executeStartSuggestions;
    globalThis.test_state = () => state;
  `

  vm.runInContext(scriptContent, sandbox)
  return { sandbox }
}

describe('processSuggestionsForTab Refactoring', () => {
  describe('discoverSuggestions', () => {
    it('should discover suggestions from enabled repos', async () => {
      const { sandbox } = setupEnvironment()
      sandbox.safeListSources = async () => ['github/owner/repo']
      sandbox.listSuggestions = async () => [{ id: 's1', title: 'S1' }]

      const work = await sandbox.test_discoverSuggestions('label', {})
      assert.strictEqual(work.length, 1)
      assert.strictEqual(work[0].repo, 'github/owner/repo')
      assert.strictEqual(work[0].s.id, 's1')
    })

    it('should return empty array if no repos enabled', async () => {
      const { sandbox } = setupEnvironment()
      sandbox.safeListSources = async () => null

      const work = await sandbox.test_discoverSuggestions('label', {})
      assert.strictEqual(work.length, 0)
    })
  })

  describe('applySuggestionQuota', () => {
    it('should cap work based on quota', async () => {
      const { sandbox } = setupEnvironment()
      sandbox.getDailySessionQuota = async () => ({ used: 0, limit: 10, remaining: 2 })
      const work = [{ s: { id: '1' } }, { s: { id: '2' } }, { s: { id: '3' } }]

      const toStart = await sandbox.test_applySuggestionQuota('label', work, {})
      assert.strictEqual(toStart.length, 2)
    })

    it('should return all work if within quota', async () => {
      const { sandbox } = setupEnvironment()
      sandbox.getDailySessionQuota = async () => ({ used: 0, limit: 10, remaining: 5 })
      const work = [{ s: { id: '1' } }, { s: { id: '2' } }]

      const toStart = await sandbox.test_applySuggestionQuota('label', work, {})
      assert.strictEqual(toStart.length, 2)
    })
  })

  describe('executeStartSuggestions', () => {
    it('should start suggestions and update state', async () => {
      const { sandbox } = setupEnvironment()
      let callCount = 0
      sandbox.startSuggestion = async () => {
        callCount++
      }
      const toStart = [{ repo: 'r1', s: { id: '1', title: 'T1' } }]

      const count = await sandbox.test_executeStartSuggestions('label', toStart, {}, {}, { dryRun: false })
      assert.strictEqual(count, 1)
      assert.strictEqual(callCount, 1)
      assert.strictEqual(sandbox.test_state().progress.total, 1)
      assert.strictEqual(sandbox.test_state().progress.archived, 1)
    })

    it('should log instead of starting in dry run', async () => {
      const { sandbox } = setupEnvironment()
      let callCount = 0
      sandbox.startSuggestion = async () => {
        callCount++
      }
      const toStart = [{ repo: 'r1', s: { id: '1', title: 'T1', categorySlug: 'cat' } }]

      const count = await sandbox.test_executeStartSuggestions('label', toStart, {}, {}, { dryRun: true })
      assert.strictEqual(count, 0)
      assert.strictEqual(callCount, 0)
      assert.ok(sandbox.test_state().log.some((l) => l.includes('[DRY] Would start')))
    })
  })

  describe('Integration: processSuggestionsForTab', () => {
    it('should coordinate all steps successfully', async () => {
      const { sandbox } = setupEnvironment()
      sandbox.safeListSources = async () => ['repo1']
      sandbox.listSuggestions = async () => [{ id: 's1', title: 'S1' }]
      sandbox.getDailySessionQuota = async () => ({ remaining: 10 })
      sandbox.startSuggestion = async () => {}

      const result = await sandbox.test_processSuggestionsForTab({ id: 1 }, { dryRun: false })
      assert.strictEqual(result, 1)
      assert.ok(sandbox.test_state().log.some((l) => l.includes('TOTAL: 1 suggestions started')))
    })
  })
})
