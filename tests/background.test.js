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
        get: async (keys) => {
          const res = {}
          if (Array.isArray(keys)) {
            keys.forEach((k) => {
              res[k] = currentStorage[k]
            })
          } else if (typeof keys === 'string') {
            res[keys] = currentStorage[keys]
          }
          return res
        },
        set: async (data) => {
          currentStorage = { ...currentStorage, ...data }
        },
        remove: async (key) => {
          delete currentStorage[key]
        }
      },
      local: {
        get: async (keys) => {
          const res = {}
          if (Array.isArray(keys)) {
            keys.forEach((k) => {
              res[k] = currentStorage[k]
            })
          } else if (typeof keys === 'string') {
            res[keys] = currentStorage[keys]
          }
          return res
        },
        set: async (data) => {
          currentStorage = { ...currentStorage, ...data }
        }
      }
    },
    runtime: {
      onMessage: { addListener: () => {} },
      getPlatformInfo: async () => ({})
    },
    tabs: {
      query: async () => [],
      get: async (id) => ({ id, url: 'https://jules.google.com/u/0/session' }),
      sendMessage: async (_id, msg) => {
        if (msg.action === 'GET_CONFIG') {
          return {
            config: { at: 'token', bl: 'build', fsid: '123' },
            accountNum: '0',
            account: 'default'
          }
        }
        return { ok: true }
      }
    },
    scripting: {
      executeScript: async () => {}
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

  const scriptContent =
    bgScriptContent +
    `\n
    globalThis.test_stateReadyPromise = stateReadyPromise;
    globalThis.test_state = () => state;
    globalThis.test_updateState = updateState;
    globalThis.test_addLog = addLog;
    globalThis.test_buildBatchRequest = buildBatchRequest;
    globalThis.test_fixJsonControlChars = fixJsonControlChars;
    globalThis.test_findJsonEnd = findJsonEnd;
    globalThis.test_parseResponse = parseResponse;
    globalThis.test_parseTask = parseTask;
    globalThis.test_isArchivable = isArchivable;
    globalThis.test_TASK = TASK;
    globalThis.test_ARCHIVABLE_STATES = ARCHIVABLE_STATES;
    globalThis.test_JULES_ORIGIN = JULES_ORIGIN;
    globalThis.test_getJulesTabs = getJulesTabs;
    globalThis.test_extractAccountNum = extractAccountNum;
    globalThis.test_getTabLabel = getTabLabel;
    globalThis.test_getOpenPRs = getOpenPRs;
    globalThis.test_prCache = prCache;
    globalThis.test_taskHasOpenPR = taskHasOpenPR;
    globalThis.test_parseSuggestion = parseSuggestion;
    globalThis.test_buildSuggestionPrompt = buildSuggestionPrompt;
    globalThis.test_buildStartPayload = buildStartPayload;
    globalThis.test_SUGGESTION = SUGGESTION;
    globalThis.test_SDETAIL = SDETAIL;
    globalThis.test_CATEGORY_CONFIG = CATEGORY_CONFIG;
    globalThis.test_DEFAULT_CATEGORY = DEFAULT_CATEGORY;
    globalThis.test_startOperation = startOperation;
    globalThis.test_mockProcessTab = (fn) => { processTab = fn; };
    globalThis.test_mockProcessSuggestionsForTab = (fn) => { processSuggestionsForTab = fn; };
  `

  const script = new vm.Script(scriptContent)
  script.runInContext(sandbox)

  return { sandbox, sessionSetData }
}

// =============================================================================
// batchexecute Client Tests
// =============================================================================

describe('buildBatchRequest', () => {
  it('should format correct URL and body', () => {
    const { sandbox } = setupEnvironment()
    const config = { bl: 'build-label', fsid: '123456', at: 'xsrf-token', accountNum: '3' }
    const result = sandbox.test_buildBatchRequest('Tjmm5c', [['task-id'], 1], config)

    assert.ok(result.url.includes('jules.google.com/u/3/_/Swebot/data/batchexecute'))
    assert.ok(result.url.includes('rpcids=Tjmm5c'))
    assert.ok(result.url.includes('bl=build-label'))
    assert.ok(result.url.includes('f.sid=123456'))
    assert.ok(result.url.includes('rt=c'))
    assert.ok(result.body.includes('at=xsrf-token'))
    assert.ok(result.body.includes('Tjmm5c'))
  })
})

