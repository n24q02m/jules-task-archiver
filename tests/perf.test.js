const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')

function setupEnvironment(initialStorage = {}) {
  let currentStorage = { ...initialStorage }
  const sessionSetData = []

  const chromeMock = {
    storage: {
      session: {
        get: async (key) => {
          if (Array.isArray(key)) {
            const res = {}
            for (const k of key) res[k] = currentStorage[k]
            return res
          }
          return key ? { [key]: currentStorage[key] } : currentStorage
        },
        set: async (data) => {
          sessionSetData.push(data)
          currentStorage = { ...currentStorage, ...data }
        }
      },
      sync: {
        get: async (_keys) => ({})
      },
      local: {
        get: async (_keys) => ({})
      }
    },
    runtime: {
      getPlatformInfo: async () => ({}),
      onMessage: { addListener: () => {} }
    }
  }

  const sandbox = {
    chrome: chromeMock,
    fetch: async () => ({ ok: true, text: async () => ")]}'\n\n4\n[[]]" }),
    importScripts: () => {},
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
  vm.runInContext(bgScriptContent, sandbox)

  return sandbox
}

describe('Orchestrator Performance Optimization', () => {
  it('processSuggestionsForTab should start multiple suggestions', async () => {
    const sandbox = setupEnvironment({
      startConfig: {
        modelConfig: [null, 'gemini-pro'],
        featureFlags: [],
        experimentIds: []
      }
    })

    // Mock dependencies. Repos are now discovered via listSources (connected
    // repos), independent of tasks.
    let listSourcesCalled = 0
    sandbox.listSources = async () => {
      listSourcesCalled++
      return ['github/owner/repo1', 'github/owner/repo2']
    }

    let listSuggestionsCount = 0
    sandbox.listSuggestions = async (_repo) => {
      listSuggestionsCount++
      return [
        { id: 's1', title: 'Suggestion 1', categorySlug: 'test' },
        { id: 's2', title: 'Suggestion 2', categorySlug: 'test' }
      ]
    }

    let startSuggestionCount = 0
    const startedSuggestions = []
    sandbox.startSuggestion = async (s, _repo) => {
      startSuggestionCount++
      startedSuggestions.push(s.id)
      return Promise.resolve()
    }

    sandbox.getTabConfig = async () => ({ at: 'at', bl: 'bl_v1', fsid: 'fsid', accountNum: '0' })

    const tab = { id: 123, url: 'https://jules.google.com/u/0/' }
    const options = { dryRun: false }

    await sandbox.processSuggestionsForTab(tab, options)

    assert.strictEqual(listSourcesCalled, 1, 'listSources should be called once')
    assert.strictEqual(listSuggestionsCount, 2, 'listSuggestions should be called for each repo')
    assert.strictEqual(
      startSuggestionCount,
      4,
      'startSuggestion should be called for each suggestion (2 repos * 2 suggestions)'
    )
    assert.deepStrictEqual(startedSuggestions, ['s1', 's2', 's1', 's2'])
  })

  it('executeArchive (internal loop) should archive multiple tasks', async () => {
    // Note: executeArchive is not exported, it's called by processTab.
    // We can test it by calling processTab or by extracting it if we really want to.
    // In background.js, processTab is the entry point.

    const sandbox = setupEnvironment()

    sandbox.getTabConfig = async () => ({ at: 'at', bl: 'bl_v1', fsid: 'fsid', accountNum: '0' })
    sandbox.listTasks = async () => [
      { id: 't1', title: 'Task 1', state: 3, source: 'github/owner/repo' },
      { id: 't2', title: 'Task 2', state: 3, source: 'github/owner/repo' }
    ]
    sandbox.getOpenPRs = async () => [] // No PRs, so they should be archived

    let archiveTaskCount = 0
    sandbox.archiveTask = async () => {
      archiveTaskCount++
    }

    const tab = { id: 123, url: 'https://jules.google.com/u/0/' }
    const options = { force: true } // Force to skip PR check for simplicity

    await sandbox.processTab(tab, options)

    assert.strictEqual(archiveTaskCount, 2, 'archiveTask should be called for each task')
  })
})
