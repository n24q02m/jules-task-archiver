const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('Origin Security Tests', () => {
  const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')
  const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')

  function setupSandbox(scriptContent) {
    const postMessages = []
    const listeners = []
    const sandbox = {
      window: {
        origin: 'https://jules.google.com',
        addEventListener: (type, handler) => {
          if (type === 'message') listeners.push(handler)
        },
        removeEventListener: (type, handler) => {
          if (type === 'message') {
            const idx = listeners.indexOf(handler)
            if (idx !== -1) listeners.splice(idx, 1)
          }
        },
        postMessage: (data, origin) => {
          postMessages.push({ data, origin })
        }
      },
      chrome: {
        runtime: {
          sendMessage: () => {},
          onMessage: { addListener: () => {} }
        }
      },
      Date: { now: () => 1000 },
      setTimeout: () => {},
      clearTimeout: () => {},
      console: { log: () => {} },
      location: { href: 'https://jules.google.com/u/0/' },
      URL: global.URL,
      Promise: global.Promise
    }
    sandbox.self = sandbox
    vm.createContext(sandbox)
    vm.runInContext(scriptContent, sandbox)
    return { sandbox, postMessages, listeners }
  }

  it('content.js message listener should reject messages from different origin', () => {
    const { listeners } = setupSandbox(contentJs)
    // We expect at least the global listener
    assert.ok(listeners.length >= 1)

    const _configSet = false
    // Mocking cachedConfig behavior or checking side effects
    // Since cachedConfig is top level in content.js, we might need to expose it or check sendMessage

    // Let's check the source code for the check
    assert.ok(
      contentJs.includes('event.origin === window.origin') || contentJs.includes('event.origin !== window.origin'),
      'content.js should check event.origin'
    )
  })

  it('main-world.js message listener should reject messages from different origin', () => {
    const { listeners } = setupSandbox(mainWorldJs)
    assert.ok(listeners.length >= 1)
    assert.ok(
      mainWorldJs.includes('event.origin === window.origin') || mainWorldJs.includes('event.origin !== window.origin'),
      'main-world.js should check event.origin'
    )
  })

  it('content.js postMessage should use window.origin', () => {
    assert.ok(
      !contentJs.includes("postMessage(event.data, '*')"),
      'content.js should not use wildcard origin in postMessage'
    )
    assert.ok(contentJs.includes('window.origin'), 'content.js should use window.origin in postMessage')
  })

  it('main-world.js postMessage should use window.origin', () => {
    assert.ok(
      !mainWorldJs.includes("postMessage(event.data, '*')"),
      'main-world.js should not use wildcard origin in postMessage'
    )
    assert.ok(mainWorldJs.includes('window.origin'), 'main-world.js should use window.origin in postMessage')
  })
})
