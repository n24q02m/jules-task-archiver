const test = require('node:test')
const assert = require('node:assert')
const vm = require('node:vm')
const fs = require('node:fs')
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
      }
    },
    runtime: {
      onMessage: { addListener: () => {} }
    }
  }

  const sandbox = {
    chrome: chromeMock,
    fetch: async () => ({ ok: true, json: async () => [], text: async () => ")]}'\n\n4\n[[]]" }),
    setTimeout,
    setInterval,
    clearInterval,
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
    parseInt
  }

  vm.createContext(sandbox)

  const scriptToRun =
    bgScriptContent +
    `
    globalThis.test_state = () => state;
    globalThis.test_stateReadyPromise = stateReadyPromise;
    globalThis.test_processSuggestionsForTab = processSuggestionsForTab;
  `

  vm.runInContext(scriptToRun, sandbox)

  return { sandbox, sessionSetData }
}

test('processSuggestionsForTab parallel execution', async (_t) => {
  const { sandbox } = setupEnvironment()

  await sandbox.test_stateReadyPromise

  // Mock dependencies
  sandbox.getTabConfig = async () => ({ bl: 'bl_123', fsid: 'fsid', accountNum: '0', at: 'at' })
  sandbox.listTasks = async () => [{ source: 'github/owner/repo' }]

  const suggestions = [
    { title: 'S1', categorySlug: 'c' },
    { title: 'S2', categorySlug: 'c' },
    { title: 'S3', categorySlug: 'c' },
    { title: 'S4', categorySlug: 'c' },
    { title: 'S5', categorySlug: 'c' },
    { title: 'S6', categorySlug: 'c' }
  ]

  sandbox.listSuggestions = async () => suggestions

  let startCalls = 0
  sandbox.startSuggestion = async () => {
    startCalls++
    return Promise.resolve()
  }

  const tab = { id: 1, url: 'https://jules.google.com/u/0/' }
  const options = { dryRun: false }

  await sandbox.test_processSuggestionsForTab(tab, options)

  assert.strictEqual(startCalls, 6, 'Should have called startSuggestion 6 times')
  assert.strictEqual(sandbox.test_state().progress.archived, 6, 'Should have archived 6 suggestions')
})

test('processSuggestionsForTab respects SUGGESTION_CHUNK_SIZE', async (_t) => {
  const { sandbox } = setupEnvironment()

  await sandbox.test_stateReadyPromise

  sandbox.getTabConfig = async () => ({ bl: 'bl_123', fsid: 'fsid', accountNum: '0', at: 'at' })
  sandbox.listTasks = async () => [{ source: 'github/owner/repo' }]

  const suggestions = Array.from({ length: 12 }, (_, i) => ({ title: `S${i}`, categorySlug: 'c' }))
  sandbox.listSuggestions = async () => suggestions

  let activeCalls = 0
  let maxConcurrent = 0

  sandbox.startSuggestion = async () => {
    activeCalls++
    maxConcurrent = Math.max(maxConcurrent, activeCalls)
    // Simulate some async work
    await new Promise((resolve) => setTimeout(resolve, 10))
    activeCalls--
    return Promise.resolve()
  }

  const tab = { id: 1, url: 'https://jules.google.com/u/0/' }
  await sandbox.test_processSuggestionsForTab(tab, { dryRun: false })

  assert.ok(maxConcurrent <= 5, `Max concurrent calls should be <= SUGGESTION_CHUNK_SIZE (5), got ${maxConcurrent}`)
  assert.strictEqual(sandbox.test_state().progress.archived, 12)
})