// =============================================================================
// Response Parser Tests
// =============================================================================

describe('fixJsonControlChars', () => {
  it('should escape CR/LF inside JSON strings', () => {
    const { sandbox } = setupEnvironment()
    const input = '["hello\r\nworld"]'
    const fixed = sandbox.test_fixJsonControlChars(input)
    assert.strictEqual(fixed, '["hello\\r\\nworld"]')
  })

  it('should not modify CR/LF outside strings', () => {
    const { sandbox } = setupEnvironment()
    const input = '[\n"hello",\n"world"\n]'
    const fixed = sandbox.test_fixJsonControlChars(input)
    assert.strictEqual(fixed, '[\n"hello",\n"world"\n]')
  })

  it('should handle escaped quotes correctly', () => {
    const { sandbox } = setupEnvironment()
    const input = '["she said \\"hi\\""]'
    const fixed = sandbox.test_fixJsonControlChars(input)
    assert.strictEqual(fixed, '["she said \\"hi\\""]')
  })
})

describe('findJsonEnd', () => {
  it('should find end of balanced array', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_findJsonEnd('[["a","b"]]extra'), 11)
  })

  it('should handle strings with brackets', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_findJsonEnd('[["a[b]c"]]'), 11)
  })

  it('should return -1 for unbalanced input', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_findJsonEnd('[["a"'), -1)
  })
})

describe('parseResponse', () => {
  it('should extract payload from batchexecute response', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}\'\n\n100\n[["wrb.fr","p1Takd","[[\\"task1\\",\\"task2\\"]]",null,null,null,"generic"]]'
    const result = sandbox.test_parseResponse(response, 'p1Takd')
    assert.deepStrictEqual(result, [['task1', 'task2']])
  })
})

// =============================================================================
// Task Parser Tests
// =============================================================================

describe('parseTask', () => {
  it('should map array indices to named fields', () => {
    const { sandbox } = setupEnvironment()
    const raw = new Array(31).fill(null)
    raw[0] = '12345'
    raw[1] = 'Short title'
    raw[4] = 'github/owner/repo'
    raw[5] = 3
    raw[26] = 'Display Title'

    const task = sandbox.test_parseTask(raw)
    assert.strictEqual(task.id, '12345')
    assert.strictEqual(task.title, 'Display Title')
    assert.strictEqual(task.source, 'github/owner/repo')
  })
})

describe('isArchivable', () => {
  it('should return true for completed/failed states', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_isArchivable({ state: 3 }), true) // COMPLETED
    assert.strictEqual(sandbox.test_isArchivable({ state: 9 }), true) // FAILED
  })

  it('should return false for active states', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_isArchivable({ state: 1 }), false)
    assert.strictEqual(sandbox.test_isArchivable({ state: 4 }), false)
  })
})

// =============================================================================
// PR Check Logic Tests
// =============================================================================

describe('taskHasOpenPR', () => {
  it('should match tasks by title', () => {
    const { sandbox } = setupEnvironment()
    const task = { title: 'Fix bug' }
    const prs = [{ title: 'Fix bug' }, { title: 'Other' }]
    assert.strictEqual(sandbox.test_taskHasOpenPR(task, prs), true)
  })

  it('should handle partial title matches (case-insensitive)', () => {
    const { sandbox } = setupEnvironment()
    const task = { title: '[SECURITY] Fix vulnerability' }
    const prs = [{ title: 'fix vulnerability' }]
    assert.strictEqual(sandbox.test_taskHasOpenPR(task, prs), true)
  })

  it('should not match unrelated tasks', () => {
    const { sandbox } = setupEnvironment()
    const task = { title: 'Fix bug' }
    const prs = [{ title: 'Other stuff' }]
    assert.strictEqual(sandbox.test_taskHasOpenPR(task, prs), false)
  })
})

