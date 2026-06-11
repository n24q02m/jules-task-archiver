importScripts('utils.js')
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

// Max number of in-flight network operations. Caps fan-out so a tab with many
// repos/tasks does not fire hundreds of simultaneous fetches at once.
const API_CONCURRENCY = 5

// Archive fan-out. Accounts (tabs) are processed in parallel; each account
// drains its own pool, while a shared global limiter caps the TOTAL in-flight
// archive requests across all accounts so parallel work cannot overwhelm Jules
// (which rate-limits with HTTP 429). Retries with backoff absorb the rest.
const PER_ACCOUNT_CONCURRENCY = 6
const GLOBAL_CONCURRENCY = 12

// ⚡ Bolt Optimization: After parsing the URL, use a fast regex test to extract
// the account ID instead of allocating string arrays via `.split('/')`. This avoids
// object allocation overhead while preserving the original strict URL validation.
const ACCOUNT_NUM_REGEX = /\/u\/(\d+)(?:\/|$)/
function extractAccountNum(url) {
  try {
    const pathname = new URL(url).pathname
    const match = ACCOUNT_NUM_REGEX.exec(pathname)
    return match ? match[1] : '0'
  } catch (_e) {
    return '0'
  }
}

// =============================================================================
// Network Utilities
// =============================================================================

/**
 * Standard fetch wrapper with error handling and token injection.
 */
async function jFetch(url, options = {}) {
  const urlObj = new URL(url)
  const origin = urlObj.origin
  if (origin !== JULES_ORIGIN && origin !== 'https://api.github.com') {
    throw new Error('Security Error: Disallowed fetch origin')
  }

  const { token, headers = {}, ...rest } = options

  if (token) {
    if (origin !== 'https://api.github.com') {
      throw new Error('Security Error: Refusing to send GitHub token to non-GitHub origin')
    }
    if (typeof token !== 'string') throw new Error('Token must be a string')
    if (/[\r\n]/.test(token)) throw new Error('Invalid token: contains newline')
    headers.Authorization = `token ${token}`
  }

  const res = await fetch(url, { headers, ...rest })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res
}

/**
 * Run `worker` over every item with at most `limit` tasks in flight at once.
 * Results are returned in input order. Unlike `Promise.all(items.map(...))`,
 * this bounds concurrency so large fan-outs cannot overwhelm the network.
 */
async function runInPool(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0

  async function drain() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }

  const poolSize = items.length > 0 ? Math.max(1, Math.min(Math.floor(limit) || 1, items.length)) : 0
  const pool = []
  for (let i = 0; i < poolSize; i++) {
    pool.push(drain())
  }
  await Promise.all(pool)
  return results
}

/**
 * A shared concurrency gate. `limit(fn)` runs `fn` once a slot is free and
 * resolves with its result. Unlike `runInPool` (a one-shot pool over a fixed
 * list), this is a long-lived limiter many independent callers funnel through —
 * used to cap TOTAL in-flight archive requests while accounts run in parallel.
 */
function createLimiter(max) {
  let active = 0
  const queue = []

  function next() {
    if (active >= max || queue.length === 0) return
    active++
    const { fn, resolve, reject } = queue.shift()
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--
        next()
      })
  }

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      next()
    })
}

const globalLimit = createLimiter(GLOBAL_CONCURRENCY)

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
  try {
    const res = await jFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'x-same-domain': '1'
      },
      credentials: 'include',
      body
    })
    return parseResponse(await res.text(), rpcId)
  } catch (e) {
    throw new Error(`batchexecute ${rpcId} failed: ${e.message}`)
  }
}

// =============================================================================
// Response Parser
// =============================================================================

/**
 * Find the end of the outermost JSON array using bracket balancing.
 * Handles control chars inside strings by skipping them.
 *
 * `startPos` lets callers scan a slice of a larger string without first
 * allocating a substring copy — important for multi-MB batchexecute payloads.
 * The returned index is absolute (relative to the start of `str`).
 */
