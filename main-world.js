/**
 * Jules Task Archiver — MAIN World Script
 *
 * Runs in the page's MAIN world (not isolated).
 * Reads WIZ_global_data tokens and installs a fetch observer
 * for StartSuggestion (Rja83d) config capture.
 *
 * Communicates with content.js (isolated world) via window.postMessage.
 */

// Extract config and post to isolated world
function broadcastConfig() {
  const w = window.WIZ_global_data
  const modelMatch = w?.TSDtV ? String(w.TSDtV).match(/beyond:models\/[\w-]+/) : null

  window.postMessage(
    {
      type: 'JULES_ARCHIVER_CONFIG',
      config: w
        ? {
            at: w.SNlM0e || null,
            bl: w.cfb2h || null,
            fsid: w.FdrFJe || null,
            modelId: modelMatch ? modelMatch[0] : null,
            timestamp: Date.now()
          }
        : null
    },
    window.origin
  )
}

// Install fetch observer for StartSuggestion config capture (once)
if (!window.__julesArchiver) {
  window.__julesArchiver = true

  const _origFetch = window.fetch
  window.fetch = async function (...args) {
    const [url, opts] = args
    const resp = await _origFetch.apply(this, args)
    if (typeof url === 'string' && url.includes('rpcids=Rja83d')) {
      try {
        const body = opts?.body || ''
        const params = new URLSearchParams(body)
        const freq = JSON.parse(params.get('f.req'))
        const payload = JSON.parse(freq[0][0][1])
        window.postMessage(
          {
            type: 'JULES_START_CONFIG',
            config: {
              modelConfig: payload[2],
              experimentIds: payload[9]?.[4] || [],
              featureFlags: payload[2]?.[10] || [],
              capturedAt: Date.now()
            }
          },
          window.origin
        )
      } catch (_e) {
        /* ignore parse errors */
      }
    }
    return resp
  }
}

// Broadcast config immediately (WIZ_global_data should be ready by document_idle)
broadcastConfig()

// Also listen for explicit re-extract requests from content.js
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.origin !== window.origin) return
  if (event.data?.type === 'JULES_REQUEST_CONFIG') {
    broadcastConfig()
  }
})
