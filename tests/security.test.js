const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')

function setupEnvironment() {
  let lastFetchUrl = null
  let lastFetchOptions = null

  const sandbox = {
    chrome: {
      storage: {
        session: { get: async () => ({}), set: async () => {} },
        sync: { get: async () => ({}) },
        local: { get: async () => ({}) }
      },
      runtime: {
        onMessage: { addListener: () => {} },
        getPlatformInfo: async () => ({})
      }
    },
    fetch: async (url, options) => {
      lastFetchUrl = url
      lastFetchOptions = options
      return { ok: true, json: async () => [] }
    },
    addLog: () => {},
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
    parseInt,
    encodeURIComponent
  }

  vm.createContext(sandbox)
  const scriptContent = `${bgScriptContent}\n globalThis.test_getOpenPRCount = getOpenPRCount;`
  const script = new vm.Script(scriptContent)
  script.runInContext(sandbox)

  return { sandbox, getLastFetch: () => ({ url: lastFetchUrl, options: lastFetchOptions }) }
}

describe('Security: getOpenPRCount', () => {
  it('should encode owner and repo in URL', async () => {
    const { sandbox, getLastFetch } = setupEnvironment()
    const owner = 'bad/owner'
    const repo = 'bad?repo'

    await sandbox.test_getOpenPRCount(owner, repo, 'token')

    const { url } = getLastFetch()
    assert.ok(url.includes('bad%2Fowner'), 'Owner should be encoded')
    assert.ok(url.includes('bad%3Frepo'), 'Repo should be encoded')
  })

  it('should prevent newline injection in Authorization header', async () => {
    const { sandbox, getLastFetch } = setupEnvironment()
    const malformedToken = 'valid\nInjected-Header: evil'

    await sandbox.test_getOpenPRCount('owner', 'repo', malformedToken)

    const { options } = getLastFetch()
    const authHeader = options.headers.Authorization

    if (authHeader) {
      assert.ok(!authHeader.includes('\n'), 'Authorization header should not contain newlines')
      assert.ok(!authHeader.includes('\r'), 'Authorization header should not contain carriage returns')
    } else {
      // If the token was rejected, that's also a valid fix.
      assert.strictEqual(authHeader, undefined)
    }
  })
})