function findJsonEnd(str, startPos = 0) {
  if (!str) return -1
  // ⚡ Bolt Optimization: Use String.prototype.indexOf('"') to fast-forward
  // through string literals instead of character-by-character iteration.
  // This avoids huge JS overhead for large string payloads.
  let depth = 0
  const len = str.length
  for (let i = startPos; i < len; i++) {
    const code = str.charCodeAt(i)
    if (code === 34) {
      // '"'
      while (true) {
        i = str.indexOf('"', i + 1)
        if (i === -1) return -1
        let count = 0
        while (i - 1 - count >= 0 && str.charCodeAt(i - 1 - count) === 92) {
          count++
        }
        if (count % 2 === 0) break
      }
    } else if (code === 91 || code === 123) {
      // '[', '{'
      depth++
    } else if (code === 93 || code === 125) {
      // ']', '}'
      depth--
      if (depth === 0) return i + 1
    }
  }

  return -1
}

function parseResponse(text, rpcId) {
  // Strip XSS protection prefix: )]}'
  let pos = 0
  if (text.startsWith(")]}'")) {
    pos = 4
  }
  // Skip leading whitespace
  while (pos < text.length) {
    const code = text.charCodeAt(pos)
    if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
      pos++
    } else {
      break
    }
  }

  // Skip byte-length line
  const firstNewline = text.indexOf('\n', pos)
  if (firstNewline === -1) throw new Error('Invalid batchexecute response')
  const dataStart = firstNewline + 1

  // ⚡ Bolt Optimization: Scan for the JSON boundary directly in `text` using an
  // offset instead of allocating a `data` substring copy of the whole payload.
  const jsonEnd = findJsonEnd(text, dataStart)
  if (jsonEnd === -1) throw new Error('Could not find JSON boundary in response')

  const jsonStr = text.substring(dataStart, jsonEnd)
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

// Task states that indicate the task is finished and safe to archive.
// Verified 2026-06-04 against 725 real tasks from the live batchexecute API:
// finished tasks settle into states 2, 4, 12, or null. Any OTHER state is
// treated as still-active and left untouched in the default flow (Force
// archives regardless). Keeping this an allowlist means an unknown/new state
// is protected by default rather than silently archived.
const ARCHIVABLE_STATES = new Set([2, 4, 12])

// Source (connected repo) row layout from YqkSHd.
// [5] is a per-repo Suggestions block: [bool, bool, [TOGGLE], [bool]] where
// TOGGLE === 2 means the repo's Suggestions toggle is ON, 1/absent means OFF.
// This mirrors the e4motb write RPC (payload [2]=enable, [1]=disable) and was
// verified 2026-06-04 against Jules' own "X / 5 repo max" counter (UTrvy) across
// all 5 accounts: the enabled-repo count matched UTrvy exactly every time.
const SOURCE = {
  ID: 0,
  SUGGESTION_BLOCK: 5
}
const SUGGESTION_TOGGLE_ON = 2

// A Jules account may enable Suggestions on at most 5 repos. The extension must
// only start suggestions on those, never on every connected source.
function isSuggestionEnabled(row) {
  const block = row?.[SOURCE.SUGGESTION_BLOCK]
  return Array.isArray(block) && Array.isArray(block[2]) && block[2][0] === SUGGESTION_TOGGLE_ON
}

function parseTask(raw) {
  const source = raw[TASK.SOURCE] || ''

  // ⚡ Bolt Optimization: Use indexOf and substring instead of .split('/') to extract
  // owner and repoName. This prevents allocating string arrays for every task,
  // reducing GC pressure when parsing payloads with thousands of tasks.
  let owner = ''
  let repoName = ''
  const isGithub = source.startsWith('github/')

  if (isGithub) {
    const firstSlash = 6 // index of slash in 'github/'
    const secondSlash = source.indexOf('/', firstSlash + 1)
    if (secondSlash !== -1) {
      owner = source.substring(firstSlash + 1, secondSlash)
      const thirdSlash = source.indexOf('/', secondSlash + 1)
      repoName = thirdSlash !== -1 ? source.substring(secondSlash + 1, thirdSlash) : source.substring(secondSlash + 1)
    }
  } else {
    // Fallback for non-github sources if they ever occur
    const parts = source.split('/')
    owner = parts[1] || ''
    repoName = parts[2] || ''
  }

  return {
    id: raw[TASK.ID],
    title: raw[TASK.DISPLAY_TITLE] || raw[TASK.SHORT_TITLE] || '(untitled)',
    source,
    state: raw[TASK.STATE],
    statusCode: raw[TASK.STATUS_CODE],
    repo: isGithub ? source.slice(7) : source,
    owner,
    repoName
  }
}

