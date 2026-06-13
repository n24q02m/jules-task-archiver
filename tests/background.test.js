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
    webNavigation: {
      getFrame: async () => ({ url: 'https://jules.google.com/u/0/session', documentId: 'doc1' })
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

  const activeTimers = []
  const clearedTimers = []
  const sandbox = {
    chrome: chromeMock,
    fetch: async () => ({ ok: true, json: async () => [], text: async () => ")]}'\n\n4\n[[]]" }),
    setTimeout,
    clearTimeout,
    // No-op timer mocks: the real keepAlive interval would otherwise keep the
    // Node event loop alive and hang the test process after all tests pass.
    setInterval: (fn, ms) => {
      const id = activeTimers.length + 1
      activeTimers.push({ id, fn, ms })
      return id
    },
    clearInterval: (id) => {
      clearedTimers.push(id)
    },
    test_activeTimers: activeTimers,
    test_clearedTimers: clearedTimers,
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
    `\n
    globalThis.test_stateReadyPromise = stateReadyPromise;
    globalThis.test_state = () => state;
    globalThis.test_updateState = updateState;
    globalThis.test_addLog = addLog;
    globalThis.test_trimLog = trimLog;
    globalThis.test_MAX_LOG_LINES = MAX_LOG_LINES;
    globalThis.test_buildBatchRequest = buildBatchRequest;
    globalThis.test_callBatchExecute = callBatchExecute;
    globalThis.test_runInPool = runInPool;
    globalThis.test_createLimiter = createLimiter;
    globalThis.test_archiveTaskWithRetry = archiveTaskWithRetry;
    globalThis.test_withRetry = withRetry;
    globalThis.test_isRetryable = isRetryable;
    globalThis.test_RETRY_ATTEMPTS = RETRY_ATTEMPTS;
    globalThis.test_RETRY_BASE_MS = RETRY_BASE_MS;
    globalThis.test_fixJsonControlChars = fixJsonControlChars;
    globalThis.test_findJsonEnd = findJsonEnd;
    globalThis.test_parseResponse = parseResponse;
    globalThis.test_parseTask = parseTask;
    globalThis.test_groupTasksByRepo = groupTasksByRepo;
    globalThis.test_isArchivable = isArchivable;
    globalThis.test_TASK = TASK;
    globalThis.test_ARCHIVABLE_STATES = ARCHIVABLE_STATES;
    globalThis.test_JULES_ORIGIN = JULES_ORIGIN;
    globalThis.test_getJulesTabs = getJulesTabs;
    globalThis.test_extractAccountNum = extractAccountNum;
    globalThis.test_getTabLabel = getTabLabel;
    globalThis.test_getOpenPRs = getOpenPRs;
    globalThis.test_getStartConfig = getStartConfig;
    globalThis.test_prCache = prCache;
    globalThis.test_jFetch = jFetch;
    globalThis.test_taskHasOpenPR = taskHasOpenPR;
    globalThis.test_parseSuggestion = parseSuggestion;
    globalThis.test_buildSuggestionPrompt = buildSuggestionPrompt;
    globalThis.test_buildStartPayload = buildStartPayload;
    globalThis.test_SUGGESTION = SUGGESTION;
    globalThis.test_SDETAIL = SDETAIL;
    globalThis.test_CATEGORY_CONFIG = CATEGORY_CONFIG;
    globalThis.test_DEFAULT_CATEGORY = DEFAULT_CATEGORY;
    globalThis.test_initOperationState = initOperationState;
    globalThis.test_discoverTabs = discoverTabs;
    globalThis.test_processAllTabs = processAllTabs;
    globalThis.test_finalizeOperation = finalizeOperation;
    globalThis.test_handleOperationError = handleOperationError;
    globalThis.test_listTasks = listTasks;
    globalThis.test_safeListTasks = safeListTasks;
    globalThis.test_safeListSources = safeListSources;
    globalThis.test_startOperation = startOperation;
    globalThis.test_startSuggestion = startSuggestion;
    globalThis.test_startKeepAlive = startKeepAlive;
    globalThis.test_stopKeepAlive = stopKeepAlive;
    globalThis.test_getKeepAliveInterval = () => keepAliveInterval;
    globalThis.test_listSuggestions = listSuggestions;
    globalThis.test_listSuggestionEnabledSources = listSuggestionEnabledSources;
    globalThis.test_isSuggestionEnabled = isSuggestionEnabled;
    globalThis.test_getDailySessionQuota = getDailySessionQuota;
    globalThis.test_ensureContentScript = ensureContentScript;
    globalThis.test_getTabConfig = getTabConfig;
  `

  const script = new vm.Script(scriptContent)
  script.runInContext(sandbox)

  return { sandbox, sessionSetData }
}

// =============================================================================
// Task Operations Tests
// =============================================================================

describe('listTasks', () => {
  it('should return an empty array when callBatchExecute returns null', async () => {
    const { sandbox } = setupEnvironment()
    // Override the internal callBatchExecute with a mock that returns null
    sandbox.callBatchExecute = async () => null

    const tasks = await sandbox.test_listTasks('filter', {})
    assert.strictEqual(JSON.stringify(tasks), '[]')
  })

  it('should return an empty array when callBatchExecute returns an empty array', async () => {
    const { sandbox } = setupEnvironment()
    // Override the internal callBatchExecute with a mock that returns []
    sandbox.callBatchExecute = async () => []

    const tasks = await sandbox.test_listTasks('filter', {})
    assert.strictEqual(JSON.stringify(tasks), '[]')
  })
})

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

  it('should scan from startPos and return an absolute index', () => {
    const { sandbox } = setupEnvironment()
    // 6-char prefix (byte-length line) followed by the JSON array
    assert.strictEqual(sandbox.test_findJsonEnd('1234\n\n[["a","b"]]tail', 6), 17)
  })

  it('should ignore brackets located before startPos', () => {
    const { sandbox } = setupEnvironment()
    // The leading "]]]" must not corrupt depth counting when skipped
    assert.strictEqual(sandbox.test_findJsonEnd(']]]["x"]', 3), 8)
  })

  it('should treat startPos=0 the same as the default', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_findJsonEnd('[["a","b"]]extra', 0), 11)
  })
})

