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
    documentElement: {},
    querySelector: () => null
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
    Date,
    TEST_MODE: true
  }

  sandbox.globalThis = sandbox
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

  it('should extract account from DOM if present', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/tasks')
    sandbox.document.querySelector = (selector) => {
      if (selector === 'c-wiz[data-is-main-wiz]') {
        return {
          getAttribute: (name) => {
            if (name === 'data-auth-user') return '2'
            return null
          }
        }
      }
      return null
    }
    assert.strictEqual(sandbox.test_getAccountNum(), '2')
    assert.strictEqual(sandbox.getAccountLabel(), 'u/2')
  })

  it('should fall back to URL if DOM extraction fails (element missing)', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/u/3/tasks')
    sandbox.document.querySelector = () => null
    assert.strictEqual(sandbox.test_getAccountNum(), '3')
  })

  it('should fall back to URL if DOM extraction fails (attribute missing)', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/u/4/tasks')
    sandbox.document.querySelector = (selector) => {
      if (selector === 'c-wiz[data-is-main-wiz]') {
        return {
          getAttribute: () => null
        }
      }
      return null
    }
    assert.strictEqual(sandbox.test_getAccountNum(), '4')
  })

  it('should fall back to URL if querySelector throws', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/u/5/tasks')
    sandbox.document.querySelector = () => {
      throw new Error('DOM Error')
    }
    // Should catch the error and fall back to URL
    assert.strictEqual(sandbox.test_getAccountNum(), '5')
  })
})
