/**
 * Jules Task Archiver — Content Script
 *
 * Extracts page config tokens from WIZ_global_data (MAIN world).
 * These tokens authenticate batchexecute RPC calls made by the background script.
 *
 * Also observes fetch() calls to capture StartSuggestion (Rja83d) config
 * (model config, experiment IDs, feature flags) for bulk suggestion starting.
 */

// Store config extracted from MAIN world
let cachedConfig = null

// Listen for config posted from MAIN world injection
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

// Inject a script into MAIN world to read WIZ_global_data + install fetch observer
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
        const modelMatch = w?.TSDtV ? String(w.TSDtV).match(/beyond:models\\/[\\w-]+/) : null

        window.postMessage({
          type: 'JULES_ARCHIVER_CONFIG',
          config: w ? {
            at: w.SNlM0e || null,
            bl: w.cfb2h || null,
            fsid: w.FdrFJe || null,
            modelId: modelMatch ? modelMatch[0] : null,
            timestamp: Date.now()
          } : null
        }, '*')

        // Install fetch observer once (idempotent via flag)
        if (!window.__julesArchiver) {
          window.__julesArchiver = true
          const _origFetch = window.fetch
          window.fetch = async function(url, opts) {
            const resp = await _origFetch.apply(this, arguments)
            if (typeof url === 'string' && url.includes('rpcids=Rja83d')) {
              try {
                const body = opts?.body || ''
                const params = new URLSearchParams(body)
                const freq = JSON.parse(params.get('f.req'))
                const payload = JSON.parse(freq[0][0][1])
                window.postMessage({
                  type: 'JULES_START_CONFIG',
                  config: {
                    modelConfig: payload[2],
                    experimentIds: payload[9]?.[4] || [],
                    featureFlags: payload[2]?.[10] || [],
                    capturedAt: Date.now()
                  }
                }, '*')
              } catch (_e) { /* ignore parse errors */ }
            }
            return resp
          }
        }
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