describe('runInPool', () => {
  it('should run the worker over every item and preserve order', async () => {
    const { sandbox } = setupEnvironment()
    const results = await sandbox.test_runInPool([1, 2, 3, 4], 2, async (n) => n * 10)
    assert.deepStrictEqual(results, [10, 20, 30, 40])
  })

  it('should never exceed the concurrency limit', async () => {
    const { sandbox } = setupEnvironment()
    let inFlight = 0
    let peak = 0
    const worker = async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
    }
    await sandbox.test_runInPool([1, 2, 3, 4, 5, 6, 7, 8], 3, worker)
    assert.ok(peak <= 3, `peak concurrency ${peak} should not exceed 3`)
    assert.strictEqual(peak, 3, 'pool should saturate the limit')
  })

  it('should return an empty array for empty input', async () => {
    const { sandbox } = setupEnvironment()
    let called = 0
    const results = await sandbox.test_runInPool([], 5, async () => {
      called++
    })
    assert.deepStrictEqual(results, [])
    assert.strictEqual(called, 0)
  })

  it('should handle a limit larger than the item count', async () => {
    const { sandbox } = setupEnvironment()
    const results = await sandbox.test_runInPool([1, 2], 10, async (n) => n + 1)
    assert.deepStrictEqual(results, [2, 3])
  })

  it('should pass the item index to the worker', async () => {
    const { sandbox } = setupEnvironment()
    const results = await sandbox.test_runInPool(['a', 'b', 'c'], 2, async (item, idx) => `${item}${idx}`)
    assert.deepStrictEqual(results, ['a0', 'b1', 'c2'])
  })

  it('should handle limit = 0 by using a minimum concurrency of 1', async () => {
    const { sandbox } = setupEnvironment()
    const results = await sandbox.test_runInPool([1, 2, 3], 0, async (n) => n * 2)
    assert.deepStrictEqual(results, [2, 4, 6])
  })

  it('should handle non-integer limits by rounding down', async () => {
    const { sandbox } = setupEnvironment()
    const results = await sandbox.test_runInPool([1, 2, 3], 2.9, async (n) => n * 2)
    assert.deepStrictEqual(results, [2, 4, 6])
  })

  it('should propagate worker errors', async () => {
    const { sandbox } = setupEnvironment()
    await assert.rejects(
      sandbox.test_runInPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('worker failed')
        return n
      }),
      { message: 'worker failed' }
    )
  })

  it('should handle NaN limit by using a minimum concurrency of 1', async () => {
    const { sandbox } = setupEnvironment()
    const results = await sandbox.test_runInPool([1, 2, 3], NaN, async (n) => n * 2)
    assert.deepStrictEqual(results, [2, 4, 6])
  })

  it('should handle negative limit by using a minimum concurrency of 1', async () => {
    const { sandbox } = setupEnvironment()
    const results = await sandbox.test_runInPool([1, 2, 3], -5, async (n) => n * 2)
    assert.deepStrictEqual(results, [2, 4, 6])
  })
})

describe('isSuggestionEnabled', () => {
  it('treats toggle value 2 as enabled', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_isSuggestionEnabled(['id', [[]], [1], [1], 1, [true, true, [2], [true]]]), true)
  })

  it('treats toggle value 1, null block, or missing block as disabled', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_isSuggestionEnabled(['id', [[]], [1], [1], 1, [true, true, [1], [true]]]), false)
    assert.strictEqual(sandbox.test_isSuggestionEnabled(['id', [[]], [1], [1], 1, [null, null, [1]]]), false)
    assert.strictEqual(sandbox.test_isSuggestionEnabled(['id', [[]], [1], [1], 1]), false)
  })
})

describe('listSuggestionEnabledSources', () => {
  it('returns only github repos whose Suggestions toggle is ON', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => [
      [
        ['github/n24q02m/on-a', [[true, 'on-a', 'n24q02m']], [1], [1], 1, [true, true, [2], [true]]],
        ['github/n24q02m/off-toggle', [[true, 'off-toggle', 'n24q02m']], [1], [1], 1, [true, true, [1], [true]]],
        ['github/n24q02m/off-noblock', [[true, 'off-noblock', 'n24q02m']], [1], [1], 1],
        ['github/n24q02m/on-b', [[true, 'on-b', 'n24q02m']], [1], [1], 1, [true, true, [2], [true]]],
        ['not-a-github-source', [[]], [1], [1], 1, [true, true, [2], [true]]],
        [null, [[]], [1], [1], 1, [true, true, [2], [true]]]
      ]
    ]
    const repos = await sandbox.test_listSuggestionEnabledSources({})
    assert.deepStrictEqual(repos, ['github/n24q02m/on-a', 'github/n24q02m/on-b'])
  })

  it('returns [] when the response has no sources', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => null
    // JSON.stringify avoids cross-VM Array realm mismatch in deepStrictEqual.
    assert.strictEqual(JSON.stringify(await sandbox.test_listSuggestionEnabledSources({})), '[]')
  })
})

describe('getDailySessionQuota', () => {
  it('parses KQOO7 into used/limit/remaining', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => [13, [86400], 100, 1, 2]
    // JSON.stringify avoids cross-VM realm mismatch in deepStrictEqual.
    assert.strictEqual(
      JSON.stringify(await sandbox.test_getDailySessionQuota({})),
      JSON.stringify({ used: 13, limit: 100, remaining: 87 })
    )
  })

  it('clamps remaining at 0 when over the limit', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => [268, [86400], 100]
    assert.strictEqual(
      JSON.stringify(await sandbox.test_getDailySessionQuota({})),
      JSON.stringify({ used: 268, limit: 100, remaining: 0 })
    )
  })

  it('returns null for an unrecognised shape', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => null
    assert.strictEqual(await sandbox.test_getDailySessionQuota({}), null)
  })
})

describe('createLimiter', () => {
  it('caps concurrency across independent callers and resolves results', async () => {
    const { sandbox } = setupEnvironment()
    const limit = sandbox.test_createLimiter(2)
    let inFlight = 0
    let peak = 0
    const make = (n) => () =>
      new Promise((resolve) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        setTimeout(() => {
          inFlight--
          resolve(n * 2)
        }, 5)
      })
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => limit(make(n))))
    assert.deepStrictEqual(results, [2, 4, 6, 8, 10])
    assert.ok(peak <= 2, `peak ${peak} should not exceed limiter max 2`)
  })
})

