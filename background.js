/**
 * Jules Task Archiver — Background Service Worker
 *
 * Orchestrates the archive workflow across Jules tabs.
 * Handles GitHub API calls and state management.
 */

// --- PR cache (in-memory, cleared each run) ---
const prCache = new Map()

// --- State (restored from storage on SW restart) ---
const DEFAULT_STATE = {
  status: 'idle',
  currentTab: '',
  currentRepo: '',
  progress: { archived: 0, skipped: 0, total: 0 },
  results: [],
  log: [],
  error: null
}

let state = { ...DEFAULT_STATE }

// Restore state from storage on SW startup
const stateReadyPromise = chrome.storage.session.get('archiveState').then((data) => {
  if (data.archiveState) {
    state = data.archiveState
    // If SW died mid-operation, mark as error so user knows
    if (state.status === 'running') {
      state.status = 'error'
      state.error = 'Operation interrupted (browser killed service worker)'
      state.log.push('\n[!] Service worker was terminated during operation.')
      chrome.storage.session.set({ archiveState: state })
    }
  }
})

function updateState(patch) {
  Object.assign(state, patch)
  chrome.storage.session.set({ archiveState: state })
}

function addLog(message) {
  state.log.push(message)
  updateState({})
}

// --- KeepAlive: prevent SW termination during active operations ---
// Chrome kills SW after ~30s idle. We ping ourselves to stay alive.
let keepAliveInterval = null

function startKeepAlive() {
  if (keepAliveInterval) return
  keepAliveInterval = setInterval(() => {
    // Any chrome API call resets the 30s idle timer
    chrome.runtime.getPlatformInfo()
  }, 25000)
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
  }
}

