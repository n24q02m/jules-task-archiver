/**
 * Jules Task Archiver — Content Script (Isolated World)
 *
 * Listens for config tokens posted by main-world.js via window.postMessage.
 * Relays StartSuggestion config to background service worker.
 * Handles chrome.runtime messages from background/popup.
 */

const JULES_ORIGIN = 'https://jules.google.com'

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
    window.postMessage({ type: 'JULES_REQUEST_CONFIG' }, JULES_ORIGIN)

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

// Detect account from URL
function extractAccountNum(url) {
  try {
    return new URL(url).pathname.split('/u/')[1]?.split('/')[0] || '0'
  } catch {
    return '0'
  }
}

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'GET_CONFIG') {
    extractConfig().then((config) => {
      sendResponse({
        config,
        accountNum: extractAccountNum(window.location.href)
      })
    })
    return true // async response
  }
})