describe('Retry Utilities', () => {
  describe('isRetryable', () => {
    it('matches rate-limit and transient errors', () => {
      const { sandbox } = setupEnvironment()
      assert.strictEqual(sandbox.test_isRetryable('batchexecute Tjmm5c failed: HTTP 429'), true)
      assert.strictEqual(sandbox.test_isRetryable('HTTP 500'), true)
      assert.strictEqual(sandbox.test_isRetryable('HTTP 502'), true)
      assert.strictEqual(sandbox.test_isRetryable('HTTP 503'), true)
      assert.strictEqual(sandbox.test_isRetryable('HTTP 504'), true)
      assert.strictEqual(sandbox.test_isRetryable('Failed to fetch'), true)
      assert.strictEqual(sandbox.test_isRetryable('NetworkError'), true)
    })

    it('is case-insensitive', () => {
      const { sandbox } = setupEnvironment()
      assert.strictEqual(sandbox.test_isRetryable('http 429'), true)
      assert.strictEqual(sandbox.test_isRetryable('networkerror'), true)
      assert.strictEqual(sandbox.test_isRetryable('FAILED TO FETCH'), true)
    })

    it('does not match non-retryable errors', () => {
      const { sandbox } = setupEnvironment()
      assert.strictEqual(sandbox.test_isRetryable('HTTP 404'), false)
      assert.strictEqual(sandbox.test_isRetryable('HTTP 400'), false)
      assert.strictEqual(sandbox.test_isRetryable('Security Error'), false)
      assert.strictEqual(sandbox.test_isRetryable('JSON.parse error'), false)
    })

    it('handles edge case inputs', () => {
      const { sandbox } = setupEnvironment()
      assert.strictEqual(sandbox.test_isRetryable(null), false)
      assert.strictEqual(sandbox.test_isRetryable(undefined), false)
      assert.strictEqual(sandbox.test_isRetryable(''), false)
    })
  })

  describe('withRetry', () => {
    it('executes successfully on the first attempt', async () => {
      const { sandbox } = setupEnvironment()
      let calls = 0
      const result = await sandbox.test_withRetry(async () => {
        calls++
        return 'success'
      })
      assert.strictEqual(calls, 1)
      assert.strictEqual(result, 'success')
    })

    it('retries on retryable error and succeeds', async () => {
      const { sandbox } = setupEnvironment()
      let calls = 0
      sandbox.setTimeout = (fn) => fn() // Instant retry
      const result = await sandbox.test_withRetry(async () => {
        calls++
        if (calls === 1) throw new Error('HTTP 429')
        return 'retry-success'
      })
      assert.strictEqual(calls, 2)
      assert.strictEqual(result, 'retry-success')
    })

    it('exhausts all attempts and throws the last error', async () => {
      const { sandbox } = setupEnvironment()
      let calls = 0
      sandbox.setTimeout = (fn) => fn()
      const attempts = sandbox.test_RETRY_ATTEMPTS
      await assert.rejects(
        sandbox.test_withRetry(async () => {
          calls++
          throw new Error(`HTTP 500 attempt ${calls}`)
        }),
        { message: `HTTP 500 attempt ${attempts}` }
      )
      assert.strictEqual(calls, attempts)
    })

    it('throws immediately on non-retryable error', async () => {
      const { sandbox } = setupEnvironment()
      let calls = 0
      sandbox.setTimeout = (fn) => fn()
      await assert.rejects(
        sandbox.test_withRetry(async () => {
          calls++
          throw new Error('HTTP 404')
        }),
        { message: 'HTTP 404' }
      )
      assert.strictEqual(calls, 1)
    })

    it('verifies exponential backoff delay calculation', async () => {
      const { sandbox } = setupEnvironment()
      const delays = []
      sandbox.setTimeout = (fn, ms) => {
        delays.push(ms)
        fn()
      }
      sandbox.Math.random = () => 0.5 // Constant jitter for testing
      const base = sandbox.test_RETRY_BASE_MS

      let calls = 0
      await sandbox.test_withRetry(async () => {
        calls++
        if (calls < 4) throw new Error('HTTP 429')
        return 'ok'
      })

      assert.strictEqual(delays.length, 3)
      // delay = base * 2^attempt + random * 200
      // attempt 0: base * 1 + 100
      // attempt 1: base * 2 + 100
      // attempt 2: base * 4 + 100
      assert.strictEqual(delays[0], base * 1 + 100)
      assert.strictEqual(delays[1], base * 2 + 100)
      assert.strictEqual(delays[2], base * 4 + 100)
    })
  })
})

describe('archiveTaskWithRetry Integration', () => {
  it('retries on a 429 then succeeds', async () => {
    const { sandbox } = setupEnvironment()
    let calls = 0
    sandbox.archiveTask = async () => {
      calls++
      if (calls === 1) throw new Error('batchexecute Tjmm5c failed: HTTP 429')
    }
    sandbox.setTimeout = (fn) => fn()
    await sandbox.test_archiveTaskWithRetry('t1', {})
    assert.strictEqual(calls, 2)
  })

  it('does not retry a non-retryable error', async () => {
    const { sandbox } = setupEnvironment()
    let calls = 0
    sandbox.archiveTask = async () => {
      calls++
      throw new Error('HTTP 404')
    }
    await assert.rejects(sandbox.test_archiveTaskWithRetry('t1', {}), { message: 'HTTP 404' })
    assert.strictEqual(calls, 1)
  })
})
describe('parseResponse', () => {
  it('should extract payload from batchexecute response', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}\'\n\n100\n[["wrb.fr","p1Takd","[[\\"task1\\",\\"task2\\"]]",null,null,null,"generic"]]'
    const result = sandbox.test_parseResponse(response, 'p1Takd')
    assert.deepStrictEqual(result, [['task1', 'task2']])
  })

  it('should parse correctly when trailing data follows the JSON array', () => {
    const { sandbox } = setupEnvironment()
    // A second chunk (byte-length line + sibling array) must be ignored by the
    // offset-based boundary scan.
    const response = ')]}\'\n\n55\n[["wrb.fr","Tjmm5c","[[\\"ok\\"]]",null,null,null,"generic"]]\n12\n[["di",99]]'
    const result = sandbox.test_parseResponse(response, 'Tjmm5c')
    assert.deepStrictEqual(result, [['ok']])
  })

  it('should return null when the rpcId is not present', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}\'\n\n40\n[["wrb.fr","p1Takd","[[]]",null,null,null,"generic"]]'
    assert.strictEqual(sandbox.test_parseResponse(response, 'Rja83d'), null)
  })

  it('should throw when newline is missing after byte length', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}\' 100 [["wrb.fr","p1Takd","[[]]",null,null,null,"generic"]]'
    assert.throws(() => sandbox.test_parseResponse(response, 'p1Takd'), { message: 'Invalid batchexecute response' })
  })

  it('should throw when JSON boundary is not found', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}\'\n\n100\n[["wrb.fr","p1Takd","[[]]",null,null,null,"generic"'
    assert.throws(() => sandbox.test_parseResponse(response, 'p1Takd'), {
      message: 'Could not find JSON boundary in response'
    })
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

  it('should include statusCode from index 25', () => {
    const { sandbox } = setupEnvironment()
    const raw = new Array(31).fill(null)
    raw[0] = '55555'
    raw[5] = 3
    raw[25] = 6

    const task = sandbox.test_parseTask(raw)
    assert.strictEqual(task.statusCode, 6)
  })
})

describe('isArchivable', () => {
  // State codes verified 2026-06-04 against 725 real tasks from the live
  // batchexecute API. Terminal/finished states observed: 2, 4, 12, and null.
  it('should return true for terminal task states (2, 4, 12)', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_isArchivable({ state: 2 }), true)
    assert.strictEqual(sandbox.test_isArchivable({ state: 4 }), true)
    assert.strictEqual(sandbox.test_isArchivable({ state: 12 }), true)
  })

  it('should return true for null/undefined state (completed task variant)', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_isArchivable({ state: null }), true)
    assert.strictEqual(sandbox.test_isArchivable({ state: undefined }), true)
  })

  it('should return false for non-terminal / unknown states', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_isArchivable({ state: 1 }), false)
    assert.strictEqual(sandbox.test_isArchivable({ state: 5 }), false)
    // Legacy reverse-engineered codes {3,9} are no longer emitted by Jules.
    assert.strictEqual(sandbox.test_isArchivable({ state: 3 }), false)
    assert.strictEqual(sandbox.test_isArchivable({ state: 9 }), false)
  })
})

