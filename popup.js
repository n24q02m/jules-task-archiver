/**
 * Jules Task Archiver — Popup Script
 *
 * Handles UI interactions, settings persistence, and progress display.
 */

const $ = (sel) => document.querySelector(sel)

// --- DOM refs ---
const ghOwnerInput = $('#ghOwner')
const ghTokenInput = $('#ghToken')
const forceCheckbox = $('#force')
const startBtn = $('#startBtn')
const resetBtn = $('#resetBtn')
const progressSection = $('#progressSection')
const summarySection = $('#summarySection')
const currentInfo = $('#currentInfo')
const progressFill = $('#progressFill')
const logPre = $('#log')
const summaryDiv = $('#summary')

// --- Operation mode state ---
let opMode = 'archive'

// --- Operation mode selector ---
function setActiveOpMode(value) {
  document.querySelectorAll('#opMode button').forEach((b) => {
    const isActive = b.dataset.value === value
    b.classList.toggle('active', isActive)
    b.setAttribute('aria-pressed', String(isActive))
  })
  opMode = value

  // Progressive disclosure: hide archive-specific settings
  const isArchive = value === 'archive'
  const settingsSection = document.querySelector('.settings')
  const forceCheckboxContainer =
    typeof forceCheckbox !== 'undefined' && forceCheckbox ? forceCheckbox.parentElement : null

  if (settingsSection) {
    settingsSection.style.display = isArchive ? 'block' : 'none'
  }
  if (forceCheckboxContainer) {
    forceCheckboxContainer.style.display = isArchive ? 'flex' : 'none'
  }

  // Update button text contextually
  if (startBtn && !startBtn.disabled) {
    startBtn.textContent = isArchive ? 'Start Archiving' : 'Start Suggestions'
  }
}

document.querySelectorAll('#opMode button').forEach((btn) => {
  btn.addEventListener('click', () => {
    setActiveOpMode(btn.dataset.value)
    chrome.storage.sync.set({ opMode })
  })
})

// --- Load saved settings & cleanup insecure storage ---
chrome.storage.sync.get(['ghOwner', 'opMode', 'ghToken'], (syncData) => {
  if (syncData.ghOwner) ghOwnerInput.value = syncData.ghOwner
  if (syncData.opMode) {
    setActiveOpMode(syncData.opMode)
  } else {
    setActiveOpMode('archive')
  }

  // Cleanup legacy insecure storage of token in sync
  if (syncData.ghToken) {
    chrome.storage.local.set({ ghToken: syncData.ghToken }, () => {
      chrome.storage.sync.remove('ghToken')
    })
    ghTokenInput.value = syncData.ghToken
  }

  chrome.storage.local.get(['ghToken'], (localData) => {
    if (localData.ghToken) ghTokenInput.value = localData.ghToken
  })
})
// --- Save settings on change ---
ghOwnerInput.addEventListener('change', () => {
  chrome.storage.sync.set({ ghOwner: ghOwnerInput.value.trim() })
})
ghTokenInput.addEventListener('change', () => {
  chrome.storage.local.set({ ghToken: ghTokenInput.value.trim() })
})

// --- Start operation ---
startBtn.addEventListener('click', async () => {
  // Save settings first, ensuring token is only in local storage
  chrome.storage.sync.set({
    ghOwner: ghOwnerInput.value.trim()
  })
  chrome.storage.sync.remove('ghToken')
  chrome.storage.local.set({
    ghToken: ghTokenInput.value.trim()
  })

  const mode = document.querySelector('input[name="mode"]:checked').value
  const scope = document.querySelector('input[name="scope"]:checked').value

  // Get active tab for "current" scope
  let activeTabId = null
  if (scope === 'current') {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    })
    activeTabId = tab?.id
  }

  const options = {
    dryRun: mode === 'dry',
    force: forceCheckbox.checked,
    scope,
    activeTabId,
    opMode
  }

  // Reset UI
  startBtn.disabled = true
  startBtn.setAttribute('aria-busy', 'true')
  startBtn.textContent = `⏳ ${opMode === 'archive' ? 'Archiving...' : 'Suggesting...'}`
  resetBtn.style.display = 'none'
  progressSection.style.display = 'block'
  summarySection.style.display = 'none'
  currentInfo.textContent = 'Starting...'
  progressFill.style.width = '0%'
  logPre.textContent = ''

  chrome.runtime.sendMessage({ action: 'START', options })
})

// --- Reset ---
resetBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'RESET' })
  startBtn.disabled = false
  startBtn.removeAttribute('aria-busy')
  setActiveOpMode(opMode)
  resetBtn.style.display = 'none'
  progressSection.style.display = 'none'
  summarySection.style.display = 'none'
})

// --- Listen for state changes ---
chrome.storage.onChanged.addListener((changes) => {
  if (!changes.archiveState) return
  const state = changes.archiveState.newValue
  if (!state) return
  renderState(state)
})

// --- Render state ---
function renderState(state) {
  // Log
  if (state.log?.length > 0) {
    logPre.textContent = state.log.join('\n')
    logPre.scrollTop = logPre.scrollHeight
    progressSection.style.display = 'block'
  }

  // Current info
  if (state.status === 'running') {
    const parts = []
    if (state.currentTab) parts.push(state.currentTab)
    if (state.currentRepo) parts.push(state.currentRepo)
    currentInfo.textContent = parts.join(' > ')

    if (state.progress?.total > 0) {
      const pct = Math.round(((state.progress.archived + state.progress.skipped) / state.progress.total) * 100)
      progressFill.style.width = `${pct}%`
      progressFill.parentElement.setAttribute('aria-valuenow', String(pct))
      currentInfo.textContent += ` [${state.progress.archived + state.progress.skipped}/${state.progress.total}]`
    }
  }

  // Done or error
  if (state.status === 'done' || state.status === 'error') {
    startBtn.disabled = false
    startBtn.removeAttribute('aria-busy')
    setActiveOpMode(opMode)
    resetBtn.style.display = 'block'
    progressFill.style.width = '100%'
    progressFill.parentElement.setAttribute('aria-valuenow', '100')

    if (state.status === 'done') {
      currentInfo.textContent = 'Complete'
      renderSummary(state.results)
    } else {
      currentInfo.textContent = `Error: ${state.error}`
      progressFill.style.background = '#f87171'
    }
  }
}

// --- Render summary (safe DOM methods, no innerHTML) ---
function renderSummary(results) {
  if (!results?.length) return

  summarySection.style.display = 'block'
  summaryDiv.textContent = ''

  let grand = 0
  for (const r of results) {
    grand += r.count
    const div = document.createElement('div')
    if (r.err) {
      div.className = 'error'
      div.textContent = `${r.label}: ERROR - ${r.err}`
    } else {
      div.textContent = `${r.label}: ${r.count} processed`
    }
    summaryDiv.appendChild(div)
  }

  const totalDiv = document.createElement('div')
  totalDiv.className = 'total'
  totalDiv.textContent = `TOTAL: ${grand} processed`
  summaryDiv.appendChild(totalDiv)
}

// --- Check for existing state on popup open ---
chrome.runtime.sendMessage({ action: 'GET_STATE' }, (state) => {
  if (state && state.status !== 'idle') {
    renderState(state)
    if (state.status === 'running') {
      startBtn.disabled = true
      startBtn.setAttribute('aria-busy', 'true')
      startBtn.textContent = `⏳ ${opMode === 'archive' ? 'Archiving...' : 'Suggesting...'}`
    } else {
      resetBtn.style.display = 'block'
    }
  }
})