// =============================================================================
// Suggestion Parser Tests
// =============================================================================

describe('parseSuggestion', () => {
  it('should extract suggestion details from nested array', () => {
    const { sandbox } = setupEnvironment()
    const raw = new Array(20).fill(null)
    raw[sandbox.test_SUGGESTION.ID] = 's-123'
    raw[sandbox.test_SUGGESTION.DETAILS] = []
    const d = raw[sandbox.test_SUGGESTION.DETAILS]
    d[sandbox.test_SDETAIL.TITLE] = 'Improve performance'
    d[sandbox.test_SDETAIL.FILE_PATH] = 'src/main.ts'
    d[sandbox.test_SDETAIL.LINE] = 10
    d[sandbox.test_SDETAIL.LANGUAGE] = 'typescript'
    d[sandbox.test_SDETAIL.CODE_SNIPPET] = 'code snippet'
    d[sandbox.test_SDETAIL.RATIONALE] = 'rationale here'
    d[sandbox.test_SDETAIL.CATEGORY_SLUG] = 'category-slug'

    const suggestion = sandbox.test_parseSuggestion(raw)
    assert.strictEqual(suggestion.id, 's-123')
    assert.strictEqual(suggestion.title, 'Improve performance')
    assert.strictEqual(suggestion.filePath, 'src/main.ts')
    assert.strictEqual(suggestion.line, 10)
    assert.strictEqual(suggestion.language, 'typescript')
    assert.strictEqual(suggestion.codeSnippet, 'code snippet')
    assert.strictEqual(suggestion.rationale, 'rationale here')
    assert.strictEqual(suggestion.categorySlug, 'category-slug')
  })
})

describe('buildSuggestionPrompt', () => {
  it('should build security prompt for input-validation category', () => {
    const { sandbox } = setupEnvironment()
    const suggestion = {
      title: 'Potential ReDoS',
      filePath: 'src/detector.ts',
      line: 18,
      language: 'typescript',
      codeSnippet: 'const match = str.match(/regex/)',
      rationale: 'Simplify the regex',
      categorySlug: 'input-validation'
    }

    const prompt = sandbox.test_buildSuggestionPrompt(suggestion)
    assert.ok(prompt.includes('[SECURITY] Security Vulnerability Fix Task'))
    assert.ok(prompt.includes('src/detector.ts:18'))
    assert.ok(prompt.includes('Potential ReDoS'))
    assert.ok(prompt.includes('const match = str.match(/regex/)'))
    assert.ok(prompt.includes('security-focused'))
    assert.ok(prompt.includes('Vulnerable Code'))
  })

  it('should build testing prompt for untested-function category', () => {
    const { sandbox } = setupEnvironment()
    const suggestion = {
      title: 'Untested function: foo',
      filePath: 'src/utils.ts',
      line: 42,
      language: 'typescript',
      codeSnippet: 'export function foo() {}',
      rationale: 'Easy to test',
      categorySlug: 'untested-function'
    }

    const prompt = sandbox.test_buildSuggestionPrompt(suggestion)
    assert.ok(prompt.includes('[TEST] Test Coverage Task'))
    assert.ok(prompt.includes('Untested Code'))
    assert.ok(prompt.includes('testing-focused'))
  })

  it('should build performance prompt for async-io category', () => {
    const { sandbox } = setupEnvironment()
    const suggestion = {
      title: 'Sequential awaits',
      filePath: 'src/api.ts',
      line: 10,
      language: 'typescript',
      codeSnippet: 'await a(); await b()',
      rationale: 'Use Promise.all',
      categorySlug: 'async-io'
    }

    const prompt = sandbox.test_buildSuggestionPrompt(suggestion)
    assert.ok(prompt.includes('[PERF] Performance Optimization Task'))
    assert.ok(prompt.includes('Inefficient Code'))
  })

  it('should build cleanup prompt for dead-code category', () => {
    const { sandbox } = setupEnvironment()
    const suggestion = {
      title: 'Unused import',
      filePath: 'src/main.ts',
      line: 1,
      language: 'typescript',
      codeSnippet: 'import { unused } from "lib"',
      rationale: 'Remove unused',
      categorySlug: 'dead-code'
    }

    const prompt = sandbox.test_buildSuggestionPrompt(suggestion)
    assert.ok(prompt.includes('[CLEANUP] Code Cleanup Task'))
    assert.ok(prompt.includes('Code to Clean'))
  })

  it('should use default config for unknown category', () => {
    const { sandbox } = setupEnvironment()
    const suggestion = {
      title: 'Some issue',
      filePath: 'src/main.ts',
      line: 1,
      language: 'typescript',
      codeSnippet: '// code',
      rationale: 'Fix it',
      categorySlug: 'unknown-category'
    }

    const prompt = sandbox.test_buildSuggestionPrompt(suggestion)
    assert.ok(prompt.includes('[FIX] Code Improvement Task'))
    assert.ok(prompt.includes('engineering-focused'))
  })
})