function isArchivable(task) {
  // A null/undefined state is emitted for one class of completed tasks.
  return task.state == null || ARCHIVABLE_STATES.has(task.state)
}
function groupTasksByRepo(tasks) {
  const map = new Map()
  for (const t of tasks) {
    const key = t.repo || '(no repo)'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(t)
  }
  return map
}

async function listTasks(filter, config) {
  const payload = [filter, 4]
  const result = await callBatchExecute('p1Takd', payload, config)
  if (!result?.[0]) return []
  return result[0].map(parseTask)
}

async function safeListTasks(label, config) {
  try {
    const tasks = await listTasks('', config)
    if (tasks.length === 0) {
      addLog(`[${label}] No tasks found.`)
      return null
    }
    return tasks
  } catch (e) {
    addLog(`[${label}] ERROR listing tasks: ${e.message}`)
    return null
  }
}

async function archiveTask(taskId, config) {
  const payload = new Array(2).fill(null)
  payload[TJMM5C.TASK_IDS] = [taskId]
  payload[TJMM5C.ACTION] = 1
  await callBatchExecute('Tjmm5c', payload, config)
}

const RETRY_ATTEMPTS = 4
const RETRY_BASE_MS = 400

// Higher concurrency makes Jules more likely to answer 429 (rate limit) or a
// transient 5xx. Rather than dropping those tasks, back off and retry so a fast
// run degrades gracefully instead of failing.
function isRetryable(message) {
  return /HTTP 429|HTTP 5\d\d|Failed to fetch|NetworkError/i.test(message || '')
}

async function withRetry(fn) {
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt === RETRY_ATTEMPTS - 1 || !isRetryable(e.message)) throw e
      const delay = RETRY_BASE_MS * 2 ** attempt + Math.random() * 200
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