describe('processTab force vs default archiving', () => {
  const TAB = { id: 1, url: 'https://jules.google.com/u/0/' }

  function setupArchiveEnv(tasks) {
    const { sandbox } = setupEnvironment()
    sandbox.getTabConfig = async () => ({ at: 'at', bl: 'bl_v1', fsid: 'fsid', accountNum: '0' })
    sandbox.listTasks = async () => tasks
    sandbox.getOpenPRs = async () => []
    const archived = []
    sandbox.archiveTask = async (id) => {
      archived.push(id)
    }
    return { sandbox, archived }
  }

  it('FORCE archives every task even when none are in a terminal state', async () => {
    // Regression for the original bug: with real Jules state codes, the legacy
    // {3,9} allowlist matched 0 tasks, so the candidates list was empty and
    // Force archived nothing. Force must be independent of the state filter.
    const tasks = [
      { id: 'a', title: 'T1', state: 7, source: 'github/o/r' },
      { id: 'b', title: 'T2', state: 99, source: 'github/o/r' }
    ]
    const { sandbox, archived } = setupArchiveEnv(tasks)
    await sandbox.processTab(TAB, { force: true, dryRun: false })
    assert.deepStrictEqual(archived.sort(), ['a', 'b'])
  })

  it('FORCE archives real terminal-state tasks (2, 4, 12, null)', async () => {
    const tasks = [
      { id: 'a', title: 'T', state: 12, source: 'github/o/r' },
      { id: 'b', title: 'T', state: null, source: 'github/o/r' },
      { id: 'c', title: 'T', state: 4, source: 'github/o/r' },
      { id: 'd', title: 'T', state: 2, source: 'github/o/r' }
    ]
    const { sandbox, archived } = setupArchiveEnv(tasks)
    await sandbox.processTab(TAB, { force: true, dryRun: false })
    assert.strictEqual(archived.length, 4)
  })

  it('default mode archives terminal tasks and skips non-terminal ones', async () => {
    const tasks = [
      { id: 'term', title: 'Done', state: 12, source: 'github/o/r' },
      { id: 'run', title: 'Running', state: 1, source: 'github/o/r' }
    ]
    const { sandbox, archived } = setupArchiveEnv(tasks)
    await sandbox.processTab(TAB, { force: false, dryRun: false })
    assert.deepStrictEqual(archived, ['term'])
  })

  it('default mode skips a terminal task with a matching open PR', async () => {
    const tasks = [{ id: 'x', title: 'Fix the bug', state: 12, source: 'github/o/r', owner: 'o', repoName: 'r' }]
    const { sandbox, archived } = setupArchiveEnv(tasks)
    sandbox.getOpenPRs = async () => [{ title: 'Fix the bug', titleLower: 'fix the bug', branch: 'b' }]
    await sandbox.processTab(TAB, { force: false, dryRun: false })
    assert.deepStrictEqual(archived, [])
  })

  it('FORCE archives a terminal task even when it has a matching open PR', async () => {
    const tasks = [{ id: 'x', title: 'Fix the bug', state: 12, source: 'github/o/r', owner: 'o', repoName: 'r' }]
    const { sandbox, archived } = setupArchiveEnv(tasks)
    sandbox.getOpenPRs = async () => [{ title: 'Fix the bug', titleLower: 'fix the bug', branch: 'b' }]
    await sandbox.processTab(TAB, { force: true, dryRun: false })
    assert.deepStrictEqual(archived, ['x'])
  })
})

// =============================================================================
// Suggestion Parser Tests
// =============================================================================

// =============================================================================
// Constants + Helpers Tests (#50, #52)
// =============================================================================

describe('JULES_ORIGIN', () => {
  it('should be the Jules base URL', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_JULES_ORIGIN, 'https://jules.google.com')
  })
})

describe('extractAccountNum', () => {
  it('should extract account number from /u/N paths', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_extractAccountNum('https://jules.google.com/u/3/session'), '3')
    assert.strictEqual(sandbox.test_extractAccountNum('https://jules.google.com/u/0/repo'), '0')
    assert.strictEqual(sandbox.test_extractAccountNum('https://jules.google.com/u/12/session'), '12')
  })

  it('should return 0 for URLs without /u/N', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_extractAccountNum('https://jules.google.com/session'), '0')
    assert.strictEqual(sandbox.test_extractAccountNum('https://example.com'), '0')
  })
})

// =============================================================================
// Tab Management Tests (#53)
// =============================================================================

describe('getTabLabel', () => {
  it('should return u/N for account tabs', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_getTabLabel({ url: 'https://jules.google.com/u/1/session' }), 'u/1')
    assert.strictEqual(sandbox.test_getTabLabel({ url: 'https://jules.google.com/u/4/session?pageId=none' }), 'u/4')
  })

  it('should return default for tabs without account number', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_getTabLabel({ url: 'https://jules.google.com/session' }), 'default')
  })
})

// =============================================================================
// GitHub PR Check Tests (#54)
// =============================================================================

