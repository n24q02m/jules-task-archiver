const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '../content.js')
const contentJsContent = fs.readFileSync(contentJsPath, 'utf8')

function setupContentSandbox(initialUrl = 'https://jules.google.com/u/0/') {
  const chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://id/${path}`,
      sendMessage: () => {},
      onMessage: {
        addListener: () => {}
      }
    }
  }

  const document = {
    createElement: () => ({
      setAttribute: () => {},
      onload: null,
      remove: () => {}
    }),
    head: {
      appendChild: (el) => {
        if (el.onload) el.onload()
      }
    },
    documentElement: {}
  }

  const window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    postMessage: () => {}
  }

  const location = {
    href: initialUrl
  }

  const sandbox = {
    chrome,
    document,
    window,
    location,
    URL,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date
  }

  vm.createContext(sandbox)
  vm.runInContext(contentJsContent, sandbox)

  return sandbox
}

describe('content.js getAccountLabel', () => {
  it('should return "default" for account 0', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/u/0/session')
    assert.strictEqual(sandbox.getAccountLabel(), 'default')
  })

  it('should return "u/1" for account 1', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/u/1/tasks')
    assert.strictEqual(sandbox.getAccountLabel(), 'u/1')
  })

  it('should return "default" when no account segment is present', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/tasks')
    assert.strictEqual(sandbox.getAccountLabel(), 'default')
  })

  it('should return "default" for trailing "u" without ID', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/u/')
    assert.strictEqual(sandbox.getAccountLabel(), 'default')
  })

  it('should handle malformed URLs gracefully via getAccountNum try-catch', () => {
    const sandbox = setupContentSandbox('not-a-url')
    // getAccountNum has a try-catch that returns '0' on error
    assert.strictEqual(sandbox.getAccountLabel(), 'default')
  })
})
