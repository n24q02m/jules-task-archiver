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
  `

  const script = new vm.Script(scriptContent)
  script.runInContext(sandbox)

  return { sandbox, sessionSetData }
}

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
