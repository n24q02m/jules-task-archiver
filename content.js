/**
 * Jules Task Archiver — Content Script (Isolated World)
 *
 * Listens for config tokens posted by main-world.js via window.postMessage.
 * Relays StartSuggestion config to background service worker.
 * Handles chrome.runtime messages from background/popup.
 */

// Store config extracted from MAIN world
let cachedConfig = null

// Listen for messages from MAIN world script
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type === 'JULES_ARCHIVER_CONFIG') {
    cachedConfig = event.data.config
  }
  if (event.data?.type === 'JULES_START_CONFIG') {
    chrome.runtime.sendMessage({
      action: 'CACHE_START_CONFIG',
      config: event.data.config
    })
  }
})

// Request fresh config from MAIN world script
function extractConfig() {
  // If already cached and fresh (less than 5 min old), return it
  if (cachedConfig?.timestamp && Date.now() - cachedConfig.timestamp < 300000) {
    return Promise.resolve(cachedConfig)
  }

  return new Promise((resolve) => {
    // Ask main-world.js to re-broadcast config
    window.postMessage({ type: 'JULES_REQUEST_CONFIG' }, '*')

    const timeout = setTimeout(() => resolve(cachedConfig), 2000)
    const handler = (event) => {
      if (event.source !== window) return
      if (event.data?.type !== 'JULES_ARCHIVER_CONFIG') return
      window.removeEventListener('message', handler)
      clearTimeout(timeout)
      cachedConfig = event.data.config
      resolve(cachedConfig)
    }
    window.addEventListener('message', handler)
  })
}

// Detect account number from URL
function getAccountNum() {
  const m = location.href.match(/\/u\/(\d+)/)
  return m ? m[1] : '0'
}

function getAccountLabel() {
  const m = location.href.match(/\/u\/(\d+)/)
  return m ? `u/${m[1]}` : 'default'
}

// Message handler
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case 'PING':
      sendResponse({ ok: true, account: getAccountLabel() })
      break

    case 'GET_CONFIG':
      extractConfig().then((config) => {
        sendResponse({
          config,
          accountNum: getAccountNum(),
          account: getAccountLabel()
        })
      })
      return true // async response

    default:
      sendResponse({ error: 'Unknown action' })
  }
})
