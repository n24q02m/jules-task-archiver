/**
 * Jules Task Archiver — Content Script
 *
 * Runs on jules.google.com/* tabs.
 * Handles all DOM operations: reading repos, archiving tasks.
 *
 * Archive strategy: batch processing with page reload between batches.
 * This keeps DOM fresh and avoids stale element issues after tasks disappear.
 */

// --- Selectors (update here if Jules UI changes) ---
const SEL = {
  repoLink: "a.source-row",
  repoName: ".repo",
  repoOwner: ".owner",
  taskCount: ".source-task-count",
  taskOptions: 'button[aria-label="Task options"]',
  menuItem: 'button[role="menuitem"]',
}

// --- Timing (ms) ---
const TIMING = {
  menuWait: 800,
  closeWait: 500,
  taskDelay: 300,
  pageLoad: 4000,
  viewMore: 2000,
  batchDelay: 1500,
}

// --- Batch size: archive N tasks, then reload page for fresh DOM ---
const BATCH_SIZE = 10

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- Detect account label from URL ---
function getAccountLabel() {
  const m = location.href.match(/\/u\/(\d+)/)
  return m ? `u/${m[1]}` : "default"
}

// --- Send progress to background ---
function reportProgress(data) {
  chrome.runtime.sendMessage({ action: "PROGRESS", data })
}

// --- Read repos from sidebar ---
function getRepos() {
  const rows = document.querySelectorAll(SEL.repoLink)
  const repos = []
  for (const a of rows) {
    const repo = a.querySelector(SEL.repoName)?.textContent?.trim() || ""
    const owner = a.querySelector(SEL.repoOwner)?.textContent?.trim() || ""
    const count = parseInt(a.querySelector(SEL.taskCount)?.textContent?.trim() || "0", 10)
    if (count > 0) {
      repos.push({ name: `${owner}/${repo}`, owner, repo, tasks: count })
    }
  }
  return repos
}

// --- Wait for page to be ready (sidebar loaded) ---
async function waitForSidebar(timeout = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (document.querySelector(SEL.repoLink)) return true
    await sleep(500)
  }
  return false
}

// --- Navigate to repo page via sidebar click ---
async function navigateToRepo(repoName) {
  const links = document.querySelectorAll(SEL.repoLink)
  for (const link of links) {
    if (link.querySelector(SEL.repoName)?.textContent?.trim() === repoName) {
      link.click()
      await sleep(TIMING.pageLoad)
      return true
    }
  }
  return false
}

// --- Click "View more" until all tasks are loaded ---
async function loadAllTasks() {
  let clicks = 0
  while (true) {
    const btns = Array.from(document.querySelectorAll("button"))
    const viewMore = btns.filter((b) => b.textContent?.trim() === "View more")
    if (viewMore.length === 0) break
    viewMore[viewMore.length - 1].click()
    clicks++
    await sleep(TIMING.viewMore)
  }
  return clicks
}

// --- Archive a single task at a given index ---
async function archiveTaskAt(index) {
  const btns = document.querySelectorAll(SEL.taskOptions)
  if (index >= btns.length) return "no_btn"

  btns[index].click()
  await sleep(TIMING.menuWait)

  const items = Array.from(document.querySelectorAll(SEL.menuItem))
  const archiveBtn = items.find(
    (x) => x.textContent?.includes("Archive") && !x.textContent?.includes("Unarchive"),
  )

  if (!archiveBtn) {
    // Close menu by pressing Escape (more reliable than body click)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await sleep(TIMING.closeWait)
    return "skip"
  }

  archiveBtn.click()
  await sleep(TIMING.closeWait)
  return "ok"
}

