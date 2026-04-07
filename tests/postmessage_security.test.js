const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('postMessage Security', () => {
  const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')
  const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')

  function setupSandbox() {
    const messages = []
    const sandbox = {
      window: {
        origin: 'https://jules.google.com',
        postMessage: (data, origin) => {
          messages.push({ data, origin })
        },
        addEventListener: () => {},
        WIZ_global_data: {
          SNlM0e: 'at-token',
          cfb2h: 'bl-token',
          FdrFJe: 'fsid-token',
          TSDtV: 'beyond:models/gemini-pro'
        }
      },
      chrome: {
        runtime: {
          sendMessage: () => {},
          onMessage: { addListener: () => {} }
        }
      },
      console,
      setTimeout: (fn) => fn(),
      clearTimeout: () => {},
      Date,
      URL,
      location: { href: 'https://jules.google.com/u/0/' }
    }
    // Cross-reference window and global
    sandbox.window.window = sandbox.window
    sandbox.origin = sandbox.window.origin
    sandbox.postMessage = sandbox.window.postMessage.bind(sandbox.window)

    vm.createContext(sandbox)
    return { sandbox, messages }
  }

  it('main-world.js should use window.origin in broadcastConfig', () => {
    const { sandbox, messages } = setupSandbox()
    vm.runInContext(mainWorldJs, sandbox)

    // broadcastConfig is called at the end of main-world.js
    const configMsg = messages.find((m) => m.data.type === 'JULES_ARCHIVER_CONFIG')
    assert.ok(configMsg, 'Should have sent JULES_ARCHIVER_CONFIG')
    assert.strictEqual(configMsg.origin, 'https://jules.google.com', 'Target origin should be restricted')
    assert.notStrictEqual(configMsg.origin, '*', 'Target origin should not be wildcard')
  })

  it('content.js should use window.origin in extractConfig', async () => {
    const { sandbox, messages } = setupSandbox()
    vm.runInContext(contentJs, sandbox)

    // We need to trigger extractConfig.
    // It's not exported, so we have to run it in the context.
    vm.runInContext('extractConfig()', sandbox)

    const requestMsg = messages.find((m) => m.data.type === 'JULES_REQUEST_CONFIG')
    assert.ok(requestMsg, 'Should have sent JULES_REQUEST_CONFIG')
    assert.strictEqual(requestMsg.origin, 'https://jules.google.com', 'Target origin should be restricted')
    assert.notStrictEqual(requestMsg.origin, '*', 'Target origin should not be wildcard')
  })
})
