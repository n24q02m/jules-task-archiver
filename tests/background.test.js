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
        get: async () => ({})
      },
      local: {
        get: async () => ({})
      }
    },
    runtime: {
      onMessage: { addListener: () => {} },
      getPlatformInfo: async () => ({})
    },
    tabs: {
      query: async () => [],
      get: async (id) => ({ id, url: 'https://jules.google.com/u/0/session' }),
      sendMessage: async () => ({
        config: { at: 'token', bl: 'build', fsid: '123' },
        accountNum: '0',
        account: 'default'
      })
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
    globalThis.test_TASK = TASK;
    globalThis.test_parseSuggestion = parseSuggestion;
    globalThis.test_buildSuggestionPrompt = buildSuggestionPrompt;
    globalThis.test_buildStartPayload = buildStartPayload;
    globalThis.test_SUGGESTION = SUGGESTION;
    globalThis.test_SDETAIL = SDETAIL;
    globalThis.test_CATEGORY_CONFIG = CATEGORY_CONFIG;
    globalThis.test_DEFAULT_CATEGORY = DEFAULT_CATEGORY;
    globalThis.test_sendToTab = sendToTab;
    globalThis.test_ensureContentScript = ensureContentScript;
    globalThis.test_getTabConfig = getTabConfig;
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
    assert.strictEqual(task.repo, 'owner/repo')
    assert.strictEqual(task.owner, 'owner')
    assert.strictEqual(task.repoName, 'repo')
    assert.strictEqual(task.state, 3)
  })

  it('should fallback to short title when display title is null', () => {
    const { sandbox } = setupEnvironment()
    const raw = new Array(31).fill(null)
    raw[0] = '99999'
    raw[1] = 'Fallback title'
    raw[4] = 'github/a/b'
    raw[5] = 9

    const task = sandbox.test_parseTask(raw)
    assert.strictEqual(task.title, 'Fallback title')
  })

  it('should handle missing source gracefully', () => {
    const { sandbox } = setupEnvironment()
    const raw = new Array(31).fill(null)
    raw[0] = '11111'

    const task = sandbox.test_parseTask(raw)
    assert.strictEqual(task.repo, '')
    assert.strictEqual(task.owner, '')
    assert.strictEqual(task.title, '(untitled)')
  })
})

// =============================================================================
// Suggestion Parser Tests
// =============================================================================

describe('parseSuggestion', () => {
  it('should parse suggestion from hQP40d response', () => {
    const { sandbox } = setupEnvironment()
    const raw = [
      '8729015370503451291',
      [
        'Potential Regex Denial of Service (ReDoS)',
        'The regex contains nested quantifiers...',
        'https://github.com/n24q02m/better-godot-mcp/blob/...',
        'src/godot/detector.ts',
        18,
        1,
        'The regex can be simplified...',
        'export function parseGodotVersion...',
        'typescript',
        'input-validation',
        3
      ],
      1,
      ['16668581076813822918'],
      3
    ]

    const result = sandbox.test_parseSuggestion(raw)
    assert.strictEqual(result.id, '8729015370503451291')
    assert.strictEqual(result.title, 'Potential Regex Denial of Service (ReDoS)')
    assert.strictEqual(result.description, 'The regex contains nested quantifiers...')
    assert.strictEqual(result.filePath, 'src/godot/detector.ts')
    assert.strictEqual(result.line, 18)
    assert.strictEqual(result.confidence, 1)
    assert.strictEqual(result.rationale, 'The regex can be simplified...')
    assert.strictEqual(result.codeSnippet, 'export function parseGodotVersion...')
    assert.strictEqual(result.language, 'typescript')
    assert.strictEqual(result.categorySlug, 'input-validation')
    assert.strictEqual(result.priority, 3)
    assert.strictEqual(result.status, 1)
    assert.strictEqual(result.categoryTab, 3)
  })

  it('should return null for null input', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_parseSuggestion(null), null)
  })

  it('should return null for empty array', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_parseSuggestion([]), null)
  })

  it('should return null when details array is missing', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_parseSuggestion(['id-123']), null)
  })
})

