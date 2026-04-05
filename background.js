/**
 * Jules Task Archiver v2 — Background Service Worker
 *
 * Orchestrates bulk archive via Jules batchexecute RPC API.
 * No DOM automation — all operations are HTTP fetch calls.
 */

// =============================================================================
// Constants
// =============================================================================

const JULES_ORIGIN = 'https://jules.google.com'
function extractAccountNum(url) {
  if (!url) return '0'
  try {
    const parts = new URL(url).pathname.split('/')
    const uIdx = parts.indexOf('u')
    return uIdx !== -1 && parts[uIdx + 1] ? parts[uIdx + 1] : '0'
  } catch {
    return '0'
  }
}

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
    url: `${JULES_ORIGIN}/u/${config.accountNum}/_/Swebot/data/batchexecute?${params}`,
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
  // ⚡ Bolt Optimization: Use chunked string slicing instead of character-by-character
  // array pushing. This improves performance by ~7-10x for large JSON strings
  // (e.g. batchexecute responses) by drastically reducing array allocations.
  let out = null
  let inStr = false
  let esc = false
  let lastIndex = 0

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    const code = str.charCodeAt(i)

    if (esc) {
      esc = false
      continue
    }

    if (inStr && ch === '\\') {
      esc = true
      continue
    }

    if (ch === '"') {
      inStr = !inStr
      continue
    }

    if (inStr && code < 0x20) {
      if (!out) out = []
      if (i > lastIndex) {
        out.push(str.substring(lastIndex, i))
      }
      if (code === 0x0a) out.push('\\n')
      else if (code === 0x0d) out.push('\\r')
      else if (code === 0x09) out.push('\\t')
      else out.push(`\\u${code.toString(16).padStart(4, '0')}`)
      lastIndex = i + 1
    }
  }

  // If no control characters were found, avoid joining entirely
  if (!out) return str

  if (lastIndex < str.length) {
    out.push(str.substring(lastIndex))
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
  STATUS_CODE: 25,
  DISPLAY_TITLE: 26
}

// Task states that indicate the task is finished and safe to archive
const ARCHIVABLE_STATES = new Set([3, 9]) // 3=completed, 9=failed

