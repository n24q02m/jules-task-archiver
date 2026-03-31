const fs = require('node:fs')

global.chrome = {
  tabs: {
    sendMessage: jest.fn()
  },
  scripting: {
    executeScript: jest.fn()
  },
  runtime: {
    getPlatformInfo: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  },
  storage: {
    session: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue()
    }
  }
}

const scriptContent = fs.readFileSync('./background.js', 'utf8')

// The original script doesn't export anything (it's a background service worker).
// We inject a mock setTimeout and extract the necessary functions.
const getFunctions = new Function(
  'setTimeout',
  `
  ${scriptContent}
  return { ensureContentScript, sendToTab };
`
)

let mockSetTimeout

describe('sendToTab error paths and retry logic', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSetTimeout = jest.fn((cb) => {
      cb()
      return 0
    })
  })

  const runTest = (testFn) => {
    const { ensureContentScript, sendToTab } = getFunctions(mockSetTimeout)
    return testFn(ensureContentScript, sendToTab)
  }

  test('successfully sends message on first try', () =>
    runTest(async (_ensureContentScript, sendToTab) => {
      chrome.tabs.sendMessage.mockResolvedValueOnce({ success: true })

      const result = await sendToTab(123, { test: 'message' })

      expect(result).toEqual({ success: true })
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1)
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, { test: 'message' })
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
      expect(mockSetTimeout).not.toHaveBeenCalled()
    }))

  test('first attempt fails, injects script, then succeeds', () =>
    runTest(async (_ensureContentScript, sendToTab) => {
      chrome.tabs.sendMessage
        .mockRejectedValueOnce(new Error('Receiving end does not exist')) // first try fails
        .mockRejectedValueOnce(new Error('PING fails')) // PING fails
        .mockResolvedValueOnce({ success: true }) // second try (in catch block) succeeds

      chrome.scripting.executeScript.mockResolvedValueOnce()

      const result = await sendToTab(123, { test: 'message' })

      expect(result).toEqual({ success: true })
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(3)
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
      expect(mockSetTimeout).toHaveBeenCalledTimes(1) // from ensureContentScript delay
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 500)
    }))

  test('first attempt fails, PING succeeds, then message succeeds', () =>
    runTest(async (_ensureContentScript, sendToTab) => {
      chrome.tabs.sendMessage
        .mockRejectedValueOnce(new Error('Temporary failure')) // first try fails
        .mockResolvedValueOnce({ action: 'PONG' }) // PING succeeds
        .mockResolvedValueOnce({ success: true }) // second try succeeds

      const result = await sendToTab(123, { test: 'message' })

      expect(result).toEqual({ success: true })
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(3)
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
      expect(mockSetTimeout).not.toHaveBeenCalled()
    }))

  test('fails again after injection and exhausts retries', () =>
    runTest(async (_ensureContentScript, sendToTab) => {
      const error = new Error('Persistent failure')
      chrome.tabs.sendMessage.mockRejectedValue(error)
      chrome.scripting.executeScript.mockResolvedValue()

      await expect(sendToTab(123, { test: 'message' })).rejects.toThrow('Persistent failure')

      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(5)
      // Calls:
      // 1. First attempt (fails)
      // 2. ensureContentScript PING (fails) -> triggers inject
      // 3. Second attempt in first iteration (fails)
      // 4. Retry iteration 1 (fails)
      // 5. Retry iteration 2 (fails) -> throws error
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
      expect(mockSetTimeout).toHaveBeenCalledTimes(3)
      // 1 from ensureContentScript, 2 from retry loop
      expect(mockSetTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 500)
      expect(mockSetTimeout).toHaveBeenNthCalledWith(2, expect.any(Function), 1000)
      expect(mockSetTimeout).toHaveBeenNthCalledWith(3, expect.any(Function), 1000)
    }))

  test('injection succeeds but subsequent message fails, continues retrying', () =>
    runTest(async (_ensureContentScript, sendToTab) => {
      const error = new Error('Temporary failure')
      chrome.tabs.sendMessage
        .mockRejectedValueOnce(error) // 1st try (fails)
        .mockResolvedValueOnce({ success: 'ping' }) // PING (succeeds, no injection)
        .mockRejectedValueOnce(error) // try again (fails)
        .mockResolvedValueOnce({ success: true }) // Retry 1 (succeeds)

      const result = await sendToTab(123, { test: 'message' })

      expect(result).toEqual({ success: true })
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(4)
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(0)
      expect(mockSetTimeout).toHaveBeenCalledTimes(1) // 1 from retry loop
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 1000)
    }))

  test('respects custom retry count', () =>
    runTest(async (_ensureContentScript, sendToTab) => {
      const error = new Error('Persistent failure')
      chrome.tabs.sendMessage.mockRejectedValue(error)
      chrome.scripting.executeScript.mockResolvedValue()

      // Try with 5 retries
      await expect(sendToTab(123, { test: 'message' }, 5)).rejects.toThrow('Persistent failure')

      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(7)
      // 1. First attempt
      // 2. PING
      // 3. Second attempt in first iteration
      // 4, 5, 6, 7. Retries 1, 2, 3, 4
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
      expect(mockSetTimeout).toHaveBeenCalledTimes(5) // 1 for ensureScript, 4 for retries
    }))

  test('ensureContentScript injects if ping fails', () =>
    runTest(async (ensureContentScript, _sendToTab) => {
      chrome.tabs.sendMessage.mockRejectedValueOnce(new Error('ping fails'))
      chrome.scripting.executeScript.mockResolvedValueOnce()

      await ensureContentScript(123)

      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1)
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, { action: 'PING' })
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 123 },
        files: ['content.js']
      })
      expect(mockSetTimeout).toHaveBeenCalledTimes(1)
    }))
})
