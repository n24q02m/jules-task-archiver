/**
 * Jules Task Archiver — Popup Script
 *
 * Handles UI interactions, settings persistence, and progress display.
 */

const $ = (sel) => document.querySelector(sel)

// --- DOM refs ---
const ghApiUrlInput = $('#ghApiUrl')
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

function getRunningText() {
  const modeRadio = document.querySelector('input[name="mode"]:checked')
  const isDry = modeRadio && modeRadio.value === 'dry'
  const isArchive = opMode === 'archive'

  if (isArchive) {
    return isDry ? '⏳ Dry Running Archive...' : '⏳ Running Archive...'
  } else {
    return isDry ? '⏳ Dry Running Suggestions...' : '⏳ Running Suggestions...'
  }
}

// --- Operation mode selector ---
function setActiveOpMode(value) {
  opMode = value
  updateOpModeUI(value)
}

function updateOpModeUI(value) {
  document.querySelectorAll('#opMode button').forEach((b) => {
    const isActive = b.dataset.value === value
    b.classList.toggle('active', isActive)
    b.setAttribute('aria-pressed', String(isActive))
  })

  // Progressive disclosure: hide archive-specific settings
  const isArchive = value === 'archive'
  const settingsSection = document.querySelector('.settings')
  const forceCheckboxContainer = forceCheckbox.closest('.setting-row')

  if (settingsSection) {
    settingsSection.style.display = isArchive ? 'block' : 'none'
  }
  if (forceCheckboxContainer) {
    forceCheckboxContainer.style.display = isArchive ? 'block' : 'none'
  }

  // Context-aware start button text
  if (!startBtn.disabled) {
    const modeRadio = document.querySelector('input[name="mode"]:checked')
    const isDry = modeRadio && modeRadio.value === 'dry'
    if (isArchive) {
      startBtn.textContent = isDry ? 'Dry Run Archive' : 'Start Archiving'
    } else {
      startBtn.textContent = isDry ? 'Dry Run Suggestions' : 'Start Suggestions'
    }
  }
}

document.querySelectorAll('#opMode button').forEach((btn) => {
  btn.addEventListener('click', () => {
    setActiveOpMode(btn.dataset.value)
    chrome.storage.sync.set({ opMode })
  })
})

// Update button text when execution mode changes
document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (!startBtn.disabled && !startBtn.textContent.startsWith('⏳')) {
      updateOpModeUI(opMode)
    }
  })
})

// --- Load saved settings & cleanup insecure storage ---
chrome.storage.sync.get(['ghApiUrl', 'ghOwner', 'opMode', 'ghToken'], (syncData) => {
  if (syncData.ghApiUrl) ghApiUrlInput.value = syncData.ghApiUrl
  if (syncData.ghOwner) ghOwnerInput.value = syncData.ghOwner
  if (syncData.opMode) {
    setActiveOpMode(syncData.opMode)
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
ghApiUrlInput.addEventListener('change', () => {
  chrome.storage.sync.set({ ghApiUrl: ghApiUrlInput.value.trim() })
})
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
    ghApiUrl: ghApiUrlInput.value.trim(),
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
  startBtn.textContent = getRunningText()
  resetBtn.style.display = 'none'
  progressSection.style.display = 'block'
  summarySection.style.display = 'none'
  currentInfo.textContent = 'Starting...'
  progressFill.style.width = '0%'
  progressFill.style.background = '' // Reset error color if present
  logPre.textContent = ''

  chrome.runtime.sendMessage({ action: 'START', options })
})

// --- Reset ---
resetBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'RESET' })
  startBtn.disabled = false
  startBtn.removeAttribute('aria-busy')
  updateOpModeUI(opMode)
  resetBtn.style.display = 'none'
  progressSection.style.display = 'none'
  summarySection.style.display = 'none'
  // Move focus back to the primary action so keyboard users are not stranded
  // on the now-hidden Reset button.
  startBtn.focus()
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
    updateOpModeUI(opMode)
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
  summarySection.style.display = 'block'
  summaryDiv.textContent = ''

  if (!results?.length) {
    const emptyDiv = document.createElement('div')
    emptyDiv.className = 'hint'
    emptyDiv.style.marginTop = '4px'
    emptyDiv.textContent = 'No items were processed. Try checking your scope or if tasks exist.'
    summaryDiv.appendChild(emptyDiv)
    return
  }

  // ⚡ Bolt Optimization: Use DocumentFragment to batch DOM insertions.
  // This prevents redundant browser reflows/repaints when processing large
  // numbers of repositories, improving performance during summary rendering.
  const fragment = document.createDocumentFragment()
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
    fragment.appendChild(div)
  }

  const totalDiv = document.createElement('div')
  totalDiv.className = 'total'
  totalDiv.textContent = `TOTAL: ${grand} processed`
  fragment.appendChild(totalDiv)

  summaryDiv.appendChild(fragment)
}

// --- Check for existing state on popup open ---
chrome.runtime.sendMessage({ action: 'GET_STATE' }, (state) => {
  if (state && state.status !== 'idle') {
    // Rehydrate opMode if it's available in the state options
    if (state.options?.opMode) {
      opMode = state.options.opMode
    }
    renderState(state)
    if (state.status === 'running') {
      startBtn.disabled = true
      startBtn.setAttribute('aria-busy', 'true')
      startBtn.textContent = getRunningText()
    } else {
      resetBtn.style.display = 'block'
    }
  }
})