// =============================================================================
// Prompt Builder Tests
// =============================================================================

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
// Messaging and Injection Tests
// =============================================================================

describe('sendToTab', () => {
  it('should send message successfully on first try', async () => {
    const { sandbox } = setupEnvironment()
    let calls = 0
    sandbox.chrome.tabs.sendMessage = async (_id, _msg) => {
      calls++
      return { ok: true }
    }

    const res = await sandbox.test_sendToTab(1, { action: 'TEST' })
    assert.strictEqual(calls, 1)
    assert.strictEqual(res.ok, true)
  })

  it('should retry and succeed after injection on first failure', async () => {
    const { sandbox } = setupEnvironment()
    let sendCalls = 0
    let injectCalls = 0

    sandbox.chrome.tabs.sendMessage = async (_id, _msg) => {
      sendCalls++
      if (sendCalls === 1 || sendCalls === 2) throw new Error('Not ready')
      return { ok: true }
    }

    sandbox.chrome.scripting.executeScript = async () => {
      injectCalls++
    }

    const res = await sandbox.test_sendToTab(1, { action: 'TEST' })
    // sendToTab loop i=0:
    // 1. initial send fails (sendCalls=1)
    // 2. ensureContentScript PING fails (sendCalls=2)
    // 3. ensureContentScript injects (injectCalls=1)
    // 4. ensureContentScript PING retry loop succeeds (sendCalls=3)
    // 5. initial send retry (still in i=0 catch) succeeds (sendCalls=4)
    assert.strictEqual(sendCalls, 4)
    assert.strictEqual(injectCalls, 1)
    assert.strictEqual(res.ok, true)
  })

  it('should throw error after all retries fail', async () => {
    const { sandbox } = setupEnvironment()
    let sendCalls = 0
    sandbox.chrome.tabs.sendMessage = async (_id, _msg) => {
      sendCalls++
      throw new Error('Persistent failure')
    }

    try {
      await sandbox.test_sendToTab(1, { action: 'TEST' }, 3)
      assert.fail('Should have thrown')
    } catch (e) {
      // i=0: 1 (fail) + ensure (1 PING fail + 10 loop fail) + 1 (fail) = 13
      // i=1: 1 (fail) = 14
      // i=2: 1 (fail) = 15
      assert.strictEqual(sendCalls, 15)
      assert.strictEqual(e.message, 'Persistent failure')
    }
  })
})

describe('ensureContentScript', () => {
  it('should throw security error for non-Jules tabs', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.tabs.get = async () => ({ url: 'https://evil.com' })

    try {
      await sandbox.test_ensureContentScript(1)
      assert.fail('Should have thrown')
    } catch (e) {
      assert.ok(e.message.includes('Security Error'))
    }
  })

  it('should succeed if PING works', async () => {
    const { sandbox } = setupEnvironment()
    let calls = 0
    sandbox.chrome.tabs.sendMessage = async (_id, msg) => {
      if (msg.action === 'PING') {
        calls++
        return { ok: true }
      }
    }

    await sandbox.test_ensureContentScript(1)
    assert.strictEqual(calls, 1)
  })

  it('should inject and wait for PING if first PING fails', async () => {
    const { sandbox } = setupEnvironment()
    const sendCalls = []
    let injectCalls = 0

    sandbox.chrome.tabs.sendMessage = async (_id, msg) => {
      sendCalls.push(msg.action)
      if (sendCalls.length < 3) throw new Error('Not ready') // 1st PING fail, 2nd PING (after inject) fail, 3rd PING success
      return { ok: true }
    }

    sandbox.chrome.scripting.executeScript = async () => {
      injectCalls++
    }

    await sandbox.test_ensureContentScript(1)
    assert.strictEqual(injectCalls, 1)
    assert.deepStrictEqual(sendCalls, ['PING', 'PING', 'PING'])
  })
})