// =============================================================================
// StartSuggestion Payload Tests
// =============================================================================

describe('buildStartPayload', () => {
  it('should build correct Rja83d payload structure', () => {
    const { sandbox } = setupEnvironment()
    const suggestion = {
      id: 'test-123',
      title: 'Fix bug',
      filePath: 'src/a.ts',
      line: 1,
      language: 'typescript',
      codeSnippet: 'code',
      rationale: 'reason',
      categorySlug: 'dead-code'
    }
    const repo = 'github/owner/repo'
    const config = { modelId: null }
    const startConfig = {
      modelConfig: [null, 'beyond:models/test-model'],
      experimentIds: [12345],
      featureFlags: [['flag1', 1]]
    }

    const payload = sandbox.test_buildStartPayload(suggestion, repo, config, startConfig)

    // payload[0] is the prompt
    assert.ok(payload[0].includes('Fix bug'))
    assert.ok(payload[0].includes('[CLEANUP] Code Cleanup Task'))

    // payload[2] is model config
    assert.strictEqual(payload[2][1], 'beyond:models/test-model')

    // payload[4] is repo
    assert.strictEqual(payload[4], 'github/owner/repo')

    // payload[9] is experiment/suggestion metadata
    assert.deepStrictEqual(payload[9][4], [12345])
    assert.strictEqual(payload[9][11][1], 'test-123')

    // payload[14] = 1 (start flag)
    assert.strictEqual(payload[14], 1)
  })

  it('should use config.modelId over startConfig when available', () => {
    const { sandbox } = setupEnvironment()
    const suggestion = {
      id: 's1',
      title: 'T',
      filePath: 'f',
      line: 1,
      language: 'ts',
      codeSnippet: 'c',
      rationale: 'r',
      categorySlug: 'other'
    }
    const config = { modelId: 'beyond:models/direct-model' }
    const startConfig = { modelConfig: [null, 'beyond:models/fallback-model'] }

    const payload = sandbox.test_buildStartPayload(suggestion, 'repo', config, startConfig)
    assert.strictEqual(payload[2][1], 'beyond:models/direct-model')
  })

  it('should use default feature flags when startConfig is null', () => {
    const { sandbox } = setupEnvironment()
    const suggestion = {
      id: 's1',
      title: 'T',
      filePath: 'f',
      line: 1,
      language: 'ts',
      codeSnippet: 'c',
      rationale: 'r',
      categorySlug: 'other'
    }

    const payload = sandbox.test_buildStartPayload(suggestion, 'repo', {}, null)
    // Should have default feature flags
    const flags = payload[2][10]
    assert.ok(flags.length > 0)
    // Compare via JSON to avoid cross-VM reference issues
    assert.strictEqual(JSON.stringify(flags[0]), JSON.stringify(['enable_bash_session_tool', 1]))
  })
})

