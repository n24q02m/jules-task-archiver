/**
 * Jules Task Archiver v2 — Background Service Worker
 *
 * Orchestrates bulk archive via Jules batchexecute RPC API.
 * No DOM automation — all operations are HTTP fetch calls.
 */

// =============================================================================
// batchexecute Client
// =============================================================================

let reqCounter = 100000

function buildBatchRequest(rpcId, payload, config) {
  const params = new URLSearchParams({
    rpcids: rpcId,
    bl: config.bl,
    'f.sid': config.fsid,
    _reqid: String(reqCounter++),
    rt: 'c'
  })

  const body = new URLSearchParams({
    'f.req': JSON.stringify([[[rpcId, JSON.stringify(payload), null, 'generic']]]),
    at: config.at
  })

  return {
    url: `https://jules.google.com/u/${config.accountNum}/_/Swebot/data/batchexecute?${params}`,
    body: body.toString()
  }
}

async function callBatchExecute(rpcId, payload, config) {
  const { url, body } = buildBatchRequest(rpcId, payload, config)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'x-same-domain': '1'
    },
    credentials: 'include',
    body
  })

  if (!res.ok) {
    throw new Error(`batchexecute ${rpcId} failed: HTTP ${res.status}`)
  }

  return parseResponse(await res.text(), rpcId)
}

// =============================================================================
// Response Parser
// =============================================================================

/**
 * Fix literal control characters (CR, LF) inside JSON string values.
 * batchexecute responses can contain raw newlines inside strings which is
 * invalid JSON. This state machine escapes them.
 */
function fixJsonControlChars(str) {
  const out = []
  let inStr = false
  let esc = false

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    const code = str.charCodeAt(i)

    if (esc) {
      out.push(ch)
      esc = false
      continue
    }

    if (inStr && ch === '\\') {
      out.push(ch)
      esc = true
      continue
    }

    if (ch === '"') {
      inStr = !inStr
      out.push(ch)
      continue
    }

    if (inStr && code < 0x20) {
      if (code === 0x0a) out.push('\\n')
      else if (code === 0x0d) out.push('\\r')
      else if (code === 0x09) out.push('\\t')
      else out.push(`\\u${code.toString(16).padStart(4, '0')}`)
      continue
    }

    out.push(ch)
  }

  return out.join('')
}

/**
 * Find the end of the outermost JSON array using bracket balancing.
 * Handles control chars inside strings by skipping them.
 */
function findJsonEnd(str) {
  let depth = 0
  let inStr = false
  let esc = false

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]

    if (esc) {
      esc = false
      continue
    }
    if (inStr) {
      if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '[') depth++
    if (ch === ']') {
      depth--
      if (depth === 0) return i + 1
    }
  }

  return -1
}

function parseResponse(text, rpcId) {
  // Strip XSS protection prefix: )]}'
  const cleaned = text.replace(/^\)\]\}'\s*/, '')

  // Skip byte-length line
  const firstNewline = cleaned.indexOf('\n')
  if (firstNewline === -1) throw new Error('Invalid batchexecute response')
  const data = cleaned.substring(firstNewline + 1)

  // Find valid JSON boundary
  const jsonEnd = findJsonEnd(data)
  if (jsonEnd === -1) throw new Error('Could not find JSON boundary in response')

  const jsonStr = data.substring(0, jsonEnd)
  const fixed = fixJsonControlChars(jsonStr)
  const outer = JSON.parse(fixed)

  // Find the entry matching our rpcId
  for (const entry of outer) {
    if (!Array.isArray(entry) || entry[1] !== rpcId) continue
    if (!entry[2]) return null
    const innerFixed = fixJsonControlChars(entry[2])
    return JSON.parse(innerFixed)
  }

  return null
}

// =============================================================================
// Task Operations
// =============================================================================

// Task field indices (from reverse-engineered response)
const TASK = {
  ID: 0,
  SHORT_TITLE: 1,
  SOURCE: 4,
  STATE: 5,
  CREATE_TIME: 6,
  UPDATE_TIME: 7,
  DISPLAY_TITLE: 26
}

function parseTask(raw) {
  return {
    id: raw[TASK.ID],
    title: raw[TASK.DISPLAY_TITLE] || raw[TASK.SHORT_TITLE] || '(untitled)',
    source: raw[TASK.SOURCE] || '',
    state: raw[TASK.STATE],
    repo: (raw[TASK.SOURCE] || '').replace(/^github\//, ''),
    owner: (raw[TASK.SOURCE] || '').split('/')[1] || '',
    repoName: (raw[TASK.SOURCE] || '').split('/')[2] || ''
  }
}

async function listTasks(filter, config) {
  const payload = [filter, 4]
  const result = await callBatchExecute('p1Takd', payload, config)
  if (!result?.[0]) return []
  return result[0].map(parseTask)
}

async function archiveTask(taskId, config) {
  await callBatchExecute('Tjmm5c', [[taskId], 1], config)
}

// =============================================================================
// GitHub PR Check (unchanged from v1)
// =============================================================================

const prCache = new Map()

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

// =============================================================================
// State Management (unchanged from v1)
// =============================================================================

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

const stateReadyPromise = chrome.storage.session.get('archiveState').then((data) => {
  if (data.archiveState) {
    state = data.archiveState
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

// =============================================================================
// KeepAlive (unchanged from v1)
// =============================================================================

let keepAliveInterval = null

function startKeepAlive() {
  if (keepAliveInterval) return
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo()
  }, 25000)
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
  }
}

// =============================================================================
// Tab Management
// =============================================================================

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

async function ensureContentScript(tabId) {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url?.startsWith('https://jules.google.com/')) {
    throw new Error('Security Error: Cannot inject script into non-Jules tab')
  }

  try {
    await chrome.tabs.sendMessage(tabId, { action: 'PING' })
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    })
    for (let i = 0; i < 10; i++) {
      try {
        await new Promise((r) => setTimeout(r, 50))
        await chrome.tabs.sendMessage(tabId, { action: 'PING' })
        break
      } catch {
        // Keep waiting
      }
    }
  }
}

