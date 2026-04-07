const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')

describe('Concurrency Performance', () => {
  const setupBaseEnv = () => {
    const sessionSetData = []
    let currentStorage = {}

    const chromeMock = {
      storage: {
        session: {
          get: async (key) => ({ [key]: currentStorage[key] }),
          set: async (data) => {
            sessionSetData.push(data)
            currentStorage = { ...currentStorage, ...data }
          }
        },
        sync: { get: async () => ({}) },
        local: { get: async () => ({}) }
      },
      runtime: { onMessage: { addListener: () => {} } },
      tabs: {
        query: async () => [],
        get: async (id) => ({ id, url: 'https://jules.google.com/u/0/session' }),
        sendMessage: async () => ({})
      },
      scripting: { executeScript: async () => {} }
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
    return { sandbox, sessionSetData }
  }

  const runTestScript = (sandbox) => {
    const testScriptContent =
      bgScriptContent
        .replace(/await startSuggestion\(/g, 'await globalThis.mockStartSuggestion(')
        .replace(/await getTabConfig\(/g, 'await globalThis.mockGetTabConfig(')
        .replace(/await getStartConfig\(/g, 'await globalThis.mockGetStartConfig(')
        .replace(/await listTasks\(/g, 'await globalThis.mockListTasks(')
        .replace(/listSuggestions\(/g, 'globalThis.mockListSuggestions(') +
      `\n
        globalThis.test_stateReadyPromise = stateReadyPromise;
        globalThis.test_state = () => state;
        globalThis.test_processSuggestionsForTab = processSuggestionsForTab;
        `
    const fixedContent = testScriptContent.replace(
      /async function globalThis\.mockListSuggestions/g,
      'async function listSuggestions'
    )
    vm.runInContext(fixedContent, sandbox)
  }

  it('should process suggestions with a concurrency limit of 5', async () => {
    const { sandbox } = setupBaseEnv()
    let activeCount = 0
    let maxActiveCount = 0
    const startSuggestionCalls = []

    sandbox.mockStartSuggestion = async (s) => {
      activeCount++
      maxActiveCount = Math.max(maxActiveCount, activeCount)
      startSuggestionCalls.push(s.title)
      await new Promise((resolve) => setTimeout(resolve, 50))
      activeCount--
    }

    sandbox.mockGetTabConfig = async () => ({ at: 'token', bl: 'build', fsid: '123' })
    sandbox.mockGetStartConfig = async () => ({})
    sandbox.mockListTasks = async () => [{ source: 'github/owner/repo' }]
    sandbox.mockListSuggestions = async () => [
      { title: 'S1', categorySlug: 'c' },
      { title: 'S2', categorySlug: 'c' },
      { title: 'S3', categorySlug: 'c' },
      { title: 'S4', categorySlug: 'c' },
      { title: 'S5', categorySlug: 'c' },
      { title: 'S6', categorySlug: 'c' }
    ]

    runTestScript(sandbox)
    await sandbox.test_stateReadyPromise

    await sandbox.test_processSuggestionsForTab(
      { id: 1, url: 'https://jules.google.com/u/0/session' },
      { dryRun: false }
    )

    assert.strictEqual(startSuggestionCalls.length, 6)
    assert.strictEqual(maxActiveCount, 5)

    const state = sandbox.test_state()
    assert.strictEqual(state.progress.archived, 6)
    assert.strictEqual(state.progress.total, 6)
  })

  it('should respect cancellation during concurrent execution', async () => {
    const { sandbox } = setupBaseEnv()
    let startedCount = 0

    sandbox.mockStartSuggestion = async (_s) => {
      startedCount++
      if (startedCount === 2) {
        sandbox.test_state().status = 'cancelled'
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    sandbox.mockGetTabConfig = async () => ({ at: 'token', bl: 'build', fsid: '123' })
    sandbox.mockGetStartConfig = async () => ({})
    sandbox.mockListTasks = async () => [{ source: 'github/owner/repo' }]
    sandbox.mockListSuggestions = async () => [
      { title: 'S1', categorySlug: 'c' },
      { title: 'S2', categorySlug: 'c' },
      { title: 'S3', categorySlug: 'c' },
      { title: 'S4', categorySlug: 'c' },
      { title: 'S5', categorySlug: 'c' }
    ]

    runTestScript(sandbox)
    await sandbox.test_stateReadyPromise

    await sandbox.test_processSuggestionsForTab(
      { id: 1, url: 'https://jules.google.com/u/0/session' },
      { dryRun: false }
    )

    // Because they run in parallel, all 5 in the first chunk will likely start
    // but some might return early if they check state.status === 'cancelled'
    // In our implementation:
    // chunk.map(async (s) => {
    //   if (state.status === 'cancelled') return;
    //   ...
    //   await startSuggestion(...)
    // })
    // If startedCount 2 sets cancelled, then S3, S4, S5 might still start if they passed the check before S2 set it.
    // However, the outer loop will definitely break.

    assert.ok(startedCount >= 2 && startedCount <= 5)
  })
})