// --- GitHub API ---
async function getOpenPRCount(owner, repo, token) {
  const key = `${owner}/${repo}`
  if (prCache.has(key)) return prCache.get(key)

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`
    const headers = { Accept: 'application/vnd.github+json' }
    if (token) headers.Authorization = `token ${token}`

    const res = await fetch(url, { headers })
    if (!res.ok) {
      addLog(`  WARNING: GitHub API ${res.status} for ${key}, assuming 0`)
      prCache.set(key, 0)
      return 0
    }
    const prs = await res.json()
    prCache.set(key, prs.length)
    return prs.length
  } catch (e) {
    addLog(`  WARNING: Could not check PRs for ${key}: ${e.message}`)
    prCache.set(key, 0)
    return 0
  }
}

// --- Tab management ---
async function getJulesTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://jules.google.com/*' })
  return tabs
    .filter((t) => !t.url.includes('accounts.google'))
    .sort((a, b) => {
      const na = parseInt(a.url.match(/\/u\/(\d+)/)?.[1] || '0', 10)
      const nb = parseInt(b.url.match(/\/u\/(\d+)/)?.[1] || '0', 10)
      return na - nb
    })
}

function getTabLabel(tab) {
  const m = tab.url.match(/\/u\/(\d+)/)
  return m ? `u/${m[1]}` : 'default'
}

// --- Ensure content script is injected into a tab ---
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'PING' })
  } catch {
    // Content script not loaded — inject it programmatically
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    })
    // Wait for script to initialize
    await new Promise((r) => setTimeout(r, 500))
  }
}

// --- Send message to content script with retry ---
async function sendToTab(tabId, message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message)
    } catch (e) {
      if (i === 0) {
        // First failure: try injecting content script
        try {
          await ensureContentScript(tabId)
          return await chrome.tabs.sendMessage(tabId, message)
        } catch {
          // Fall through to retry loop
        }
      }
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000))
      } else {
        throw e
      }
    }
  }
}

// --- Process a single tab ---
async function processTab(tab, options) {
  const label = getTabLabel(tab)
  updateState({ currentTab: label })
  addLog(`\n${'='.repeat(50)}`)
  addLog(`${label}: ${tab.url}`)
  addLog(`${'='.repeat(50)}`)

  // Get repos with tasks (content script waits for sidebar to load)
  const response = await sendToTab(tab.id, { action: 'GET_REPOS' })
  const repos = response?.repos || []

  if (repos.length === 0) {
    addLog(`[${label}] No repos with tasks.`)
    return 0
  }

  addLog(`[${label}] Repos with tasks:`)
  for (const r of repos) {
    addLog(`  ${r.name}: ${r.tasks} tasks`)
  }

  // Check PRs and decide which repos to archive
  const { ghOwner } = await chrome.storage.sync.get(['ghOwner'])
  let { ghToken } = await chrome.storage.local.get(['ghToken'])

  // Migrate token from sync to local if it exists in sync
  if (!ghToken) {
    const syncData = await chrome.storage.sync.get(['ghToken'])
    if (syncData.ghToken) {
      ghToken = syncData.ghToken
      await chrome.storage.local.set({ ghToken })
      await chrome.storage.sync.remove('ghToken')
    }
  }

  addLog(`\n[${label}] Checking open PRs...`)
  const toArchive = []
  const toSkip = []

  for (const r of repos) {
    if (options.force) {
      toArchive.push(r)
      continue
    }
    const owner = r.owner || ghOwner || ''
    if (!owner) {
      addLog(`  ${r.repo}: no owner configured, skipping PR check -> ARCHIVE`)
      toArchive.push(r)
      continue
    }
    const count = await getOpenPRCount(owner, r.repo, ghToken)
    addLog(`  ${r.repo}: ${count} open PRs ${count === 0 ? '-> ARCHIVE' : '-> SKIP'}`)
    if (count === 0) {
      toArchive.push(r)
    } else {
      toSkip.push(r)
    }
  }

  if (toSkip.length > 0) {
    addLog(`\n[${label}] SKIPPING (has open PRs): ${toSkip.map((r) => `${r.name} (${r.tasks})`).join(', ')}`)
  }

  if (toArchive.length === 0) {
    addLog(`\n[${label}] Nothing to archive.`)
    return 0
  }

  // Archive each repo
  addLog(`\n[${label}] Archiving ${toArchive.length} repos: ${toArchive.map((r) => r.name).join(', ')}`)
  let grandTotal = 0

  for (const r of toArchive) {
    updateState({ currentRepo: r.repo })
    addLog(`\n[${label}] -> ${r.name} (${r.tasks} tasks)`)

    try {
      const result = await sendToTab(tab.id, {
        action: 'ARCHIVE_REPO',
        repo: r.repo,
        dryRun: options.dryRun
      })
      grandTotal += result?.archived || 0
    } catch (e) {
      addLog(`  ERROR archiving ${r.repo}: ${e.message}`)
    }
  }

  addLog(`\n[${label}] TOTAL: ${grandTotal} archived`)
  return grandTotal
}

// --- Main orchestration ---
async function startArchive(options) {
  prCache.clear()
  startKeepAlive()
  updateState({
    status: 'running',
    currentTab: '',
    currentRepo: '',
    progress: { archived: 0, skipped: 0, total: 0 },
    results: [],
    log: [],
    error: null
  })

  addLog(options.dryRun ? '=== DRY RUN MODE ===' : '=== ARCHIVE MODE ===')
  if (options.force) addLog('=== FORCE MODE (skip PR check) ===')

  try {
    let tabs = await getJulesTabs()

    if (options.scope === 'current' && options.activeTabId) {
      tabs = tabs.filter((t) => t.id === options.activeTabId)
    }

    if (tabs.length === 0) {
      addLog('No Jules tabs found. Open jules.google.com first.')
      updateState({ status: 'error', error: 'No Jules tabs found' })
      return
    }

    addLog(`Found ${tabs.length} Jules tab(s)\n`)

    const results = []
    for (const tab of tabs) {
      const label = getTabLabel(tab)
      try {
        const count = await processTab(tab, options)
        results.push({ label, count })
      } catch (e) {
        addLog(`ERROR [${label}]: ${e.message}`)
        results.push({ label, count: 0, err: e.message })
      }
    }

    // Summary
    addLog(`\n${'='.repeat(50)}`)
    addLog('SUMMARY')
    addLog(`${'='.repeat(50)}`)
    let grand = 0
    results.forEach((r) => {
      grand += r.count
      addLog(`  ${r.label}: ${r.err ? `ERROR: ${r.err}` : `${r.count} archived`}`)
    })
    addLog(`\n  GRAND TOTAL: ${grand} tasks archived`)

    updateState({ status: 'done', results })
  } catch (e) {
    addLog(`FATAL ERROR: ${e.message}`)
    updateState({ status: 'error', error: e.message })
  } finally {
    stopKeepAlive()
  }
}

// --- Message handlers ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case 'START':
      startArchive(msg.options)
      sendResponse({ ok: true })
      break

    case 'GET_STATE':
      // Wait for state restoration if SW just restarted
      stateReadyPromise.then(() => sendResponse(state))
      return true // async response

    case 'PROGRESS':
      // Relay from content script
      if (msg.data?.message) {
        addLog(msg.data.message)
      }
      if (msg.data?.archived !== undefined) {
        updateState({
          progress: {
            archived: msg.data.archived,
            skipped: msg.data.skipped,
            total: msg.data.total
          }
        })
      }
      break

    case 'RESET':
      prCache.clear()
      stopKeepAlive()
      state = { ...DEFAULT_STATE }
      chrome.storage.session.set({ archiveState: state })
      sendResponse({ ok: true })
      break

    default:
      break
  }
})