// --- Archive one batch of tasks (up to BATCH_SIZE) ---
// Uses offset: skip unskippable tasks, archive the rest.
// When archived: task disappears, next slides into same index → keep index.
// When skipped: task stays, move to next index.
async function archiveBatch() {
  let archived = 0
  let skipped = 0
  let index = 0 // current position (accounts for skipped tasks)

  for (let i = 0; i < BATCH_SIZE; i++) {
    const btns = document.querySelectorAll(SEL.taskOptions)
    if (index >= btns.length) break

    const result = await archiveTaskAt(index)
    if (result === "ok") {
      archived++
      // Task disappears — next task slides into this index, so DON'T increment
    } else if (result === "skip") {
      skipped++
      index++ // This task stays in DOM, move past it
    } else {
      break // no more buttons
    }
    await sleep(TIMING.taskDelay)
  }

  return { archived, skipped }
}

// --- Archive all tasks for a repo using batch + reload strategy ---
async function archiveRepo(repoName, dryRun) {
  const label = `${getAccountLabel()}/${repoName}`

  // Navigate to repo
  if (!(await navigateToRepo(repoName))) {
    reportProgress({ label, message: `[${label}] Repo not found in sidebar.` })
    return { archived: 0, skipped: 0, total: 0 }
  }

  // Count total tasks (load all first)
  await loadAllTasks()
  const initialTotal = document.querySelectorAll(SEL.taskOptions).length

  if (initialTotal === 0) {
    reportProgress({ label, message: `[${label}] No tasks.` })
    return { archived: 0, skipped: 0, total: 0 }
  }

  reportProgress({
    label,
    message: `[${label}] ${initialTotal} tasks found`,
  })

  if (dryRun) {
    reportProgress({
      label,
      message: `[${label}] DRY RUN - would process ${initialTotal} tasks`,
    })
    return { archived: 0, skipped: 0, total: initialTotal }
  }

  // Batch archive loop
  let totalArchived = 0
  let totalSkipped = 0
  let batchNum = 0

  while (true) {
    batchNum++
    const remaining = document.querySelectorAll(SEL.taskOptions).length
    if (remaining === 0) break

    reportProgress({
      label,
      message: `[${label}] Batch ${batchNum}: ${remaining} tasks remaining`,
      archived: totalArchived,
      skipped: totalSkipped,
      total: initialTotal,
    })

    const batch = await archiveBatch()
    totalArchived += batch.archived
    totalSkipped += batch.skipped

    // If nothing happened at all, bail out to avoid infinite loop
    if (batch.archived === 0 && batch.skipped === 0) break

    // If entire batch was skips (no archivable tasks left), stop
    if (batch.archived === 0) break

    reportProgress({
      label,
      message: `[${label}] Batch ${batchNum} done: +${batch.archived} archived, +${batch.skipped} skipped`,
      archived: totalArchived,
      skipped: totalSkipped,
      total: initialTotal,
    })

    // Check if more tasks remain — if so, reload for fresh DOM
    const afterRemaining = document.querySelectorAll(SEL.taskOptions).length
    if (afterRemaining > 0) {
      reportProgress({
        label,
        message: `[${label}] Reloading page for fresh DOM...`,
      })

      // Instead of full page reload (which kills the content script),
      // re-navigate to the repo via sidebar click to refresh the task list
      await sleep(TIMING.batchDelay)
      if (!(await navigateToRepo(repoName))) break
      await loadAllTasks()
    }
  }

  reportProgress({
    label,
    message: `[${label}] Done: ${totalArchived} archived, ${totalSkipped} skipped (of ${initialTotal})`,
    archived: totalArchived,
    skipped: totalSkipped,
    total: initialTotal,
    done: true,
  })

  return { archived: totalArchived, skipped: totalSkipped, total: initialTotal }
}

// --- Message handler ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case "PING":
      sendResponse({ ok: true, account: getAccountLabel() })
      break

    case "GET_REPOS": {
      // Ensure sidebar is loaded before reading
      waitForSidebar().then((ready) => {
        if (ready) {
          sendResponse({ repos: getRepos(), account: getAccountLabel() })
        } else {
          sendResponse({ repos: [], account: getAccountLabel() })
        }
      })
      return true
    }

    case "ARCHIVE_REPO":
      archiveRepo(msg.repo, msg.dryRun).then((result) => {
        sendResponse(result)
      })
      return true

    default:
      sendResponse({ error: "Unknown action" })
  }
})