function archiveTaskWithRetry(taskId, config) {
  return withRetry(() => archiveTask(taskId, config))
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

// Start Suggestion payload layout (Rja83d)
const RJA83D = {
  PROMPT: 0,
  MODEL_CONFIG: 2,
  REPO: 4,
  METADATA: 9,
  START_FLAG: 14
}

// Model Config array layout (used in Rja83d payload [2])
const MCONFIG = {
  MODEL_ID: 1,
  FEATURE_FLAGS: 10
}

// Suggestion Metadata array layout (used in Rja83d payload [9])
const SMETA = {
  EXPERIMENT_IDS: 4,
  SUGGESTION_ID_WRAPPER: 11,
  STATUS_FLAGS: 5
}

// Archive Task payload layout (Tjmm5c)
const TJMM5C = {
  TASK_IDS: 0,
  ACTION: 1
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

  // ⚡ Bolt Optimization: Use a standard for loop instead of `.reduce()` to
  // avoid function call overhead per element and intermediate closure allocation.
  const arr = result[0]
  const parsedSuggestions = []
  for (let i = 0; i < arr.length; i++) {
    const parsed = parseSuggestion(arr[i])
    if (parsed) parsedSuggestions.push(parsed)
  }
  return parsedSuggestions
}

// List the repos that have the Jules Suggestions toggle ENABLED for this account.
// Response shape (YqkSHd): result[0] is an array of source rows whose [0] is the
// "github/owner/repo" id and whose [5] block encodes the per-repo toggle.
// Returning every connected source (not just enabled ones) is what caused the
// extension to start hundreds of unwanted suggestion tasks across all repos.
async function listSuggestionEnabledSources(config) {
  const result = await callBatchExecute('YqkSHd', [null, 'source_status=SOURCE_STATUS_ACTIVE'], config)
  if (!result?.[0]) return []

  // ⚡ Bolt Optimization: Replace `.filter().map()` chain with a single
  // standard for loop to avoid intermediate array allocations.
  const arr = result[0]
  const sources = []
  for (let i = 0; i < arr.length; i++) {
    const row = arr[i]
    if (isSuggestionEnabled(row) && typeof row?.[SOURCE.ID] === 'string' && row[SOURCE.ID].startsWith('github/')) {
      sources.push(row[SOURCE.ID])
    }
  }
  return sources
}

async function safeListSources(label, config) {
  try {
    const repos = await listSuggestionEnabledSources(config)
    if (repos.length === 0) {
      addLog(`[${label}] No repos have Suggestions enabled. Nothing to do.`)
      return null
    }
    return repos
  } catch (e) {
    addLog(`[${label}] ERROR listing sources: ${e.message}`)
    return null
  }
}

// Jules caps suggestion sessions per account per day. KQOO7 returns
// [usedToday, [windowSeconds], dailyLimit, ...]; the extension must not start
// more sessions than the remaining quota, or it blows past the limit (observed
// 268/100). Returns null if the shape is unrecognised so callers can no-op the
// guard rather than block the run.
async function getDailySessionQuota(config) {
  const result = await callBatchExecute('KQOO7', [], config)
  if (!Array.isArray(result) || typeof result[0] !== 'number' || typeof result[2] !== 'number') return null
  return { used: result[0], limit: result[2], remaining: Math.max(0, result[2] - result[0]) }
}

// =============================================================================
// Prompt Builder
// =============================================================================

function createRoleConfig(icon, name, role, codeLabel) {
  return { icon, name, role, codeLabel }
}

const SECURITY_CONFIG = createRoleConfig(
  '[SECURITY]',
  'Security Vulnerability Fix',
  'security-focused',
  'Vulnerable Code'
)
const PERFORMANCE_CONFIG = createRoleConfig(
  '[PERF]',
  'Performance Optimization',
  'performance-focused',
  'Inefficient Code'
)
const CLEANUP_CONFIG = createRoleConfig('[CLEANUP]', 'Code Cleanup', 'code-quality-focused', 'Code to Clean')
const TESTING_CONFIG = createRoleConfig('[TEST]', 'Test Coverage', 'testing-focused', 'Untested Code')

const CATEGORY_CONFIG = {
  'input-validation': SECURITY_CONFIG,
  'insecure-config': SECURITY_CONFIG,
  injection: SECURITY_CONFIG,
  'async-io': PERFORMANCE_CONFIG,
  'loop-optimization': PERFORMANCE_CONFIG,
  'data-structure': PERFORMANCE_CONFIG,
  'dead-code': CLEANUP_CONFIG,
  other: CLEANUP_CONFIG,
  'untested-function': TESTING_CONFIG,
  'missing-error-test': TESTING_CONFIG,
  'missing-edge-case': TESTING_CONFIG,
  'missing-test-file': TESTING_CONFIG
}

const DEFAULT_CATEGORY = createRoleConfig('[FIX]', 'Code Improvement', 'engineering-focused', 'Code')

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

function buildModelConfig(modelId, featureFlags) {
  const config = new Array(11).fill(null)
  config[MCONFIG.MODEL_ID] = modelId
  config[MCONFIG.FEATURE_FLAGS] = featureFlags
  // Schema defaults
  config[3] = []
  config[4] = 1
  config[9] = [360]
  return config
}

function buildSuggestionMetadata(suggestionId, experimentIds) {
  const meta = new Array(12).fill(null)
  meta[0] = 9
  meta[SMETA.EXPERIMENT_IDS] = experimentIds
  meta[SMETA.STATUS_FLAGS] = [null, [1, 1]]
  meta[SMETA.SUGGESTION_ID_WRAPPER] = [null, suggestionId]
  return meta
}

function buildStartPayload(suggestion, repo, config, startConfig) {
  const prompt = buildSuggestionPrompt(suggestion)
  const modelId = config.modelId || startConfig?.modelConfig?.[1] || null
  const featureFlags = startConfig?.featureFlags || DEFAULT_FEATURE_FLAGS
  const experimentIds = startConfig?.experimentIds || []

  const payload = new Array(15).fill(null)
  payload[RJA83D.PROMPT] = prompt
  payload[RJA83D.MODEL_CONFIG] = buildModelConfig(modelId, featureFlags)
  payload[RJA83D.REPO] = repo
  payload[RJA83D.METADATA] = buildSuggestionMetadata(suggestion.id, experimentIds)
  payload[RJA83D.START_FLAG] = 1
  return payload
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
  const prepared = await prepareTab(tab)
  if (!prepared) return 0
  const { label, config } = prepared

  const startConfig = await getStartConfig()
  if (!startConfig) {
    addLog(`[${label}] No StartSuggestion config cached. Using defaults.`)
    addLog(`[${label}] Tip: Click Start on any suggestion in Jules UI to capture config.`)
  }

  // Only repos whose Jules Suggestions toggle is ON. Enumerating every connected
  // source instead caused the extension to start suggestions on repos the user
  // never enabled (and blow past the daily session limit).
  addLog(`[${label}] Fetching Suggestions-enabled repos...`)
  const repos = await safeListSources(label, config)
  if (!repos) return 0

  addLog(
    `[${label}] ${repos.length} repo(s) with Suggestions enabled: ${repos.map((r) => r.replace(/^github\//, '')).join(', ')}`
  )

  addLog(`\n[${label}] Fetching suggestions for ${repos.length} repos concurrently...`)
  const allSuggestions = await runInPool(repos, PER_ACCOUNT_CONCURRENCY, (repo) =>
    globalLimit(() => listSuggestions(repo, config))
      .then((suggestions) => ({ repo, suggestions }))
      .catch((e) => ({ repo, error: e.message }))
  )

  // Flatten (repo, suggestion) pairs across all repos so the pool stays
  // saturated instead of draining one repo at a time.
  const work = []
  const discoveryLogs = []
  for (const { repo, suggestions, error } of allSuggestions) {
    if (error) {
      discoveryLogs.push(`\n[${label}] ERROR fetching suggestions for ${repo}: ${error}`)
      continue
    }
    if (suggestions.length === 0) {
      discoveryLogs.push(`\n[${label}] ${repo}: No suggestions found`)
      continue
    }
    discoveryLogs.push(`\n[${label}] ${repo}: Found ${suggestions.length} suggestions`)
    for (const s of suggestions) work.push({ repo, s })
  }
  if (discoveryLogs.length > 0) addLog(discoveryLogs.join(''))

  if (work.length === 0) {
    addLog(`\n[${label}] TOTAL: 0 suggestions started`)
    return 0
  }

  // Respect Jules' daily session limit: never start more suggestions than the
  // account's remaining quota. Each started suggestion consumes one session.
  let toStart = work
  const quota = await getDailySessionQuota(config)
  if (quota) {
    addLog(`\n[${label}] Daily sessions: ${quota.used}/${quota.limit} used, ${quota.remaining} remaining`)
    if (quota.remaining === 0) {
      addLog(`[${label}] Daily limit reached. Starting 0 suggestions.`)
      return 0
    }
    if (work.length > quota.remaining) {
      addLog(`[${label}] Capping ${work.length} suggestions to ${quota.remaining} (daily limit)`)
      toStart = work.slice(0, quota.remaining)
    }
  }

  if (!options.dryRun) {
    state.progress.total += toStart.length
    updateState({})
  }

  let totalStarted = 0
  let lastUpdate = 0
  await runInPool(toStart, PER_ACCOUNT_CONCURRENCY, async ({ repo, s }) => {
    if (state.status === 'cancelled') return

    if (options.dryRun) {
      addLog(`  [DRY] Would start [${label}] ${s.title} (${s.categorySlug})`)
      return
    }

    const now = Date.now()
    if (now - lastUpdate > 500) {
      updateState({ currentRepo: repo.replace(/^github\//, '') })
      lastUpdate = now
    }
    try {
      await globalLimit(() => withRetry(() => startSuggestion(s, repo, config, startConfig)))
      totalStarted++
      state.progress.archived += 1
      if (Date.now() - lastUpdate > 500) {
        updateState({})
        lastUpdate = Date.now()
      }
      addLog(`  Started [${label}] ${s.title}`)
    } catch (err) {
      addLog(`  [!] Failed to start "${s.title}": ${err.message}`)
    }
  })

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

    const res = await jFetch(url.toString(), {
      headers: { Accept: 'application/vnd.github+json' },
      token
    })
    const prs = await res.json()
    const mapped = prs.map((pr) => ({
      title: pr.title || '',
      titleLower: (pr.title || '').toLowerCase(),
      branch: pr.head?.ref || ''
    }))
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
  return openPRs.some((pr) => pr.titleLower.includes(taskTitle) || taskTitle.includes(pr.titleLower))
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

// A bulk run can emit thousands of log lines (one per task across several
// accounts). Cap the retained log so each persisted snapshot and popup render
// stays bounded — otherwise the array grows without limit and every write
// re-serializes the whole thing.
const MAX_LOG_LINES = 2000

let state = { ...DEFAULT_STATE }
let pendingFlush = null

function trimLog() {
  if (state.log.length > MAX_LOG_LINES) {
    state.log.splice(0, state.log.length - MAX_LOG_LINES)
  }
}

// Persisting on every addLog/updateState writes the whole (growing) state to
// chrome.storage.session per line — O(n^2) writes over a bulk run, plus an
// onChanged event (and full popup re-render) each time, which froze both the
// service worker and the popup. Coalesce rapid updates into one deferred write;
// flush status transitions immediately so the popup always sees the terminal
// state without waiting.
function persistNow() {
  if (pendingFlush) {
    clearTimeout(pendingFlush)
    pendingFlush = null
  }
  chrome.storage.session.set({ archiveState: state })
}

function persistSoon() {
  if (pendingFlush) return
  pendingFlush = setTimeout(() => {
    pendingFlush = null
    chrome.storage.session.set({ archiveState: state })
  }, 150)
}

function updateState(patch) {
  Object.assign(state, patch)
  // Status milestones (running/done/error/idle) are user-visible — flush right
  // away; progress ticks and log spam coalesce into the deferred write.
  if ('status' in patch) {
    persistNow()
  } else {
    persistSoon()
  }
}

function addLog(message) {
  state.log.push(message)
  trimLog()
  persistSoon()
}

const stateReadyPromise = chrome.storage.session.get('archiveState').then((data) => {
  if (data.archiveState) {
    state = data.archiveState
    if (!Array.isArray(state.log)) state.log = []
    // A previous (pre-cap) run may have persisted a huge log that freezes the
    // popup on open; bound it defensively on load.
    trimLog()
    if (state.status === 'running') {
      state.status = 'error'
      state.error = 'Operation interrupted (browser killed service worker)'
      state.log.push('\n[!] Service worker was terminated during operation.')
      persistNow()
    }
  }
})

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

  // ⚡ Bolt Optimization: Replace `.filter().map().sort().map()` chain with
  // standard loops to avoid multiple intermediate array allocations and passes.
  const parsed = []
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i]
    if (!t.url.includes('accounts.google')) {
      parsed.push({ t, n: parseInt(extractAccountNum(t.url), 10) })
    }
  }

  parsed.sort((a, b) => a.n - b.n)

  const result = []
  for (let i = 0; i < parsed.length; i++) {
    result.push(parsed[i].t)
  }

  return result
}

function getTabLabel(tab) {
  const num = extractAccountNum(tab.url)
  return num !== '0' ? `u/${num}` : 'default'
}

async function prepareTab(tab) {
  const label = getTabLabel(tab)
  updateState({ currentTab: label })
  addLog(`\n${'='.repeat(50)}`)
  addLog(`${label}: ${tab.url}`)
  addLog(`${'='.repeat(50)}`)

  try {
    const config = await getTabConfig(tab.id)
    addLog(`[${label}] Config extracted (bl: ${config.bl.split('_').pop()})`)
    return { label, config }
  } catch (e) {
    addLog(`[${label}] ERROR: ${e.message}`)
    return null
  }
}

async function ensureContentScript(tabId) {
  const frame = await chrome.webNavigation.getFrame({ tabId, frameId: 0 })
  if (!frame?.url) {
    throw new Error('Security Error: Cannot verify tab origin')
  }

  try {
    const url = new URL(frame.url)
    if (url.origin !== JULES_ORIGIN) {
      throw new Error('Security Error: Cannot inject script into non-Jules tab')
    }
  } catch {
    throw new Error('Security Error: Cannot inject script into non-Jules tab')
  }

  const documentId = frame.documentId
  const target = { tabId, documentIds: [documentId] }

  try {
    await chrome.tabs.sendMessage(tabId, { action: 'PING' }, { documentId })
  } catch {
    await chrome.scripting.executeScript({
      target,
      files: ['content.js']
    })

    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      try {
        await new Promise((r) => setTimeout(r, 100))
        await chrome.tabs.sendMessage(tabId, { action: 'PING' }, { documentId })
        break
      } catch {
        // Keep waiting
      }
    }
    if (Date.now() >= deadline) {
      throw new Error('Content script failed to initialize within 3s')
    }
  }
  return documentId
}

async function getTabConfig(tabId) {
  const documentId = await ensureContentScript(tabId)
  const response = await chrome.tabs.sendMessage(tabId, { action: 'GET_CONFIG' }, { documentId })
  if (!response?.config?.at) {
    throw new Error('Could not extract page config (XSRF token missing). Try refreshing the Jules tab.')
  }
  // Validate accountNum to prevent path traversal
  const accountNum = String(response.accountNum || '0')
  if (!/^\d+$/.test(accountNum)) {
    throw new Error('Security Error: Invalid account number format')
  }
  return {
    ...response.config,
    accountNum
  }
}

// =============================================================================
// Orchestrator
// =============================================================================

async function filterArchivableTasks(label, tasks, options) {
  if (options.force) {
    addLog(`[${label}] FORCE: archiving all ${tasks.length} tasks (skip state filter + PR check)`)
    return { toArchive: [...tasks], toSkip: [] }
  }

  const candidates = tasks.filter(isArchivable)
  const activeCount = tasks.length - candidates.length

  addLog(`[${label}] ${tasks.length} total: ${candidates.length} archivable, ${activeCount} active`)

  if (candidates.length === 0) {
    const states = [...new Set(tasks.map((t) => t.state))].join(', ')
    addLog(`[${label}] No archivable tasks among ${tasks.length} (states seen: ${states}).`)
    addLog(`[${label}] Enable Force to archive regardless of state.`)
    return { toArchive: [], toSkip: [] }
  }

  const byRepo = groupTasksByRepo(candidates)
  addLog(`\n[${label}] Checking open PRs per task...`)
  const { ghOwner } = await chrome.storage.sync.get(['ghOwner'])
  const { ghToken } = await chrome.storage.local.get(['ghToken'])

  const repoEntries = [...byRepo.entries()]
  const allPRs = await runInPool(repoEntries, API_CONCURRENCY, ([_repo, repoTasks]) => {
    const owner = repoTasks[0]?.owner || ghOwner || ''
    const repoName = repoTasks[0]?.repoName || ''
    return owner && repoName ? getOpenPRs(owner, repoName, ghToken) : Promise.resolve([])
  })

  const toArchive = []
  const toSkip = []
  const prLogs = []
  for (let i = 0; i < repoEntries.length; i++) {
    const [repo, repoTasks] = repoEntries[i]
    const openPRs = allPRs[i]
    prLogs.push(`  ${repo}: ${repoTasks.length} tasks, ${openPRs.length} open PRs`)

    for (const task of repoTasks) {
      if (taskHasOpenPR(task, openPRs)) {
        toSkip.push(task)
        prLogs.push(`    SKIP [${task.id}] ${task.title} (matching open PR)`)
      } else {
        toArchive.push(task)
      }
    }
  }
  if (prLogs.length > 0) addLog(prLogs.join('\n'))

  return { toArchive, toSkip }
}

function logDryRun(label, toArchive) {
  const totalTasks = toArchive.length
  addLog(`[${label}] DRY RUN - would archive ${totalTasks} tasks`)
  const archiveByRepo = groupTasksByRepo(toArchive)
  const dryRunLogs = []
  for (const [repo, repoTasks] of archiveByRepo) {
    dryRunLogs.push(`  ${repo}: ${repoTasks.length} tasks`)
    for (const t of repoTasks) {
      dryRunLogs.push(`    [${t.id}] ${t.title} (state=${t.state})`)
    }
  }
  if (dryRunLogs.length > 0) addLog(dryRunLogs.join('\n'))
}

async function executeArchive(label, toArchive, config) {
  let grandTotal = 0
  let lastUpdate = 0

  await runInPool(toArchive, PER_ACCOUNT_CONCURRENCY, async (task) => {
    const now = Date.now()
    if (now - lastUpdate > 500) {
      updateState({ currentRepo: task.repo || '(no repo)' })
      lastUpdate = now
    }
    try {
      await globalLimit(() => archiveTaskWithRetry(task.id, config))
      grandTotal++
      state.progress.archived += 1
      if (Date.now() - lastUpdate > 500) {
        updateState({})
        lastUpdate = Date.now()
      }
      addLog(`  Archived [${label}] [${task.id}] ${task.title}`)
    } catch (e) {
      addLog(`  ERROR [${label}] archiving ${task.id}: ${e.message}`)
    }
  })
  return grandTotal
}

async function processTab(tab, options) {
  const prepared = await prepareTab(tab)
  if (!prepared) return 0
  const { label, config } = prepared

  addLog(`[${label}] Fetching tasks via API...`)
  const tasks = await safeListTasks(label, config)
  if (!tasks) return 0

  const { toArchive, toSkip } = await filterArchivableTasks(label, tasks, options)

  if (toSkip.length > 0) {
    addLog(`\n[${label}] ${toSkip.length} tasks skipped (open PRs matching)`)
  }

  if (toArchive.length === 0) {
    if (!options.force && tasks.some(isArchivable)) {
      addLog(`[${label}] Nothing to archive (all tasks have matching open PRs).`)
    }
    return 0
  }

  const totalTasks = toArchive.length
  addLog(`\n[${label}] Archiving ${totalTasks} tasks`)

  if (options.dryRun) {
    logDryRun(label, toArchive)
    return 0
  }

  state.progress.total += totalTasks
  updateState({})

  const grandTotal = await executeArchive(label, toArchive, config)

  addLog(`\n[${label}] TOTAL: ${grandTotal} archived`)
  return grandTotal
}

function initOperationState(options) {
  prCache.clear()
  const randomArray = new Uint32Array(1)
  crypto.getRandomValues(randomArray)
  reqCounter = (randomArray[0] % 900000) + 100000
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
  return isSuggestions
}

async function discoverTabs(options) {
  let tabs = await getJulesTabs()

  if (options.scope === 'current' && options.activeTabId) {
    tabs = tabs.filter((t) => t.id === options.activeTabId)
  }

  if (tabs.length === 0) {
    addLog('No Jules tabs found. Open jules.google.com first.')
    updateState({ status: 'error', error: 'No Jules tabs found' })
    return null
  }

  addLog(`Found ${tabs.length} Jules tab(s)\n`)
  return tabs
}

async function processAllTabs(tabs, options, isSuggestions) {
  // Process accounts in parallel. Per-account pools and the shared global
  // limiter keep total in-flight requests bounded; results preserve tab order.
  return Promise.all(
    tabs.map(async (tab) => {
      const label = getTabLabel(tab)
      try {
        const count = isSuggestions ? await processSuggestionsForTab(tab, options) : await processTab(tab, options)
        return { label, count }
      } catch (e) {
        addLog(`ERROR [${label}]: ${e.message}`)
        return { label, count: 0, err: e.message }
      }
    })
  )
}

function finalizeOperation(results, isSuggestions) {
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
}

function handleOperationError(e) {
  const msg = e?.message || String(e) || 'Unknown error'
  addLog(`FATAL ERROR: ${msg}`)
  updateState({ status: 'error', error: msg })
}

async function startOperation(options) {
  const isSuggestions = initOperationState(options)

  try {
    const tabs = await discoverTabs(options)
    if (!tabs) return

    const results = await processAllTabs(tabs, options, isSuggestions)
    finalizeOperation(results, isSuggestions)
  } catch (e) {
    handleOperationError(e)
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
      if (_sender.tab) {
        sendResponse({ error: 'Security Error: Unauthorized action from content script' })
        break
      }
      startOperation(msg.options)
      sendResponse({ ok: true })
      break

    case 'GET_STATE':
      if (_sender.tab) {
        sendResponse({ error: 'Security Error: Unauthorized action from content script' })
        break
      }
      stateReadyPromise.then(() => sendResponse(state))
      return true

    case 'CACHE_START_CONFIG':
      chrome.storage.session.set({ startConfig: msg.config })
      sendResponse({ ok: true })
      break

    case 'RESET':
      if (_sender.tab) {
        sendResponse({ error: 'Security Error: Unauthorized action from content script' })
        break
      }
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