describe('getOpenPRs', () => {
  it('should return mapped PR titles and branches', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => ({
      ok: true,
      json: async () => [
        { title: 'Fix bug', head: { ref: 'fix/bug-123' } },
        { title: 'Add feature', head: { ref: 'feat/feature-456' } }
      ]
    })
    const prs = await sandbox.test_getOpenPRs('owner', 'repo', null)
    assert.strictEqual(prs.length, 2)
    assert.strictEqual(prs[0].title, 'Fix bug')
    assert.strictEqual(prs[0].branch, 'fix/bug-123')
    assert.strictEqual(prs[1].title, 'Add feature')
  })

  it('should return cached value on cache hit', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => ({
      ok: true,
      json: async () => [{ title: 'PR1', head: { ref: 'branch1' } }]
    })
    const first = await sandbox.test_getOpenPRs('cacheOwner', 'cacheRepo', null)
    assert.strictEqual(first.length, 1)

    sandbox.fetch = async () => {
      throw new Error('should not be called')
    }
    const second = await sandbox.test_getOpenPRs('cacheOwner', 'cacheRepo', null)
    assert.strictEqual(second.length, 1)
  })

  it('should return empty array on HTTP error', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => ({ ok: false, status: 404 })
    const prs = await sandbox.test_getOpenPRs('err1', 'err1', null)
    assert.strictEqual(prs.length, 0)
  })

  it('should return empty array on network error', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => {
      throw new Error('network error')
    }
    const prs = await sandbox.test_getOpenPRs('err2', 'err2', null)
    assert.strictEqual(prs.length, 0)
  })

  it('should encode owner and repo in URL', async () => {
    const { sandbox } = setupEnvironment()
    let capturedUrl = ''
    sandbox.fetch = async (url) => {
      capturedUrl = url
      return { ok: true, json: async () => [] }
    }
    await sandbox.test_getOpenPRs('owner/evil', 'repo name', null)
    assert.ok(capturedUrl.includes('owner%2Fevil'))
    assert.ok(capturedUrl.includes('repo%20name'))
  })

  it('should reject tokens with newlines', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => ({ ok: true, json: async () => [] })
    const prs = await sandbox.test_getOpenPRs('own5', 'rep5', 'token\r\nEvil: header')
    assert.strictEqual(prs.length, 0)
  })

  it('should use Authorization header when token is provided', async () => {
    const { sandbox } = setupEnvironment()
    let capturedHeaders = {}
    sandbox.fetch = async (_url, options) => {
      capturedHeaders = options.headers
      return { ok: true, json: async () => [] }
    }
    await sandbox.test_getOpenPRs('own', 'rep', 'secret-token')
    assert.strictEqual(capturedHeaders.Authorization, 'token secret-token')
  })

  it('should handle prCache correctly (integration check)', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => ({
      ok: true,
      json: async () => [{ title: 'PR', head: { ref: 'b' } }]
    })

    // Clear cache first just in case
    sandbox.test_prCache.clear()

    const key = 'own/rep'
    assert.strictEqual(sandbox.test_prCache.has(key), false)

    await sandbox.test_getOpenPRs('own', 'rep', null)

    assert.strictEqual(sandbox.test_prCache.has(key), true)
    const cached = sandbox.test_prCache.get(key)
    assert.strictEqual(cached.length, 1)
    assert.strictEqual(cached[0].title, 'PR')
  })
  it('should return empty array and log warning on invalid input types', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.test_prCache.clear()

    // Test null owner
    let prs = await sandbox.test_getOpenPRs(null, 'repo', null)
    assert.strictEqual(prs.length, 0)
    assert.ok(sandbox.test_state().log.some((msg) => msg.includes('Owner and repo must be strings')))

    // Test undefined repo
    prs = await sandbox.test_getOpenPRs('owner', undefined, null)
    assert.strictEqual(prs.length, 0)

    // Test number repo
    prs = await sandbox.test_getOpenPRs('owner', 123, null)
    assert.strictEqual(prs.length, 0)
  })
})