// =============================================================================
// State Management Tests
// =============================================================================

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
    await new Promise((resolve) => setTimeout(resolve, 10))

    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'error')
    assert.strictEqual(state.error, 'Operation interrupted (browser killed service worker)')
    assert.strictEqual(sessionSetData.length, 1)
  })

  it('should persist state on update', async () => {
    const { sandbox, sessionSetData } = setupEnvironment({})
    await sandbox.test_stateReadyPromise
    await new Promise((resolve) => setTimeout(resolve, 10))
    sessionSetData.length = 0

    sandbox.test_updateState({ status: 'done', currentTab: 'u/0' })
    assert.strictEqual(sandbox.test_state().status, 'done')
    assert.strictEqual(sessionSetData.length, 1)
  })
})

// =============================================================================
// Tab Label Parsing & Management Tests
// =============================================================================

describe('extractAccountNum', () => {
  it('should extract account number from /u/X/ format', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_extractAccountNum('https://jules.google.com/u/1/session'), '1')
    assert.strictEqual(sandbox.test_extractAccountNum('https://jules.google.com/u/123/tasks'), '123')
  })

  it('should return "0" for URLs without /u/X/ segment', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_extractAccountNum('https://jules.google.com/tasks'), '0')
    assert.strictEqual(sandbox.test_extractAccountNum('https://google.com'), '0')
    assert.strictEqual(sandbox.test_extractAccountNum(''), '0')
  })
})

describe('getTabLabel', () => {
  it('should return "default" for account 0', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_getTabLabel({ url: 'https://jules.google.com/u/0/session' }), 'default')
    assert.strictEqual(sandbox.test_getTabLabel({ url: 'https://jules.google.com/tasks' }), 'default')
  })

  it('should return "u/X" for other account numbers', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_getTabLabel({ url: 'https://jules.google.com/u/1/session' }), 'u/1')
    assert.strictEqual(sandbox.test_getTabLabel({ url: 'https://jules.google.com/u/42/tasks' }), 'u/42')
  })
})

describe('getJulesTabs', () => {
  it('should filter out accounts.google tabs and sort by account number', async () => {
    const { sandbox } = setupEnvironment()
    const mockTabs = [
      { id: 1, url: 'https://jules.google.com/u/2/session' },
      { id: 2, url: 'https://jules.google.com/u/0/session' },
      { id: 3, url: 'https://accounts.google.com/ServiceLogin' },
      { id: 4, url: 'https://jules.google.com/u/1/session' }
    ]
    sandbox.chrome.tabs.query = async () => mockTabs

    const tabs = await sandbox.test_getJulesTabs()
    assert.strictEqual(tabs.length, 3)
    assert.strictEqual(sandbox.test_extractAccountNum(tabs[0].url), '0')
    assert.strictEqual(sandbox.test_extractAccountNum(tabs[1].url), '1')
    assert.strictEqual(sandbox.test_extractAccountNum(tabs[2].url), '2')
  })

  it('should handle tabs without account segments correctly (as 0)', async () => {
    const { sandbox } = setupEnvironment()
    const mockTabs = [
      { id: 1, url: 'https://jules.google.com/u/1/session' },
      { id: 2, url: 'https://jules.google.com/tasks' }
    ]
    sandbox.chrome.tabs.query = async () => mockTabs

    const tabs = await sandbox.test_getJulesTabs()
    assert.strictEqual(tabs.length, 2)
    assert.strictEqual(sandbox.test_extractAccountNum(tabs[0].url), '0')
    assert.strictEqual(sandbox.test_extractAccountNum(tabs[1].url), '1')
  })
})

// =============================================================================
// Orchestrator Tests (startOperation)
// =============================================================================

