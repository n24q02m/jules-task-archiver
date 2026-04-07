const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('PostMessage Security: Target Origin Restriction', () => {
  const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')
  const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')

  it('main-world.js should use a restricted origin in broadcastConfig', () => {
    let capturedOrigin = null
    const sandbox = {
      window: {
        WIZ_global_data: { SNlM0e: 'at', cfb2h: 'bl', FdrFJe: 'fsid' },
        postMessage: (_data, origin) => {
          capturedOrigin = origin
        },
        origin: 'https://jules.google.com',
        addEventListener: () => {}
      },
      Date,
      String,
      console,
      URL,
      URLSearchParams
    }
    sandbox.window.window = sandbox.window
    vm.createContext(sandbox)
    vm.runInContext(mainWorldJs, sandbox)

    // broadcastConfig is called immediately at the end of main-world.js
    assert.notStrictEqual(capturedOrigin, '*', 'main-world.js broadcastConfig should NOT use "*" as target origin')
    assert.strictEqual(capturedOrigin, sandbox.window.origin, 'main-world.js broadcastConfig should use window.origin')
  })

  it('main-world.js should use a restricted origin in fetch observer', async () => {
    let capturedOrigin = null
    const sandbox = {
      window: {
        postMessage: (data, origin) => {
          if (data.type === 'JULES_START_CONFIG') {
            capturedOrigin = origin
          }
        },
        origin: 'https://jules.google.com',
        addEventListener: () => {},
        fetch: async () => ({}) // Will be overridden
      },
      Date,
      String,
      JSON,
      console,
      URL,
      URLSearchParams
    }
    sandbox.window.window = sandbox.window
    vm.createContext(sandbox)
    vm.runInContext(mainWorldJs, sandbox)

    // Simulate fetch call that triggers the observer
    const fetchArgs = [
      'https://jules.google.com/rpc?rpcids=Rja83d',
      {
        body: `f.req=${encodeURIComponent(JSON.stringify([[['Rja83d', JSON.stringify([null, null, {}]), null, '1']]]))}`
      }
    ]

    await sandbox.window.fetch(...fetchArgs)

    assert.notStrictEqual(capturedOrigin, '*', 'main-world.js fetch observer should NOT use "*" as target origin')
    assert.strictEqual(capturedOrigin, sandbox.window.origin, 'main-world.js fetch observer should use window.origin')
  })

  it('content.js should use a restricted origin in extractConfig', async () => {
    let capturedOrigin = null
    const sandbox = {
      window: {
        postMessage: (data, origin) => {
          if (data.type === 'JULES_REQUEST_CONFIG') {
            capturedOrigin = origin
          }
        },
        origin: 'https://jules.google.com',
        addEventListener: () => {},
        removeEventListener: () => {}
      },
      chrome: {
        runtime: {
          onMessage: { addListener: () => {} }
        }
      },
      setTimeout,
      clearTimeout,
      Date,
      Promise,
      console,
      URL,
      URLSearchParams
    }
    sandbox.window.window = sandbox.window
    vm.createContext(sandbox)
    vm.runInContext(contentJs, sandbox)

    // extractConfig is a global function in content.js
    await sandbox.extractConfig()

    assert.notStrictEqual(capturedOrigin, '*', 'content.js extractConfig should NOT use "*" as target origin')
    assert.strictEqual(capturedOrigin, sandbox.window.origin, 'content.js extractConfig should use window.origin')
  })
})