describe('taskHasOpenPR', () => {
  it('should match when PR title contains task title', () => {
    const { sandbox } = setupEnvironment()
    const task = { title: 'Fix ReDoS vulnerability' }
    const prs = [
      {
        title: '[SECURITY] Fix ReDoS vulnerability',
        titleLower: '[security] fix redos vulnerability',
        branch: 'fix/redos-123'
      }
    ]
    assert.strictEqual(sandbox.test_taskHasOpenPR(task, prs), true)
  })

  it('should match when task title contains PR title', () => {
    const { sandbox } = setupEnvironment()
    const task = { title: 'Unused return value from loadAllTasks' }
    const prs = [
      {
        title: 'Unused return value from loadAllTasks',
        titleLower: 'unused return value from loadalltasks',
        branch: 'fix-unused-123'
      }
    ]
    assert.strictEqual(sandbox.test_taskHasOpenPR(task, prs), true)
  })

  it('should not match unrelated PR titles', () => {
    const { sandbox } = setupEnvironment()
    const task = { title: 'Fix SQL injection' }
    const prs = [
      { title: 'Add unit tests', titleLower: 'add unit tests', branch: 'test/unit' },
      { title: 'Update README', titleLower: 'update readme', branch: 'docs/readme' }
    ]
    assert.strictEqual(sandbox.test_taskHasOpenPR(task, prs), false)
  })

  it('should return false for empty PR list', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_taskHasOpenPR({ title: 'Any task' }, []), false)
  })

  it('should return false for untitled tasks', () => {
    const { sandbox } = setupEnvironment()
    const prs = [{ title: 'Some PR', titleLower: 'some pr', branch: 'branch' }]
    assert.strictEqual(sandbox.test_taskHasOpenPR({ title: '(untitled)' }, prs), false)
    assert.strictEqual(sandbox.test_taskHasOpenPR({ title: '' }, prs), false)
  })

  it('should be case-insensitive', () => {
    const { sandbox } = setupEnvironment()
    const task = { title: 'fix REDOS Vulnerability' }
    const prs = [
      {
        title: '[Security] Fix ReDoS vulnerability',
        titleLower: '[security] fix redos vulnerability',
        branch: 'fix-123'
      }
    ]
    assert.strictEqual(sandbox.test_taskHasOpenPR(task, prs), true)
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

describe('startSuggestion', () => {
  it('should call callBatchExecute with the correct RPC ID and payload', async () => {
    const { sandbox } = setupEnvironment()
    let capturedId = null
    let capturedPayload = null
    let capturedConfig = null

    sandbox.callBatchExecute = async (id, payload, config) => {
      capturedId = id
      capturedPayload = payload
      capturedConfig = config
      return { success: true }
    }

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
    const config = { modelId: 'test-model' }
    const startConfig = { featureFlags: [] }

    const result = await sandbox.test_startSuggestion(suggestion, repo, config, startConfig)

    assert.strictEqual(capturedId, 'Rja83d')
    assert.deepStrictEqual(result, { success: true })
    assert.strictEqual(capturedConfig, config)

    // Verify payload is what buildStartPayload would produce
    const expectedPayload = sandbox.test_buildStartPayload(suggestion, repo, config, startConfig)
    assert.deepStrictEqual(capturedPayload, expectedPayload)
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

  it('should add log messages and persist state (coalesced)', async () => {
    const { sandbox, sessionSetData } = setupEnvironment({})
    await sandbox.test_stateReadyPromise
    await new Promise((resolve) => setTimeout(resolve, 10))
    sessionSetData.length = 0

    sandbox.test_addLog('Processing task 1')
    const state = sandbox.test_state()
    // In-memory state updates immediately...
    assert.strictEqual(state.log.length, 1)
    assert.strictEqual(state.log[0], 'Processing task 1')
    // ...but the storage write is coalesced into a deferred flush.
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.strictEqual(sessionSetData.length, 1)
    // Use JSON.stringify to avoid cross-VM reference issues with deepStrictEqual
    assert.strictEqual(JSON.stringify(sessionSetData[0].archiveState.log), JSON.stringify(['Processing task 1']))
  })

  it('caps the retained log at MAX_LOG_LINES, dropping the oldest lines', () => {
    const { sandbox } = setupEnvironment({})
    for (let i = 0; i < 2500; i++) sandbox.test_addLog(`line ${i}`)
    const log = sandbox.test_state().log
    assert.strictEqual(log.length, 2000)
    assert.strictEqual(log[log.length - 1], 'line 2499')
    assert.strictEqual(log[0], 'line 500') // oldest 500 lines dropped
  })

  it('coalesces a storm of log writes into a single storage write', async () => {
    const { sandbox, sessionSetData } = setupEnvironment({})
    await sandbox.test_stateReadyPromise
    await new Promise((resolve) => setTimeout(resolve, 10))
    sessionSetData.length = 0

    for (let i = 0; i < 500; i++) sandbox.test_addLog(`line ${i}`)
    // No synchronous write-per-line storm (the O(n^2) freeze).
    assert.strictEqual(sessionSetData.length, 0)
    await new Promise((resolve) => setTimeout(resolve, 200))
    // 500 rapid log lines collapse into one deferred flush.
    assert.strictEqual(sessionSetData.length, 1)
    assert.strictEqual(sessionSetData[0].archiveState.log.length, 500)
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

  it('should handle null, undefined, and malformed URLs gracefully', () => {
    const { sandbox } = setupEnvironment()
    assert.strictEqual(sandbox.test_extractAccountNum(null), '0')
    assert.strictEqual(sandbox.test_extractAccountNum(undefined), '0')
    assert.strictEqual(sandbox.test_extractAccountNum('not-a-url'), '0')
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
// startOperation Refactor Tests
// =============================================================================

describe('startOperation refactoring', () => {
  it('initOperationState should initialize state correctly', () => {
    const { sandbox } = setupEnvironment()
    const options = { opMode: 'archive', dryRun: false, force: false }
    const isSuggestions = sandbox.test_initOperationState(options)

    assert.strictEqual(isSuggestions, false)
    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'running')
    assert.strictEqual(state.log.length, 2) // Archive mode + v2 API
    assert.ok(state.log[0].includes('ARCHIVE MODE'))
  })

  it('discoverTabs should handle no tabs found', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.tabs.query = async () => []
    const tabs = await sandbox.test_discoverTabs({})

    assert.strictEqual(tabs, null)
    assert.strictEqual(sandbox.test_state().status, 'error')
    assert.strictEqual(sandbox.test_state().error, 'No Jules tabs found')
  })

  it('discoverTabs should return filtered tabs', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.tabs.query = async () => [
      { id: 1, url: 'https://jules.google.com/u/0/session' },
      { id: 2, url: 'https://jules.google.com/u/1/session' }
    ]
    const tabs = await sandbox.test_discoverTabs({ scope: 'current', activeTabId: 2 })

    assert.strictEqual(tabs.length, 1)
    assert.strictEqual(tabs[0].id, 2)
  })

  it('finalizeOperation should update status to done and log summary', () => {
    const { sandbox } = setupEnvironment()
    const results = [{ label: 'u/0', count: 5 }]
    sandbox.test_finalizeOperation(results, false)

    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'done')
    assert.deepStrictEqual(state.results, results)
    assert.ok(state.log.some((l) => l.includes('GRAND TOTAL: 5 tasks archived')))
  })

  it('handleOperationError should log error and update status', () => {
    const { sandbox } = setupEnvironment()
    sandbox.test_handleOperationError(new Error('Test error'))

    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'error')
    assert.strictEqual(state.error, 'Test error')
    assert.ok(state.log.some((l) => l.includes('FATAL ERROR: Test error')))
  })

  it('handleOperationError should handle non-Error objects gracefully', () => {
    const { sandbox } = setupEnvironment()
    sandbox.test_handleOperationError('String error message')

    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'error')
    assert.strictEqual(state.error, 'String error message')
    assert.ok(state.log.some((l) => l.includes('FATAL ERROR: String error message')))
  })

  it('startOperation should orchestrate successfully', async () => {
    const { sandbox } = setupEnvironment()
    const options = { opMode: 'archive' }

    // Mock helpers
    sandbox.chrome.tabs.query = async () => [{ id: 1, url: 'https://jules.google.com/u/0/session' }]
    sandbox.processTab = async () => 3

    await sandbox.test_startOperation(options)

    const state = sandbox.test_state()
    assert.strictEqual(state.status, 'done')
    assert.strictEqual(state.results[0].count, 3)
  })
})

// =============================================================================
// jFetch Tests
// =============================================================================

describe('jFetch', () => {
  it('should throw an error for non-OK HTTP responses', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })

    await assert.rejects(() => sandbox.test_jFetch('https://jules.google.com/api/test'), {
      name: 'Error',
      message: 'HTTP 404'
    })
  })

  it('should return the response for successful HTTP requests', async () => {
    const { sandbox } = setupEnvironment()
    const mockResponse = { ok: true, status: 200 }
    sandbox.fetch = async () => mockResponse

    const res = await sandbox.test_jFetch('https://jules.google.com/api/test')
    assert.strictEqual(res, mockResponse)
  })

  it('should throw an error for disallowed fetch origins', async () => {
    const { sandbox } = setupEnvironment()

    await assert.rejects(() => sandbox.test_jFetch('https://malicious.com/api/test'), {
      name: 'Error',
      message: 'Security Error: Disallowed fetch origin'
    })
  })

  it('should throw an error if token is not a string', async () => {
    const { sandbox } = setupEnvironment()

    await assert.rejects(() => sandbox.test_jFetch('https://api.github.com/api/test', { token: 123 }), {
      name: 'Error',
      message: 'Token must be a string'
    })
  })

  it('should throw an error if token contains newlines', async () => {
    const { sandbox } = setupEnvironment()

    await assert.rejects(() => sandbox.test_jFetch('https://api.github.com/api/test', { token: 'invalid\ntoken' }), {
      name: 'Error',
      message: 'Invalid token: contains newline'
    })
  })

  it('should include Authorization header when token is provided', async () => {
    const { sandbox } = setupEnvironment()
    let capturedHeaders = null
    sandbox.fetch = async (_url, options) => {
      capturedHeaders = options.headers
      return { ok: true }
    }

    await sandbox.test_jFetch('https://api.github.com/api/test', { token: 'valid-token' })
    assert.strictEqual(capturedHeaders.Authorization, 'token valid-token')
  })

  it('should throw an error for HTTP 500 status code', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    })

    await assert.rejects(() => sandbox.test_jFetch('https://jules.google.com/api/test'), {
      name: 'Error',
      message: 'HTTP 500'
    })
  })

  it('should throw an error if fetch throws a network error', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => {
      throw new Error('Network failure')
    }

    await assert.rejects(() => sandbox.test_jFetch('https://jules.google.com/api/test'), {
      name: 'Error',
      message: 'Network failure'
    })
  })

  it('should pass custom options correctly to fetch', async () => {
    const { sandbox } = setupEnvironment()
    let capturedOptions = null
    sandbox.fetch = async (_url, options) => {
      capturedOptions = options
      return { ok: true }
    }

    await sandbox.test_jFetch('https://jules.google.com/api/test', {
      method: 'POST',
      body: 'test-body',
      headers: { 'X-Custom': 'value' }
    })

    assert.strictEqual(capturedOptions.method, 'POST')
    assert.strictEqual(capturedOptions.body, 'test-body')
    assert.strictEqual(capturedOptions.headers['X-Custom'], 'value')
  })
})

