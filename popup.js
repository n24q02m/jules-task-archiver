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
document.querySelectorAll('#opMode button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#opMode button').forEach((b) => {
      b.classList.remove('active')
    })
    btn.classList.add('active')
    opMode = btn.dataset.value
    chrome.storage.sync.set({ opMode })
  })
})

// --- Load saved settings ---
chrome.storage.sync.get(['ghOwner', 'opMode'], (syncData) => {
  if (syncData.ghOwner) ghOwnerInput.value = syncData.ghOwner
  if (syncData.opMode) {
    opMode = syncData.opMode
    document.querySelectorAll('#opMode button').forEach((b) => {
      b.classList.remove('active')
    })
    const activeBtn = document.querySelector(`#opMode button[data-value="${opMode}"]`)
    if (activeBtn) activeBtn.classList.add('active')
  }

  chrome.storage.local.get(['ghToken'], (localData) => {
    if (localData.ghToken) {
      ghTokenInput.value = localData.ghToken
    } else {
      chrome.storage.sync.get(['ghToken'], (oldSync) => {
        if (oldSync.ghToken) {
          ghTokenInput.value = oldSync.ghToken
          chrome.storage.local.set({ ghToken: oldSync.ghToken })
          chrome.storage.sync.remove('ghToken')
        }
      })
    }
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
  // Save settings first
  chrome.storage.sync.set({
    ghOwner: ghOwnerInput.value.trim()
  })
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
  startBtn.textContent = 'Running...'
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
  startBtn.textContent = 'Start'
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
      currentInfo.textContent += ` [${state.progress.archived + state.progress.skipped}/${state.progress.total}]`
    }
  }

  // Done or error
  if (state.status === 'done' || state.status === 'error') {
    startBtn.disabled = false
    startBtn.textContent = 'Start'
    resetBtn.style.display = 'block'
    progressFill.style.width = '100%'

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
      startBtn.textContent = 'Running...'
    } else {
      resetBtn.style.display = 'block'
    }
  }
})
