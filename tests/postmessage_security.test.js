const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('Security: postMessage Target Origin', () => {
  const JULES_ORIGIN = 'https://jules.google.com'

  it('content.js should use JULES_ORIGIN for postMessage', () => {
    const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')
    let postMessageCalled = false
    let targetOrigin = null

    const sandbox = {
      window: {
        location: { href: 'https://jules.google.com/u/0/' },
        addEventListener: () => {},
        removeEventListener: () => {}
      },
      chrome: {
        runtime: {
          onMessage: { addListener: () => {} },
          sendMessage: () => {}
        }
      },
      console,
      setTimeout,
      clearTimeout,
      Date,
      Promise,
      URL
    }
    sandbox.window.postMessage = (_message, origin) => {
      postMessageCalled = true
      targetOrigin = origin
    }
    sandbox.window.source = sandbox.window
    vm.createContext(sandbox)
    vm.runInContext(contentJs, sandbox)

    // Call extractConfig from the sandbox context
    vm.runInContext('extractConfig();', sandbox)

    assert.ok(postMessageCalled, 'window.postMessage should be called')
    assert.strictEqual(targetOrigin, JULES_ORIGIN, `targetOrigin should be ${JULES_ORIGIN}`)
  })

  it('main-world.js should use JULES_ORIGIN for postMessage', () => {
    const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')
    const origins = []

    const sandbox = {
      window: {
        postMessage: (_message, origin) => {
          origins.push(origin)
        },
        addEventListener: () => {},
        WIZ_global_data: {}
      },
      console,
      Date,
      URLSearchParams,
      JSON
    }
    vm.createContext(sandbox)
    vm.runInContext(mainWorldJs, sandbox)

    assert.ok(origins.length > 0, 'window.postMessage should be called at least once')
    origins.forEach((origin) => {
      assert.strictEqual(origin, JULES_ORIGIN, `targetOrigin should be ${JULES_ORIGIN}`)
    })
  })
})
