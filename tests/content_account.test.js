const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const contentJsPath = path.join(__dirname, '../content.js')
const contentJsContent = fs.readFileSync(contentJsPath, 'utf8')

function setupContentSandbox(initialUrl = 'https://jules.google.com/u/0/') {
  const chromeMock = {
    runtime: {
      getURL: (p) => `chrome-extension://id/${p}`,
      sendMessage: () => {},
      onMessage: {
        addListener: () => {}
      }
    }
  }

  const documentMock = {
    createElement: () => ({
      src: '',
      onload: () => {},
      remove: () => {}
    }),
    head: {
      appendChild: () => {}
    },
    documentElement: {
      appendChild: () => {}
    }
  }

  const sandbox = {
    chrome: chromeMock,
    document: documentMock,
    location: {
      href: initialUrl
    },
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      postMessage: () => {}
    },
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    URL,
    Error
  }

  // Cross-references
  sandbox.window.location = sandbox.location
  sandbox.window.window = sandbox.window
  sandbox.addEventListener = sandbox.window.addEventListener

  vm.createContext(sandbox)
  vm.runInContext(contentJsContent, sandbox)

  return sandbox
}

describe('content.js: getAccountNum', () => {
  it('should extract account number from valid /u/X/ path', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/u/3/session')
    const result = sandbox.getAccountNum()
    assert.strictEqual(result, '3')
  })

  it('should extract account number 0 from /u/0/ path', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/u/0/repo')
    const result = sandbox.getAccountNum()
    assert.strictEqual(result, '0')
  })

  it('should return "0" when /u/ segment is missing', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/session')
    const result = sandbox.getAccountNum()
    assert.strictEqual(result, '0')
  })

  it('should return "0" when /u/ is the last segment', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/u')
    const result = sandbox.getAccountNum()
    assert.strictEqual(result, '0')
  })

  it('should handle malformed URLs gracefully via try-catch', () => {
    const sandbox = setupContentSandbox('https://jules.google.com/u/1/')

    // Force new URL() to throw by passing an empty/invalid href
    sandbox.location.href = ''

    const result = sandbox.getAccountNum()
    assert.strictEqual(result, '0')
  })
})