// =============================================================================
// KeepAlive Tests
// =============================================================================

describe('KeepAlive', () => {
  it('startKeepAlive should set a 25s interval', () => {
    const { sandbox } = setupEnvironment()
    sandbox.test_startKeepAlive()

    assert.strictEqual(sandbox.test_activeTimers.length, 1)
    assert.strictEqual(sandbox.test_activeTimers[0].ms, 25000)
    assert.ok(sandbox.test_getKeepAliveInterval() !== null)
  })

  it('startKeepAlive should call chrome.runtime.getPlatformInfo periodically', async () => {
    const { sandbox } = setupEnvironment()
    let called = false
    sandbox.chrome.runtime.getPlatformInfo = async () => {
      called = true
    }

    sandbox.test_startKeepAlive()
    // Manually trigger the interval callback
    await sandbox.test_activeTimers[0].fn()
    assert.ok(called)
  })

  it('startKeepAlive should be idempotent', () => {
    const { sandbox } = setupEnvironment()
    sandbox.test_startKeepAlive()
    sandbox.test_startKeepAlive()

    assert.strictEqual(sandbox.test_activeTimers.length, 1)
  })

  it('stopKeepAlive should clear the interval and reset state', () => {
    const { sandbox } = setupEnvironment()
    sandbox.test_startKeepAlive()
    const intervalId = sandbox.test_getKeepAliveInterval()
    assert.ok(intervalId !== null)

    sandbox.test_stopKeepAlive()
    assert.strictEqual(sandbox.test_clearedTimers.length, 1)
    assert.strictEqual(sandbox.test_clearedTimers[0], intervalId)
    assert.strictEqual(sandbox.test_getKeepAliveInterval(), null)
  })
})

describe('callBatchExecute', () => {
  it('should throw error when jFetch fails with HTTP error', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    })

    const config = { accountNum: '0' }
    await assert.rejects(sandbox.test_callBatchExecute('rpcId', {}, config), {
      message: 'batchexecute rpcId failed: HTTP 500'
    })
  })

  it('should throw error when fetch throws network error', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.fetch = async () => {
      throw new Error('Network Error')
    }

    const config = { accountNum: '0' }
    await assert.rejects(sandbox.test_callBatchExecute('rpcId', {}, config), {
      message: 'batchexecute rpcId failed: Network Error'
    })
  })
})

// =============================================================================
// Suggestion Operations Tests
// =============================================================================

describe('listSuggestions', () => {
  it('should return an empty array if callBatchExecute returns null', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => null

    const result = await sandbox.test_listSuggestions('repo', {})
    assert.strictEqual(result.length, 0)
  })

  it('should return an empty array if callBatchExecute returns an empty array', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => []

    const result = await sandbox.test_listSuggestions('repo', {})
    assert.strictEqual(result.length, 0)
  })

  it('should return an empty array if callBatchExecute returns [null]', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => [null]

    const result = await sandbox.test_listSuggestions('repo', {})
    assert.strictEqual(result.length, 0)
  })

  it('should return an empty array if callBatchExecute returns [[]]', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => [[]]

    const result = await sandbox.test_listSuggestions('repo', {})
    assert.strictEqual(result.length, 0)
  })

  it('should return parsed suggestions for valid response data', async () => {
    const { sandbox } = setupEnvironment()
    const mockResponse = [[['s1', ['Title', 'Desc', 'url', 'path', 1, 0.9, 'rat', 'code', 'js', 'slug', 1], 1, [], 0]]]
    sandbox.callBatchExecute = async () => mockResponse

    const result = await sandbox.test_listSuggestions('repo', {})
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].id, 's1')
    assert.strictEqual(result[0].title, 'Title')
    assert.strictEqual(result[0].confidence, 0.9)
  })

  it('should filter out null/invalid suggestions', async () => {
    const { sandbox } = setupEnvironment()
    const mockResponse = [
      [
        ['s1', ['Title', 'Desc', 'url', 'path', 1, 0.9, 'rat', 'code', 'js', 'slug', 1], 1, [], 0],
        null,
        ['s2', null, 1, [], 0] // parseSuggestion returns null if details is missing
      ]
    ]
    sandbox.callBatchExecute = async () => mockResponse

    const result = await sandbox.test_listSuggestions('repo', {})
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].id, 's1')
  })
})

describe('getStartConfig', () => {
  it('should return the config object when it exists in session storage', async () => {
    const mockConfig = { modelId: 'test-model', features: ['a', 'b'] }
    const { sandbox } = setupEnvironment({ startConfig: mockConfig })

    const result = await sandbox.test_getStartConfig()
    assert.deepStrictEqual(result, mockConfig)
  })

  it('should return null when no config exists in session storage', async () => {
    const { sandbox } = setupEnvironment({}) // empty storage

    const result = await sandbox.test_getStartConfig()
    assert.strictEqual(result, null)
  })
})

// =============================================================================
// getTabConfig Tests
// =============================================================================

describe('getTabConfig', () => {
  it('should return config and accountNum on success', async () => {
    const { sandbox } = setupEnvironment()
    const result = await sandbox.test_getTabConfig(1)
    assert.strictEqual(result.at, 'token')
    assert.strictEqual(result.bl, 'build')
    assert.strictEqual(result.fsid, '123')
    assert.strictEqual(result.accountNum, '0')
  })

  it('should throw error when "at" property is missing', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.tabs.sendMessage = async () => ({
      config: { bl: 'build', fsid: '123' },
      accountNum: '0'
    })
    await assert.rejects(sandbox.test_getTabConfig(1), {
      message: 'Could not extract page config (XSRF token missing). Try refreshing the Jules tab.'
    })
  })

  it('should throw security error for invalid accountNum format', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.tabs.sendMessage = async () => ({
      config: { at: 'token', bl: 'build', fsid: '123' },
      accountNum: 'invalid-123'
    })
    await assert.rejects(sandbox.test_getTabConfig(1), { message: 'Security Error: Invalid account number format' })
  })

  it('should handle missing accountNum by defaulting to "0"', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.tabs.sendMessage = async () => ({
      config: { at: 'token', bl: 'build', fsid: '123' }
    })
    const result = await sandbox.test_getTabConfig(1)
    assert.strictEqual(result.accountNum, '0')
  })
})

// =============================================================================
// ensureContentScript Tests
// =============================================================================

