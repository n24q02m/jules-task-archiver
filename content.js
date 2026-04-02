/**
 * Jules Task Archiver — Content Script
 *
 * Extracts page config tokens from WIZ_global_data (MAIN world).
 * These tokens authenticate batchexecute RPC calls made by the background script.
 */

// Store config extracted from MAIN world
let cachedConfig = null

// Listen for config posted from MAIN world injection
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type !== 'JULES_ARCHIVER_CONFIG') return
  cachedConfig = event.data.config
})

// Inject a script into MAIN world to read WIZ_global_data
function extractConfig() {
  // If already cached and fresh (less than 5 min old), return it
  if (cachedConfig?.timestamp && Date.now() - cachedConfig.timestamp < 300000) {
    return Promise.resolve(cachedConfig)
  }

  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.textContent = `
      (() => {
        const w = window.WIZ_global_data
        window.postMessage({
          type: 'JULES_ARCHIVER_CONFIG',
          config: w ? {
            at: w.SNlM0e || null,
            bl: w.cfb2h || null,
            fsid: w.FdrFJe || null,
            timestamp: Date.now()
          } : null
        }, '*')
      })()
    `
    document.documentElement.appendChild(script)
    script.remove()

    // Wait for the message
    const timeout = setTimeout(() => resolve(null), 2000)
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