describe('startOperation', () => {
  it('should run archive operation successfully for multiple tabs', async () => {
    const { sandbox } = setupEnvironment()
    const mockTabs = [
      { id: 1, url: 'https://jules.google.com/u/0/session' },
      { id: 2, url: 'https://jules.google.com/u/1/session' }
    ]
    sandbox.chrome.tabs.query = async () => mockTabs

    // Mock dependencies
    let processTabCount = 0
    sandbox.test_mockProcessTab(async () => {
      processTabCount++
      return 5 // returns 5 archived tasks
    })

    const options = {
      opMode: 'archive',
      dryRun: false,
      force: true,
      scope: 'all'
    }

    await sandbox.test_startOperation(options)

    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'done')
    assert.strictEqual(processTabCount, 2)
    assert.strictEqual(state.results.length, 2)
    assert.strictEqual(state.results[0].count, 5)
    assert.strictEqual(state.results[1].count, 5)

    const log = state.log.join('\n')
    assert.ok(log.includes('ARCHIVE MODE'))
    assert.ok(log.includes('Found 2 Jules tab(s)'))
    assert.ok(log.includes('GRAND TOTAL: 10 tasks archived'))
  })

  it('should handle no tabs found', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.tabs.query = async () => []

    const options = { opMode: 'archive', scope: 'all' }
    await sandbox.test_startOperation(options)

    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'error')
    assert.strictEqual(state.error, 'No Jules tabs found')
    assert.ok(state.log.some((l) => l.includes('No Jules tabs found')))
  })

  it('should warm up PR cache in archive mode', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.tabs.query = async () => [{ id: 1, url: 'https://jules.google.com/u/0/session' }]

    let prWarmed = false
    sandbox.fetch = async (url) => {
      if (url.toString().includes('api.github.com/repos/owner/dummy/pulls')) {
        prWarmed = true
      }
      return { ok: true, json: async () => [], text: async () => ")]}'\n\n4\n[[]]" }
    }

    sandbox.test_mockProcessTab(async () => 1)

    const options = {
      opMode: 'archive',
      dryRun: false,
      force: false,
      ghOwner: 'owner',
      ghToken: 'token',
      scope: 'all'
    }

    await sandbox.test_startOperation(options)

    assert.ok(prWarmed, 'PR cache should have been warmed')
    const log = sandbox.test_state().log.join('\n')
    assert.ok(log.includes('Warming up PR cache for owner: owner...'))
    assert.ok(log.includes('PR cache initialized.'))
  })

  it('should handle PR cache warming failure gracefully', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.tabs.query = async () => [{ id: 1, url: 'https://jules.google.com/u/0/session' }]

    sandbox.fetch = async (url) => {
      if (url.toString().includes('api.github.com/repos/owner/dummy/pulls')) {
        throw new Error('GitHub API Error')
      }
      return { ok: true, json: async () => [], text: async () => ")]}'\n\n4\n[[]]" }
    }

    sandbox.test_mockProcessTab(async () => 1)

    const options = {
      opMode: 'archive',
      dryRun: false,
      force: false,
      ghOwner: 'owner',
      ghToken: 'token',
      scope: 'all'
    }

    await sandbox.test_startOperation(options)

    const state = sandbox.test_state()
    const log = state.log.join('\n')
    // Corrected expectation: getOpenPRs catches and logs with WARNING prefix
    assert.ok(log.includes('WARNING: Could not check PRs for owner/dummy: GitHub API Error'))
    assert.ok(log.includes('PR cache initialized.'))
    assert.strictEqual(state.status, 'done', 'Should complete even if warming fails')
  })

  it('should run suggestions operation', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.tabs.query = async () => [{ id: 1, url: 'https://jules.google.com/u/0/session' }]

    let processSuggestionsCount = 0
    sandbox.test_mockProcessSuggestionsForTab(async () => {
      processSuggestionsCount++
      return 3
    })

    const options = {
      opMode: 'suggestions',
      scope: 'all'
    }

    await sandbox.test_startOperation(options)

    assert.strictEqual(processSuggestionsCount, 1)
    const log = sandbox.test_state().log.join('\n')
    assert.ok(log.includes('SUGGESTIONS MODE'))
    assert.ok(log.includes('GRAND TOTAL: 3 tasks started'))
  })
})