describe('ensureContentScript', () => {
  it('should return documentId when initial PING succeeds', async () => {
    const { sandbox } = setupEnvironment()
    const tabId = 123
    let messageSent = null

    sandbox.chrome.tabs.sendMessage = async (id, msg, options) => {
      if (msg.action === 'PING') {
        messageSent = { id, msg, options }
        return { ok: true }
      }
      return null
    }

    const docId = await sandbox.test_ensureContentScript(tabId)
    assert.strictEqual(docId, 'doc1')
    assert.strictEqual(messageSent.id, tabId)
    assert.strictEqual(messageSent.msg.action, 'PING')
    assert.strictEqual(messageSent.options.documentId, 'doc1')
  })

  it('should inject script and retry when initial PING fails', async () => {
    const { sandbox } = setupEnvironment()
    const tabId = 123
    let pings = 0
    let scriptInjected = false

    sandbox.chrome.tabs.sendMessage = async () => {
      pings++
      if (pings === 1) throw new Error('Could not establish connection')
      return { ok: true }
    }

    sandbox.chrome.scripting.executeScript = async (opts) => {
      assert.strictEqual(opts.target.tabId, tabId)
      // Use JSON.stringify to avoid cross-VM reference issues with deepStrictEqual
      assert.strictEqual(JSON.stringify(opts.files), JSON.stringify(['content.js']))
      scriptInjected = true
    }

    // Mock setTimeout to resolve immediately
    sandbox.setTimeout = (fn) => {
      fn()
      return 0
    }

    const docId = await sandbox.test_ensureContentScript(tabId)
    assert.strictEqual(docId, 'doc1')
    assert.strictEqual(scriptInjected, true)
    assert.strictEqual(pings, 2)
  })

  it('should throw security error if frame URL is missing', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.webNavigation.getFrame = async () => ({ url: null, documentId: 'doc1' })

    await assert.rejects(sandbox.test_ensureContentScript(123), {
      message: 'Security Error: Cannot verify tab origin'
    })
  })

  it('should throw security error if origin is invalid', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.chrome.webNavigation.getFrame = async () => ({ url: 'https://example.com', documentId: 'doc1' })

    await assert.rejects(sandbox.test_ensureContentScript(123), {
      message: 'Security Error: Cannot inject script into non-Jules tab'
    })
  })

  it('should throw error if content script fails to initialize within 3s', async () => {
    const { sandbox } = setupEnvironment()
    const tabId = 123
    let now = 1000

    sandbox.chrome.tabs.sendMessage = async () => {
      throw new Error('Still not ready')
    }

    sandbox.Date.now = () => now
    sandbox.setTimeout = (fn) => {
      now += 500 // Advance time by 500ms on each retry (loop has 100ms sleep)
      fn()
      return 0
    }

    await assert.rejects(sandbox.test_ensureContentScript(tabId), {
      message: 'Content script failed to initialize within 3s'
    })
  })
})

describe('groupTasksByRepo Internal', () => {
  it('should correctly group tasks using the internal function', () => {
    const { sandbox } = setupEnvironment()
    const tasks = [
      { id: '1', repo: 'repo-1' },
      { id: '2', repo: 'repo-2' },
      { id: '3', repo: 'repo-1' }
    ]
    const result = sandbox.test_groupTasksByRepo(tasks)
    assert.strictEqual(result.size, 2)
    assert.strictEqual(result.get('repo-1').length, 2)
    assert.strictEqual(result.get('repo-2').length, 1)
  })
})

describe('safeListTasks', () => {
  it('should return tasks when listTasks succeeds with non-empty list', async () => {
    const { sandbox } = setupEnvironment()
    const mockTasks = [
      ['task-1', 'Title 1', null, null, 'github/owner/repo', 2],
      ['task-2', 'Title 2', null, null, 'github/owner/repo2', 4]
    ]
    sandbox.callBatchExecute = async () => [mockTasks]

    const result = await sandbox.test_safeListTasks('test-label', {})
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].id, 'task-1')
    assert.strictEqual(result[1].id, 'task-2')
  })

  it('should return null and log message when listTasks returns an empty array', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => [[]]

    const result = await sandbox.test_safeListTasks('test-label', {})
    assert.strictEqual(result, null)
    const state = sandbox.test_state()
    assert.ok(state.log.some((l) => l.includes('[test-label] No tasks found.')))
  })

  it('should return null and log error when listTasks throws', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => {
      throw new Error('Network error')
    }

    const result = await sandbox.test_safeListTasks('test-label', {})
    assert.strictEqual(result, null)
    const state = sandbox.test_state()
    assert.ok(state.log.some((l) => l.includes('[test-label] ERROR listing tasks: Network error')))
  })
})

describe('safeListSources', () => {
  it('should return sources when listSuggestionEnabledSources succeeds with non-empty list', async () => {
    const { sandbox } = setupEnvironment()
    const mockSources = [
      ['github/owner/repo', null, null, null, null, [true, true, [2], [true]]],
      ['github/owner/repo2', null, null, null, null, [true, true, [2], [true]]]
    ]
    sandbox.callBatchExecute = async () => [mockSources]

    const result = await sandbox.test_safeListSources('test-label', {})
    assert.strictEqual(result.length, 2)
    assert.deepStrictEqual(result, ['github/owner/repo', 'github/owner/repo2'])
  })

  it('should return null and log message when no repos have Suggestions enabled', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => [[]]

    const result = await sandbox.test_safeListSources('test-label', {})
    assert.strictEqual(result, null)
    const state = sandbox.test_state()
    assert.ok(state.log.some((l) => l.includes('[test-label] No repos have Suggestions enabled.')))
  })

  it('should return null and log error when listSuggestionEnabledSources throws', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => {
      throw new Error('API error')
    }

    const result = await sandbox.test_safeListSources('test-label', {})
    assert.strictEqual(result, null)
    const state = sandbox.test_state()
    assert.ok(state.log.some((l) => l.includes('[test-label] ERROR listing sources: API error')))
  })
})

describe('trimLog Internal', () => {
  it('should not trim if log length is equal to MAX_LOG_LINES', () => {
    const { sandbox } = setupEnvironment()
    const max = sandbox.test_MAX_LOG_LINES
    const state = sandbox.test_state()
    state.log = Array.from({ length: max }, (_, i) => `line ${i}`)

    sandbox.test_trimLog()

    assert.strictEqual(state.log.length, max)
    assert.strictEqual(state.log[0], 'line 0')
    assert.strictEqual(state.log[max - 1], `line ${max - 1}`)
  })

  it('should trim oldest entries if log length exceeds MAX_LOG_LINES', () => {
    const { sandbox } = setupEnvironment()
    const max = sandbox.test_MAX_LOG_LINES
    const state = sandbox.test_state()
    // Create max + 10 entries
    state.log = Array.from({ length: max + 10 }, (_, i) => `line ${i}`)

    sandbox.test_trimLog()

    assert.strictEqual(state.log.length, max)
    // Should have removed the first 10 entries
    assert.strictEqual(state.log[0], 'line 10')
    assert.strictEqual(state.log[max - 1], `line ${max + 9}`)
  })
})
