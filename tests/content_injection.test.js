const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '../content.js')
const contentJsCode = fs.readFileSync(contentJsPath, 'utf8')

describe('content.js script injection', () => {
  it('should inject main-world.js and remove it on load', () => {
    let scriptCreated = null
    let appendedTo = null
    let removed = false

    const chrome = {
      runtime: {
        getURL: (p) => `chrome-extension://id/${p}`,
        onMessage: { addListener: () => {} }
      }
    }

    const document = {
      createElement: (tag) => {
        if (tag === 'script') {
          scriptCreated = {
            src: '',
            onload: null,
            remove: () => {
              removed = true
            }
          }
          return scriptCreated
        }
      },
      head: {
        appendChild: (_el) => {
          appendedTo = 'head'
        }
      },
      documentElement: {
        appendChild: (_el) => {
          if (!appendedTo) appendedTo = 'documentElement'
        }
      }
    }

    const window = {
      addEventListener: () => {},
      location: { origin: 'https://example.com' }
    }

    const sandbox = {
      chrome,
      document,
      window,
      console,
      setTimeout,
      clearTimeout,
      Date,
      Promise,
      URL,
      location: window.location
    }

    vm.createContext(sandbox)
    vm.runInContext(contentJsCode, sandbox)

    // Assertions
    assert.ok(scriptCreated, 'Script should be created')
    assert.strictEqual(scriptCreated.src, 'chrome-extension://id/main-world.js')
    assert.ok(appendedTo, 'Script should be appended to document')

    // Simulate onload
    assert.strictEqual(removed, false)
    scriptCreated.onload()
    assert.strictEqual(removed, true, 'Script should be removed after onload')
  })
})