async function getTabConfig(tabId) {
  await ensureContentScript(tabId)
  const response = await chrome.tabs.sendMessage(tabId, { action: 'GET_CONFIG' })
  if (!response?.config?.at) {
    throw new Error('Could not extract page config (XSRF token missing). Try refreshing the Jules tab.')
  }
  return {
    ...response.config,
    accountNum: response.accountNum
  }
}

// =============================================================================
// Orchestrator
// =============================================================================

async function processTab(tab, options) {
  const label = getTabLabel(tab)
  updateState({ currentTab: label })
  addLog(`\n${'='.repeat(50)}`)
  addLog(`${label}: ${tab.url}`)
  addLog(`${'='.repeat(50)}`)

  // Get page config (tokens for batchexecute)
  let config
  try {
    config = await getTabConfig(tab.id)
    addLog(`[${label}] Config extracted (bl: ${config.bl.split('_').pop()})`)
  } catch (e) {
    addLog(`[${label}] ERROR: ${e.message}`)
    return 0
  }

  // List all active tasks via API
  addLog(`[${label}] Fetching tasks via API...`)
  let tasks
  try {
    tasks = await listTasks('', config)
  } catch (e) {
    addLog(`[${label}] ERROR listing tasks: ${e.message}`)
    return 0
  }

  if (tasks.length === 0) {
    addLog(`[${label}] No tasks found.`)
    return 0
  }

  // Group tasks by repo
  const byRepo = new Map()
  for (const task of tasks) {
    const key = task.repo || '(no repo)'
    if (!byRepo.has(key)) byRepo.set(key, [])
    byRepo.get(key).push(task)
  }

  addLog(`[${label}] ${tasks.length} tasks across ${byRepo.size} repos:`)
  for (const [repo, repoTasks] of byRepo) {
    addLog(`  ${repo}: ${repoTasks.length} tasks`)
  }

  // Check PRs and decide which repos to archive
  const { ghOwner } = await chrome.storage.sync.get(['ghOwner'])
  let { ghToken } = await chrome.storage.local.get(['ghToken'])

  // Migrate token from sync to local if needed
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

  for (const [repo, repoTasks] of byRepo) {
    if (options.force) {
      toArchive.push({ repo, tasks: repoTasks })
      continue
    }

    const owner = repoTasks[0]?.owner || ghOwner || ''
    const repoName = repoTasks[0]?.repoName || ''
    if (!owner || !repoName) {
      addLog(`  ${repo}: no owner/repo, skipping PR check -> ARCHIVE`)
      toArchive.push({ repo, tasks: repoTasks })
      continue
    }

    const count = await getOpenPRCount(owner, repoName, ghToken)
    addLog(`  ${repo}: ${count} open PRs ${count === 0 ? '-> ARCHIVE' : '-> SKIP'}`)
    if (count === 0) {
      toArchive.push({ repo, tasks: repoTasks })
    } else {
      toSkip.push({ repo, tasks: repoTasks })
    }
  }

  if (toSkip.length > 0) {
    addLog(`\n[${label}] SKIPPING (has open PRs): ${toSkip.map((r) => `${r.repo} (${r.tasks.length})`).join(', ')}`)
  }

  if (toArchive.length === 0) {
    addLog(`\n[${label}] Nothing to archive.`)
    return 0
  }

  // Archive tasks
  const totalTasks = toArchive.reduce((sum, r) => sum + r.tasks.length, 0)
  addLog(`\n[${label}] Archiving ${totalTasks} tasks across ${toArchive.length} repos`)

  if (options.dryRun) {
    addLog(`[${label}] DRY RUN - would archive ${totalTasks} tasks`)
    for (const { repo, tasks: repoTasks } of toArchive) {
      addLog(`  ${repo}: ${repoTasks.length} tasks`)
      for (const t of repoTasks) {
        addLog(`    [${t.id}] ${t.title}`)
      }
    }
    return 0
  }

  let grandTotal = 0

  for (const { repo, tasks: repoTasks } of toArchive) {
    updateState({ currentRepo: repo })
    addLog(`\n[${label}] -> ${repo} (${repoTasks.length} tasks)`)

    for (const task of repoTasks) {
      try {
        await archiveTask(task.id, config)
        grandTotal++
        addLog(`  Archived: [${task.id}] ${task.title}`)

        updateState({
          progress: {
            archived: state.progress.archived + 1,
            skipped: state.progress.skipped,
            total: totalTasks
          }
        })
      } catch (e) {
        addLog(`  ERROR archiving ${task.id}: ${e.message}`)
      }
    }
  }

  addLog(`\n[${label}] TOTAL: ${grandTotal} archived`)
  return grandTotal
}

async function startArchive(options) {
  prCache.clear()
  reqCounter = Math.floor(Math.random() * 900000) + 100000
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
  addLog('=== v2: batchexecute API ===')

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

// =============================================================================
// Message Handlers
// =============================================================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case 'START':
      startArchive(msg.options)
      sendResponse({ ok: true })
      break

    case 'GET_STATE':
      stateReadyPromise.then(() => sendResponse(state))
      return true

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
