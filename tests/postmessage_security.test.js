const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('Security: postMessage Target Origin', () => {
  const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')
  const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')

  it('content.js should not use "*" as postMessage target origin', () => {
    let postMessageTarget = null
    const sandbox = {
      window: {
        addEventListener: () => {},
        postMessage: (_data, target) => {
          postMessageTarget = target
        }
      },
      chrome: {
        runtime: {
          onMessage: { addListener: () => {} }
        }
      },
      console,
      setTimeout,
      Date,
      Promise,
      URL
    }
    sandbox.self = sandbox.window
    vm.createContext(sandbox)

    vm.runInContext(contentJs, sandbox)

    // extractConfig is a top-level function in content.js
    if (typeof sandbox.extractConfig === 'function') {
      sandbox.extractConfig()
      assert.notStrictEqual(postMessageTarget, '*', 'content.js uses insecure "*" target origin')
      assert.strictEqual(postMessageTarget, 'https://jules.google.com', 'content.js should use JULES_ORIGIN')
    } else {
      // Fallback to checking source if VM doesn't pick it up
      assert.ok(!contentJs.includes(", '*'"), 'content.js appears to use "*" in postMessage')
    }
  })

  it('main-world.js should not use "*" as postMessage target origin', () => {
    const targets = []
    const sandbox = {
      window: {
        WIZ_global_data: { SNlM0e: 'at', cfb2h: 'bl', FdrFJe: 'fsid' },
        addEventListener: () => {},
        postMessage: (_data, target) => {
          targets.push(target)
        }
      },
      console,
      setTimeout,
      Date,
      Promise,
      URL,
      URLSearchParams,
      JSON
    }
    sandbox.self = sandbox.window
    vm.createContext(sandbox)

    vm.runInContext(mainWorldJs, sandbox)

    assert.ok(targets.length > 0, 'main-world.js should have called postMessage on load')
    for (const target of targets) {
      assert.notStrictEqual(target, '*', 'main-world.js uses insecure "*" target origin')
      assert.strictEqual(target, 'https://jules.google.com', 'main-world.js should use JULES_ORIGIN')
    }
  })
})
