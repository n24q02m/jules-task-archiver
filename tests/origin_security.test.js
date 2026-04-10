const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '..', 'content.js')
const contentJsContent = fs.readFileSync(contentJsPath, 'utf8')

const mainWorldJsPath = path.join(__dirname, '..', 'main-world.js')
const mainWorldJsContent = fs.readFileSync(mainWorldJsPath, 'utf8')

describe('Origin Security: postMessage target origin', () => {
  it('content.js should use JULES_ORIGIN as target origin in postMessage', () => {
    const sentMessages = []
    const sandbox = {
      window: {
        postMessage: (msg, origin) => {
          sentMessages.push({ msg, origin })
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        location: { href: 'https://jules.google.com/u/0/' }
      },
      setTimeout: () => {},
      clearTimeout: () => {},
      Promise,
      Date,
      URL,
      chrome: {
        runtime: {
          onMessage: { addListener: () => {} }
        }
      }
    }
    sandbox.self = sandbox
    vm.createContext(sandbox)
    vm.runInContext(contentJsContent, sandbox)

    // Trigger extractConfig (it's not exported, so we have to find it or trigger the message that calls it)
    // Actually extractConfig is a top-level function in content.js
    if (typeof sandbox.extractConfig === 'function') {
      sandbox.extractConfig()
    } else {
      // Fallback if not directly accessible (though it should be in vm if not wrapped in IIFE)
      // content.js is not wrapped in IIFE
      const script = `${contentJsContent}; extractConfig();`
      vm.runInContext(script, sandbox)
    }

    assert.ok(sentMessages.length > 0, 'Should have sent a message')
    sentMessages.forEach((m) => {
      assert.strictEqual(m.origin, 'https://jules.google.com', 'content.js postMessage origin should be restricted')
    })
  })

  it('main-world.js should use JULES_ORIGIN as target origin in postMessage', () => {
    const sentMessages = []
    const sandbox = {
      window: {
        postMessage: (msg, origin) => {
          sentMessages.push({ msg, origin })
        },
        WIZ_global_data: { SNlM0e: 'at', cfb2h: 'bl', FdrFJe: 'fsid' },
        addEventListener: () => {},
        fetch: () => Promise.resolve({ ok: true })
      },
      Date,
      console
    }
    sandbox.self = sandbox
    vm.createContext(sandbox)
    vm.runInContext(mainWorldJsContent, sandbox)

    assert.ok(sentMessages.length > 0, 'Should have sent a message')
    sentMessages.forEach((m) => {
      assert.strictEqual(m.origin, 'https://jules.google.com', 'main-world.js postMessage origin should be restricted')
    })
  })
})
