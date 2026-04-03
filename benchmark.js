const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

const bgScriptPath = path.join(__dirname, 'background.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')

async function runBenchmark() {
  const _sessionSetData = []
  let currentStorage = {}

  const chromeMock = {
    storage: {
      session: {
        get: async (key) => (key ? { [key]: currentStorage[key] } : currentStorage),
        set: async (data) => {
          currentStorage = { ...currentStorage, ...data }
        }
      },
      sync: {
        get: async () => ({ ghOwner: 'test-owner' }),
        remove: async () => {}
      },
      local: {
        get: async () => ({ ghToken: 'test-token' }),
        set: async () => {}
      }
    },
    runtime: {
      onMessage: { addListener: () => {} },
      getPlatformInfo: async () => ({})
    },
    tabs: {
      query: async () => [],
      sendMessage: async (_tabId, msg) => {
        if (msg.action === 'GET_REPOS') {
          // generate 10 repos
          return {
            repos: Array.from({ length: 10 }, (_, i) => ({
              name: `repo-${i}`,
              repo: `repo-${i}`,
              tasks: 1,
              owner: 'test-owner'
            }))
          }
        }
        return {}
      },
      get: async () => ({ url: 'https://jules.google.com/' })
    },
    scripting: {
      executeScript: async () => {}
    }
  }

  const sandbox = {
    chrome: chromeMock,
    fetch: async () => {
      await new Promise((r) => setTimeout(r, 100)) // 100ms delay
      return { ok: true, json: async () => [] } // returns 0 PRs
    },
    setTimeout,
    setInterval,
    clearInterval,
    console
  }

  vm.createContext(sandbox)

  const scriptContent =
    bgScriptContent +
    `\n
    globalThis.test_processTab = processTab;
    globalThis.test_prCache = prCache;
    globalThis.test_stateReadyPromise = stateReadyPromise;
  `

  const script = new vm.Script(scriptContent)
  script.runInContext(sandbox)

  await sandbox.test_stateReadyPromise

  sandbox.test_prCache.clear()

  const start = performance.now()
  await sandbox.test_processTab({ id: 1, url: 'https://jules.google.com/u/0' }, { dryRun: true, force: false })
  const end = performance.now()

  console.log(`Execution time: ${(end - start).toFixed(2)}ms`)
}

runBenchmark().catch(console.error)