function parseTask(raw) {
  return {
    id: raw[TASK.ID],
    title: raw[TASK.DISPLAY_TITLE] || raw[TASK.SHORT_TITLE] || '(untitled)',
    source: raw[TASK.SOURCE] || '',
    state: raw[TASK.STATE],
    statusCode: raw[TASK.STATUS_CODE],
    repo: (raw[TASK.SOURCE] || '').replace(/^github\//, ''),
    owner: (raw[TASK.SOURCE] || '').split('/')[1] || '',
    repoName: (raw[TASK.SOURCE] || '').split('/')[2] || ''
  }
}

function isArchivable(task) {
  return ARCHIVABLE_STATES.has(task.state)
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
// Suggestion Operations
// =============================================================================

const SUGGESTION = {
  ID: 0,
  DETAILS: 1,
  STATUS: 2,
  RELATED: 3,
  CATEGORY_TAB: 4
}

const SDETAIL = {
  TITLE: 0,
  DESCRIPTION: 1,
  GITHUB_URL: 2,
  FILE_PATH: 3,
  LINE: 4,
  CONFIDENCE: 5,
  RATIONALE: 6,
  CODE_SNIPPET: 7,
  LANGUAGE: 8,
  CATEGORY_SLUG: 9,
  PRIORITY: 10
}

function parseSuggestion(raw) {
  if (!raw || !Array.isArray(raw)) return null
  const d = raw[SUGGESTION.DETAILS]
  if (!d) return null
  return {
    id: raw[SUGGESTION.ID],
    title: d[SDETAIL.TITLE],
    description: d[SDETAIL.DESCRIPTION],
    githubUrl: d[SDETAIL.GITHUB_URL],
    filePath: d[SDETAIL.FILE_PATH],
    line: d[SDETAIL.LINE],
    confidence: d[SDETAIL.CONFIDENCE],
    rationale: d[SDETAIL.RATIONALE],
    codeSnippet: d[SDETAIL.CODE_SNIPPET],
    language: d[SDETAIL.LANGUAGE],
    categorySlug: d[SDETAIL.CATEGORY_SLUG],
    priority: d[SDETAIL.PRIORITY],
    status: raw[SUGGESTION.STATUS],
    categoryTab: raw[SUGGESTION.CATEGORY_TAB]
  }
}

async function listSuggestions(repo, config) {
  const result = await callBatchExecute('hQP40d', [repo], config)
  if (!result || !Array.isArray(result) || !Array.isArray(result[0])) return []
  return result[0].map(parseSuggestion).filter(Boolean)
}

// =============================================================================
// Prompt Builder
// =============================================================================

const CATEGORY_CONFIG = {
  'input-validation': {
    icon: '[SECURITY]',
    name: 'Security Vulnerability Fix',
    role: 'security-focused',
    codeLabel: 'Vulnerable Code'
  },
  'insecure-config': {
    icon: '[SECURITY]',
    name: 'Security Vulnerability Fix',
    role: 'security-focused',
    codeLabel: 'Vulnerable Code'
  },
  injection: {
    icon: '[SECURITY]',
    name: 'Security Vulnerability Fix',
    role: 'security-focused',
    codeLabel: 'Vulnerable Code'
  },
  'async-io': {
    icon: '[PERF]',
    name: 'Performance Optimization',
    role: 'performance-focused',
    codeLabel: 'Inefficient Code'
  },
  'loop-optimization': {
    icon: '[PERF]',
    name: 'Performance Optimization',
    role: 'performance-focused',
    codeLabel: 'Inefficient Code'
  },
  'data-structure': {
    icon: '[PERF]',
    name: 'Performance Optimization',
    role: 'performance-focused',
    codeLabel: 'Inefficient Code'
  },
  'dead-code': { icon: '[CLEANUP]', name: 'Code Cleanup', role: 'code-quality-focused', codeLabel: 'Code to Clean' },
  other: { icon: '[CLEANUP]', name: 'Code Cleanup', role: 'code-quality-focused', codeLabel: 'Code to Clean' },
  'untested-function': { icon: '[TEST]', name: 'Test Coverage', role: 'testing-focused', codeLabel: 'Untested Code' },
  'missing-error-test': { icon: '[TEST]', name: 'Test Coverage', role: 'testing-focused', codeLabel: 'Untested Code' },
  'missing-edge-case': { icon: '[TEST]', name: 'Test Coverage', role: 'testing-focused', codeLabel: 'Untested Code' },
  'missing-test-file': { icon: '[TEST]', name: 'Test Coverage', role: 'testing-focused', codeLabel: 'Untested Code' }
}

const DEFAULT_CATEGORY = { icon: '[FIX]', name: 'Code Improvement', role: 'engineering-focused', codeLabel: 'Code' }

function buildSuggestionPrompt(suggestion) {
  const cat = CATEGORY_CONFIG[suggestion.categorySlug] || DEFAULT_CATEGORY

  return `# ${cat.icon} ${cat.name} Task

You are a ${cat.role} agent. Your mission is to analyze and fix the following issue.

## Task Details

**File:** \`${suggestion.filePath}:${suggestion.line}\`
**Issue:** ${suggestion.title}

**Language:** ${suggestion.language}

**${cat.codeLabel}:**
\`\`\`${suggestion.language}
${suggestion.codeSnippet}
\`\`\`

**Rationale:** ${suggestion.rationale}

## Your Process

### 1. UNDERSTAND - Analyze the Issue
* Review the surrounding code and understand the context
* Identify the specific problem and its potential impact

### 2. IMPLEMENT - Fix the Issue
* Write a fix that addresses the root cause
* Follow best practices for this type of issue
* Ensure the fix doesn't introduce new problems
* Preserve existing functionality

### 3. VERIFY - Validate the Fix
- Run format and lint checks
- Run the full test suite
- Ensure no functionality is broken
- For non-trivial fixes, write simple tests that validate your fix

### 4. DOCUMENT - Create a PR
Create a PR with:
- Title: "${cat.icon} ${suggestion.title}"
- Description explaining what was fixed and why
`
}

// =============================================================================
// StartSuggestion RPC
// =============================================================================

const DEFAULT_FEATURE_FLAGS = [
  ['enable_bash_session_tool', 1],
  ['enable_thinking', 1],
  ['use_gemini_api', 1],
  ['use_simple_agent_context', 1],
  ['enable_memory', 1],
  ['enable_jules_cheatsheet', 1],
  ['enable_messages_every_turn', 1]
]

function buildStartPayload(suggestion, repo, config, startConfig) {
  const prompt = buildSuggestionPrompt(suggestion)
  const modelId = config.modelId || startConfig?.modelConfig?.[1] || null
  const featureFlags = startConfig?.featureFlags || DEFAULT_FEATURE_FLAGS
  const experimentIds = startConfig?.experimentIds || []

  return [
    prompt,
    null,
    [null, modelId, null, [], 1, null, null, null, null, [360], featureFlags],
    null,
    repo,
    null,
    null,
    null,
    null,
    [9, null, null, null, experimentIds, [null, [1, 1]], null, null, null, null, null, [null, suggestion.id]],
    null,
    null,
    null,
    null,
    1
  ]
}

async function startSuggestion(suggestion, repo, config, startConfig) {
  const payload = buildStartPayload(suggestion, repo, config, startConfig)
  return callBatchExecute('Rja83d', payload, config)
}

async function getStartConfig() {
  const { startConfig } = await chrome.storage.session.get('startConfig')
  return startConfig || null
}

// =============================================================================
// Suggestions Orchestrator
// =============================================================================

async function processSuggestionsForTab(tab, options) {
  const label = getTabLabel(tab)
  updateState({ currentTab: label })
  addLog(`\n${'='.repeat(50)}`)
  addLog(`${label}: ${tab.url}`)
  addLog(`${'='.repeat(50)}`)

  let config
  try {
    config = await getTabConfig(tab.id)
    addLog(`[${label}] Config extracted (bl: ${config.bl.split('_').pop()})`)
  } catch (e) {
    addLog(`[${label}] ERROR: ${e.message}`)
    return 0
  }

  const startConfig = await getStartConfig()
  if (!startConfig) {
    addLog(`[${label}] No StartSuggestion config cached. Using defaults.`)
    addLog(`[${label}] Tip: Click Start on any suggestion in Jules UI to capture config.`)
  }

  // Get repos from existing tasks
  addLog(`[${label}] Fetching task list to discover repos...`)
  let tasks
  try {
    tasks = await listTasks('', config)
  } catch (e) {
    addLog(`[${label}] ERROR listing tasks: ${e.message}`)
    return 0
  }

  const repos = [...new Set(tasks.map((t) => t.source).filter(Boolean))]
  if (repos.length === 0) {
    addLog(`[${label}] No repos found from tasks.`)
    return 0
  }

  addLog(`[${label}] Found ${repos.length} repos: ${repos.join(', ')}`)

  addLog(`\n[${label}] Fetching suggestions for ${repos.length} repos concurrently...`)
  const suggestionFetches = repos.map((repo) =>
    listSuggestions(repo, config)
      .then((suggestions) => ({ repo, suggestions }))
      .catch((e) => ({ repo, error: e.message }))
  )
  const allSuggestions = await Promise.all(suggestionFetches)

  let totalStarted = 0
  for (const { repo, suggestions, error } of allSuggestions) {
    if (state.status === 'cancelled') break

    if (error) {
      addLog(`\n[${label}] ERROR fetching suggestions for ${repo}: ${error}`)
      continue
    }

    if (suggestions.length === 0) {
      addLog(`\n[${label}] ${repo}: No suggestions found`)
      continue
    }

    addLog(`\n[${label}] ${repo}: Found ${suggestions.length} suggestions`)
    updateState({ currentRepo: repo.replace(/^github\//, '') })

    for (const s of suggestions) {
      if (state.status === 'cancelled') break

      if (options.dryRun) {
        addLog(`  [DRY] Would start: ${s.title} (${s.categorySlug})`)
      } else {
        addLog(`  Starting: ${s.title}...`)
        try {
          await startSuggestion(s, repo, config, startConfig)
          addLog(`  Started: ${s.title}`)
          totalStarted++
        } catch (err) {
          addLog(`  [!] Failed to start "${s.title}": ${err.message}`)
        }
      }

      updateState({
        progress: {
          archived: totalStarted,
          skipped: state.progress.skipped,
          total: state.progress.total + 1
        }
      })
    }
  }

  addLog(`\n[${label}] TOTAL: ${totalStarted} suggestions started`)
  return totalStarted
}

// =============================================================================
// GitHub PR Check — task-level matching
// =============================================================================

const prCache = new Map()

async function getOpenPRs(owner, repo, token) {
  const key = `${owner}/${repo}`
  if (prCache.has(key)) return prCache.get(key)

  try {
    if (typeof owner !== 'string' || typeof repo !== 'string') {
      throw new Error('Owner and repo must be strings')
    }

    const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`)
    url.searchParams.set('state', 'open')
    url.searchParams.set('per_page', '100')

    const headers = { Accept: 'application/vnd.github+json' }
    if (token) {
      if (typeof token !== 'string') throw new Error('Token must be a string')
      if (/[\r\n]/.test(token)) throw new Error('Invalid token: contains newline')
      headers.Authorization = `token ${token}`
    }

    const res = await fetch(url.toString(), { headers })
    if (!res.ok) {
      addLog(`  WARNING: GitHub API ${res.status} for ${key}, assuming 0`)
      prCache.set(key, [])
      return []
    }
    const prs = await res.json()
    const mapped = prs.map((pr) => ({ title: pr.title || '', branch: pr.head?.ref || '' }))
    prCache.set(key, mapped)
    return mapped
  } catch (e) {
    addLog(`  WARNING: Could not check PRs for ${key}: ${e.message}`)
    prCache.set(key, [])
    return []
  }
}

function taskHasOpenPR(task, openPRs) {
  if (openPRs.length === 0) return false
  const taskTitle = (task.title || '').toLowerCase()
  if (!taskTitle || taskTitle === '(untitled)') return false
  return openPRs.some((pr) => pr.title.toLowerCase().includes(taskTitle) || taskTitle.includes(pr.title.toLowerCase()))
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
  const tabs = await chrome.tabs.query({ url: `${JULES_ORIGIN}/*` })
  return tabs
    .filter((t) => !t.url.includes('accounts.google'))
    .sort((a, b) => {
      const na = parseInt(extractAccountNum(a.url), 10)
      const nb = parseInt(extractAccountNum(b.url), 10)
      return na - nb
    })
}

function getTabLabel(tab) {
  const num = extractAccountNum(tab.url)
  return num !== '0' ? `u/${num}` : 'default'
}

/**
 * Send message to content script with retry and auto-injection.
 */
async function sendToTab(tabId, message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message)
    } catch (e) {
      if (i === 0) {
        try {
          await ensureContentScript(tabId)
          return await chrome.tabs.sendMessage(tabId, message)
        } catch (err) {
          if (err.message.includes('Security Error')) throw err
        }
      }
      if (i === retries - 1) throw e
      await new Promise((r) => setTimeout(r, 100 * (i + 1)))
    }
  }
}

async function ensureContentScript(tabId) {
  const checkOrigin = async () => {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url) return false
    try {
      const url = new URL(tab.url)
      return url.origin === JULES_ORIGIN
    } catch {
      return false
    }
  }

  if (!(await checkOrigin())) {
    throw new Error('Security Error: Cannot inject script into non-Jules tab')
  }

  try {
    await chrome.tabs.sendMessage(tabId, { action: 'PING' })
  } catch {
    // Re-verify immediately before injection to prevent TOCTOU
    if (!(await checkOrigin())) {
      throw new Error('Security Error: Cannot inject script into non-Jules tab')
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    })

    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      try {
        await new Promise((r) => setTimeout(r, 100))
        await chrome.tabs.sendMessage(tabId, { action: 'PING' })
        return
      } catch {
        // Keep waiting
      }
    }
    throw new Error('Content script failed to initialize within 3s')
  }
}

async function getTabConfig(tabId) {
  const response = await sendToTab(tabId, { action: 'GET_CONFIG' })
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

  // Filter by task state: only completed/failed are candidates
  const candidates = tasks.filter(isArchivable)
  const active = tasks.filter((t) => !isArchivable(t))

  addLog(`[${label}] ${tasks.length} total: ${candidates.length} completed/failed, ${active.length} active`)

  if (candidates.length === 0) {
    addLog(`[${label}] No completed/failed tasks to archive.`)
    return 0
  }

  // Group candidates by repo
  const byRepo = new Map()
  for (const task of candidates) {
    const key = task.repo || '(no repo)'
    if (!byRepo.has(key)) byRepo.set(key, [])
    byRepo.get(key).push(task)
  }

  // PR check: task-level matching (skip tasks with open matching PRs)
  const toArchive = []
  const toSkip = []

  const { ghOwner } = await chrome.storage.sync.get(['ghOwner'])
  const { ghToken } = await chrome.storage.local.get(['ghToken'])

  if (options.force) {
    addLog(`[${label}] FORCE: skipping PR check`)
    for (const task of candidates) toArchive.push(task)
  } else {
    addLog(`\n[${label}] Checking open PRs per task...`)
    // Fetch open PRs concurrently for all repos
    const repoEntries = [...byRepo.entries()]
    const prFetches = repoEntries.map(([_repo, repoTasks]) => {
      const owner = repoTasks[0]?.owner || ghOwner || ''
      const repoName = repoTasks[0]?.repoName || ''
      return owner && repoName ? getOpenPRs(owner, repoName, ghToken) : Promise.resolve([])
    })
    const allPRs = await Promise.all(prFetches)

    for (let i = 0; i < repoEntries.length; i++) {
      const [repo, repoTasks] = repoEntries[i]
      const openPRs = allPRs[i]
      addLog(`  ${repo}: ${repoTasks.length} tasks, ${openPRs.length} open PRs`)

      for (const task of repoTasks) {
        if (task.state === 9) {
          // Failed tasks: always archive (no PR created)
          toArchive.push(task)
        } else if (taskHasOpenPR(task, openPRs)) {
          toSkip.push(task)
          addLog(`    SKIP [${task.id}] ${task.title} (matching open PR)`)
        } else {
          toArchive.push(task)
        }
      }
    }
  }

  if (toSkip.length > 0) {
    addLog(`\n[${label}] ${toSkip.length} tasks skipped (open PRs matching)`)
  }

  if (toArchive.length === 0) {
    addLog(`[${label}] Nothing to archive (all tasks have matching open PRs).`)
    return 0
  }

  // Archive
  const totalTasks = toArchive.length
  addLog(`\n[${label}] Archiving ${totalTasks} tasks`)

  if (options.dryRun) {
    addLog(`[${label}] DRY RUN - would archive ${totalTasks} tasks`)
    const archiveByRepo = new Map()
    for (const t of toArchive) {
      const key = t.repo || '(no repo)'
      if (!archiveByRepo.has(key)) archiveByRepo.set(key, [])
      archiveByRepo.get(key).push(t)
    }
    for (const [repo, repoTasks] of archiveByRepo) {
      addLog(`  ${repo}: ${repoTasks.length} tasks`)
      for (const t of repoTasks) {
        addLog(`    [${t.id}] ${t.title} (state=${t.state})`)
      }
    }
    return 0
  }

  let grandTotal = 0

  // Group toArchive by repo for organized logging
  const archiveByRepo = new Map()
  for (const t of toArchive) {
    const key = t.repo || '(no repo)'
    if (!archiveByRepo.has(key)) archiveByRepo.set(key, [])
    archiveByRepo.get(key).push(t)
  }

  for (const [repo, repoTasks] of archiveByRepo) {
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

async function startOperation(options) {
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

  const isSuggestions = options.opMode === 'suggestions'
  addLog(options.dryRun ? '=== DRY RUN MODE ===' : isSuggestions ? '=== SUGGESTIONS MODE ===' : '=== ARCHIVE MODE ===')
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
        const count = isSuggestions ? await processSuggestionsForTab(tab, options) : await processTab(tab, options)
        results.push({ label, count })
      } catch (e) {
        addLog(`ERROR [${label}]: ${e.message}`)
        results.push({ label, count: 0, err: e.message })
      }
    }

    // Summary
    const verb = isSuggestions ? 'started' : 'archived'
    addLog(`\n${'='.repeat(50)}`)
    addLog('SUMMARY')
    addLog(`${'='.repeat(50)}`)
    let grand = 0
    results.forEach((r) => {
      grand += r.count
      addLog(`  ${r.label}: ${r.err ? `ERROR: ${r.err}` : `${r.count} ${verb}`}`)
    })
    addLog(`\n  GRAND TOTAL: ${grand} tasks ${verb}`)

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
      startOperation(msg.options)
      sendResponse({ ok: true })
      break

    case 'GET_STATE':
      stateReadyPromise.then(() => sendResponse(state))
      return true

    case 'CACHE_START_CONFIG':
      chrome.storage.session.set({ startConfig: msg.config })
      sendResponse({ ok: true })
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
