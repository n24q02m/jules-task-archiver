/**
 * Jules Task Archiver — Content Script (Isolated World)
 *
 * Listens for config tokens posted by main-world.js via window.postMessage.
 * Relays StartSuggestion config to background service worker.
 * Handles chrome.runtime messages from background/popup.
 */

// Store config extracted from MAIN world
let cachedConfig = null

// Inject main-world.js into the page to access variables
function injectMainWorldScript() {
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('main-world.js')
  script.onload = () => script.remove()
  ;(document.head || document.documentElement).appendChild(script)
}
injectMainWorldScript()

// Reject messages that did not originate from this page's own window/origin.
// The MAIN world script and isolated world share the same window and origin,
// so anything failing these checks is a cross-origin/cross-frame spoof attempt.
function isTrustedMessage(event) {
  if (event.source !== window || event.origin !== window.location.origin) return false
  const type = event.data?.type
  if (typeof type !== 'string' || !type.startsWith('JULES_')) return false
  if (type.endsWith('_CONFIG') && type !== 'JULES_REQUEST_CONFIG' && !event.data?.config) return false
  return true
}

// Listen for messages from MAIN world script
window.addEventListener('message', (event) => {
  if (!isTrustedMessage(event)) return
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
    window.postMessage({ type: 'JULES_REQUEST_CONFIG' }, window.location.origin)

    function handler(event) {
      if (!isTrustedMessage(event)) return
      if (event.data?.type !== 'JULES_ARCHIVER_CONFIG') return
      window.removeEventListener('message', handler)
      clearTimeout(timeout)
      cachedConfig = event.data.config
      resolve(cachedConfig)
    }

    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve(cachedConfig)
    }, 2000)

    window.addEventListener('message', handler)
  })
}

// Detect account from URL
function getAccountNum() {
  try {
    // First try the robust DOM approach
    const el = document.querySelector('c-wiz[data-is-main-wiz]')
    if (el) {
      const authUser = el.getAttribute('data-auth-user')
      if (authUser) return authUser
    }
  } catch (_e) {
    // Ignore DOM errors
  }

  try {
    const parts = new URL(location.href).pathname.split('/')
    const uIdx = parts.indexOf('u')
    const val = uIdx !== -1 && parts[uIdx + 1] ? parts[uIdx + 1] : '0'
    return /^\d+$/.test(val) ? val : '0'
  } catch (_e) {
    return '0'
  }
}

function getAccountLabel() {
  const num = getAccountNum()
  return num !== '0' ? `u/${num}` : 'default'
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

// Exposure for testing
if (typeof globalThis !== 'undefined' && globalThis.TEST_MODE) {
  globalThis.test_cachedConfig = {
    get: () => cachedConfig,
    set: (v) => {
      cachedConfig = v
    }
  }
  globalThis.test_extractConfig = extractConfig
  globalThis.test_getAccountNum = getAccountNum
  globalThis.test_getAccountLabel = getAccountLabel
  globalThis.test_injectMainWorldScript = injectMainWorldScript
}
