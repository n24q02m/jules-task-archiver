const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('window.postMessage Security', () => {
  const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')
  const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')

  it('main-world.js should not use "*" as target origin', () => {
    const sentMessages = []
    const sandbox = {
      window: {
        postMessage: (data, origin) => {
          sentMessages.push({ data, origin })
        },
        addEventListener: () => {},
        WIZ_global_data: {
          SNlM0e: 'at',
          cfb2h: 'bl',
          FdrFJe: 'fsid',
          TSDtV: 'beyond:models/gemini-pro'
        }
      },
      Date: { now: () => 123456789 },
      console,
      URL: globalThis.URL,
      URLSearchParams: globalThis.URLSearchParams
    }
    sandbox.window.origin = 'https://jules.google.com'
    // Make window properties available on sandbox root as well for easier access if script uses global variables
    Object.assign(sandbox, sandbox.window)

    vm.createContext(sandbox)
    vm.runInContext(mainWorldJs, sandbox)

    // broadcastConfig is called immediately at the end of the script
    assert.ok(sentMessages.length > 0, 'Should have sent at least one message')
    for (const msg of sentMessages) {
      assert.notStrictEqual(msg.origin, '*', 'Should not use "*" as target origin')
      assert.strictEqual(msg.origin, 'https://jules.google.com', 'Should use specific origin or window.origin')
    }
  })

  it('content.js should not use "*" as target origin in extractConfig', async () => {
    const sentMessages = []
    const sandbox = {
      window: {
        postMessage: (data, origin) => {
          sentMessages.push({ data, origin })
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        origin: 'https://jules.google.com'
      },
      chrome: {
        runtime: {
          onMessage: { addListener: () => {} },
          sendMessage: () => {}
        }
      },
      location: { href: 'https://jules.google.com/u/0/' },
      Date: { now: () => 123456789 },
      setTimeout,
      clearTimeout,
      console,
      URL: globalThis.URL,
      Promise: globalThis.Promise
    }
    Object.assign(sandbox, sandbox.window)

    vm.createContext(sandbox)
    vm.runInContext(contentJs, sandbox)

    if (typeof sandbox.extractConfig === 'function') {
      sandbox.extractConfig()
    } else {
      throw new Error('extractConfig not found in sandbox')
    }

    assert.ok(sentMessages.length > 0, 'Should have sent a message via extractConfig')
    for (const msg of sentMessages) {
      assert.notStrictEqual(msg.origin, '*', 'Should not use "*" as target origin')
      assert.strictEqual(msg.origin, 'https://jules.google.com', 'Should use specific origin or window.origin')
    }
  })
})
