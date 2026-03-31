const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert')

// Mock chrome global before requiring the background script
global.chrome = {
  tabs: {
    sendMessage: async () => {},
    query: async () => []
  },
  scripting: {
    executeScript: async () => {}
  },
  runtime: {
    getPlatformInfo: () => {},
    onMessage: {
      addListener: () => {}
    }
  },
  storage: {
    session: {
      get: async () => ({}),
      set: async () => {}
    },
    sync: {
      get: async () => ({})
    }
  }
}

const { sendToTab } = require('../background.js')

describe('sendToTab', () => {
  let sendMessageCalls = []
  let executeScriptCalls = []

  beforeEach(() => {
    sendMessageCalls = []
    executeScriptCalls = []

    global.chrome.tabs.sendMessage = async (tabId, message) => {
      sendMessageCalls.push({ tabId, message })
    }

    global.chrome.scripting.executeScript = async (options) => {
      executeScriptCalls.push(options)
    }
  })

  test('succeeds on first try without injecting content script', async () => {
    global.chrome.tabs.sendMessage = async (tabId, message) => {
      sendMessageCalls.push({ tabId, message })
      return { success: true }
    }

    const result = await sendToTab(1, { action: 'TEST' })

    assert.deepStrictEqual(result, { success: true })
    assert.strictEqual(sendMessageCalls.length, 1)
    assert.strictEqual(executeScriptCalls.length, 0)
  })

  test('injects content script on first failure and succeeds on retry', async () => {
    let callCount = 0
    global.chrome.tabs.sendMessage = async (tabId, message) => {
      sendMessageCalls.push({ tabId, message })
      callCount++

      if (callCount === 1) {
        // First try fails
        throw new Error('Could not establish connection')
      } else if (callCount === 2) {
        // PING in ensureContentScript fails
        if (message.action === 'PING') {
          throw new Error('Content script not injected yet')
        }
      } else if (callCount === 3) {
        // Retry of original message succeeds
        return { success: true }
      }
    }

    const originalSetTimeout = global.setTimeout
    global.setTimeout = (cb) => originalSetTimeout(cb, 10)

    try {
      const result = await sendToTab(2, { action: 'TEST' }, 3)

      assert.deepStrictEqual(result, { success: true })
      assert.strictEqual(sendMessageCalls.length, 3)
      assert.strictEqual(sendMessageCalls[0].message.action, 'TEST')
      assert.strictEqual(sendMessageCalls[1].message.action, 'PING')
      assert.strictEqual(sendMessageCalls[2].message.action, 'TEST')

      assert.strictEqual(executeScriptCalls.length, 1)
      assert.deepStrictEqual(executeScriptCalls[0], {
        target: { tabId: 2 },
        files: ['content.js']
      })
    } finally {
      global.setTimeout = originalSetTimeout
    }
  })

  test('retries on subsequent failures and eventually succeeds', async () => {
    let callCount = 0

    global.chrome.tabs.sendMessage = async (tabId, message) => {
      sendMessageCalls.push({ tabId, message })
      callCount++

      if (callCount === 1) {
        throw new Error('First try failed')
      } else if (callCount === 2) {
        if (message.action === 'PING') return true
      } else if (callCount === 3) {
        throw new Error('Retry after ensure failed')
      } else if (callCount === 4) {
        throw new Error('Next iteration failed')
      } else if (callCount === 5) {
        return { success: true }
      }
    }

    const originalSetTimeout = global.setTimeout
    global.setTimeout = (cb) => originalSetTimeout(cb, 10)

    try {
      const result = await sendToTab(3, { action: 'TEST' }, 4)
      assert.deepStrictEqual(result, { success: true })

      assert.strictEqual(sendMessageCalls.length, 5)
      assert.strictEqual(sendMessageCalls[0].message.action, 'TEST')
      assert.strictEqual(sendMessageCalls[1].message.action, 'PING')
      assert.strictEqual(sendMessageCalls[2].message.action, 'TEST')
      assert.strictEqual(sendMessageCalls[3].message.action, 'TEST')
      assert.strictEqual(sendMessageCalls[4].message.action, 'TEST')

      assert.strictEqual(executeScriptCalls.length, 0)
    } finally {
      global.setTimeout = originalSetTimeout
    }
  })

  test('throws error when all retries fail', async () => {
    global.chrome.tabs.sendMessage = async (tabId, message) => {
      sendMessageCalls.push({ tabId, message })
      if (message.action === 'PING') {
        return true
      }
      throw new Error('Permanent failure')
    }

    const originalSetTimeout = global.setTimeout
    global.setTimeout = (cb) => originalSetTimeout(cb, 10)

    try {
      await assert.rejects(async () => await sendToTab(4, { action: 'TEST' }, 3), { message: 'Permanent failure' })

      assert.strictEqual(sendMessageCalls.length, 5)
      assert.strictEqual(executeScriptCalls.length, 0)
    } finally {
      global.setTimeout = originalSetTimeout
    }
  })

  test('handles failure inside ensureContentScript gracefully', async () => {
    let callCount = 0

    global.chrome.tabs.sendMessage = async (tabId, message) => {
      sendMessageCalls.push({ tabId, message })
      callCount++

      if (callCount === 1) {
        throw new Error('Initial fail')
      } else if (callCount === 2) {
        throw new Error('PING fail')
      } else if (callCount === 3) {
        // wait, ensureContentScript calls PING, fails, calls executeScript, then falls through
        // but there is no callCount 3 from sendMessage inside ensureContentScript's catch block!
        // The catch block in sendToTab has:
        /*
        try {
          await ensureContentScript(tabId)
          return await chrome.tabs.sendMessage(tabId, message) // THIS is callCount 3
        } catch {
          // Fall through to retry loop
        }
        */
        // If ensureContentScript throws, the `chrome.tabs.sendMessage` right after it is SKIPPED.
        // And we fall through to the outer retry loop!
        // So callCount 3 is the NEXT iteration of the outer loop!
        return { success: true }
      }
    }

    global.chrome.scripting.executeScript = async () => {
      throw new Error('Injection failed')
    }

    const originalSetTimeout = global.setTimeout
    global.setTimeout = (cb) => originalSetTimeout(cb, 10)

    try {
      const result = await sendToTab(5, { action: 'TEST' }, 3)
      assert.deepStrictEqual(result, { success: true })

      assert.strictEqual(sendMessageCalls.length, 3)
      assert.strictEqual(sendMessageCalls[0].message.action, 'TEST') // i=0
      assert.strictEqual(sendMessageCalls[1].message.action, 'PING') // inside ensure
      // inside ensure executeScript throws -> ensure throws -> inner catch catches -> falls to i=1
      assert.strictEqual(sendMessageCalls[2].message.action, 'TEST') // i=1
    } finally {
      global.setTimeout = originalSetTimeout
    }
  })
})
