import re
import sys

def replace_function(content, func_name, new_body):
    pattern = f"async\\s+function\\s+{func_name}\\s*\\(.*?\\)\\s*\\{{"
    match = re.search(pattern, content, re.DOTALL)
    if not match:
        return content

    start_idx = match.start()
    brace_start = match.end() - 1

    count = 1
    i = brace_start + 1
    while i < len(content) and count > 0:
        if content[i] == '{':
            count += 1
        elif content[i] == '}':
            count -= 1
        i += 1

    if count == 0:
        return content[:start_idx] + new_body + content[i:]
    return content

def fix():
    with open('background.js', 'r') as f:
        bg = f.read()

    helpers = r'''
async function discoverReposFromTasks(label, config) {
  addLog(`[${label}] Fetching task list to discover repos...`)
  let tasks
  try {
    tasks = await listTasks('', config)
  } catch (e) {
    addLog(`[${label}] ERROR listing tasks: ${e.message}`)
    return []
  }
  const repos = [...new Set(tasks.map((t) => t.source).filter(Boolean))]
  if (repos.length === 0) {
    addLog(`[${label}] No repos found from tasks.`)
  } else {
    addLog(`[${label}] Found ${repos.length} repos: ${repos.join(', ')}`)
  }
  return repos
}

async function fetchSuggestionsConcurrently(label, repos, config) {
  addLog(`\n[${label}] Fetching suggestions for ${repos.length} repos concurrently...`)
  return await Promise.all(
    repos.map((repo) =>
      listSuggestions(repo, config)
        .then((suggestions) => ({ repo, suggestions }))
        .catch((e) => ({ repo, error: e.message }))
    )
  )
}

async function processAllSuggestions(label, allSuggestions, options, config, startConfig) {
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
  return totalStarted
}

async function fetchAndFilterTasks(label, config) {
  addLog(`[${label}] Fetching tasks via API...`)
  let tasks
  try {
    tasks = await listTasks('', config)
  } catch (e) {
    addLog(`[${label}] ERROR listing tasks: ${e.message}`)
    return null
  }
  if (tasks.length === 0) {
    addLog(`[${label}] No tasks found.`)
    return null
  }
  const candidates = tasks.filter(isArchivable)
  const activeCount = tasks.length - candidates.length
  addLog(`[${label}] ${tasks.length} total: ${candidates.length} completed/failed, ${activeCount} active`)
  if (candidates.length === 0) {
    addLog(`[${label}] No completed/failed tasks to archive.`)
    return null
  }
  return candidates
}

async function getTasksToArchive(label, candidates, options) {
  const byRepo = new Map()
  for (const task of candidates) {
    const key = task.repo || '(no repo)'
    if (!byRepo.has(key)) byRepo.set(key, [])
    byRepo.get(key).push(task)
  }
  const toArchive = []
  const toSkip = []
  const { ghOwner } = await chrome.storage.sync.get(['ghOwner'])
  const { ghToken } = await chrome.storage.local.get(['ghToken'])
  if (options.force) {
    addLog(`[${label}] FORCE: skipping PR check`)
    return { toArchive: candidates, toSkip: [] }
  }
  addLog(`\n[${label}] Checking open PRs per task...`)
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
        toArchive.push(task)
      } else if (taskHasOpenPR(task, openPRs)) {
        toSkip.push(task)
        addLog(`    SKIP [${task.id}] ${task.title} (matching open PR)`)
      } else {
        toArchive.push(task)
      }
    }
  }
  if (toSkip.length > 0) {
    addLog(`\n[${label}] ${toSkip.length} tasks skipped (open PRs matching)`)
  }
  return { toArchive, toSkip }
}

async function performArchival(label, toArchive, config, dryRun) {
  const totalTasks = toArchive.length
  addLog(`\n[${label}] Archiving ${totalTasks} tasks`)
  const archiveByRepo = new Map()
  for (const t of toArchive) {
    const key = t.repo || '(no repo)'
    if (!archiveByRepo.has(key)) archiveByRepo.set(key, [])
    archiveByRepo.get(key).push(t)
  }
  if (dryRun) {
    addLog(`[${label}] DRY RUN - would archive ${totalTasks} tasks`)
    for (const [repo, repoTasks] of archiveByRepo) {
      addLog(`  ${repo}: ${repoTasks.length} tasks`)
      for (const t of repoTasks) {
        addLog(`    [${t.id}] ${t.title} (state=${t.state})`)
      }
    }
    return 0
  }
  let grandTotal = 0
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
'''

    new_proc_sugg = r'''async function processSuggestionsForTab(tab, options) {
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

  const repos = await discoverReposFromTasks(label, config)
  if (repos.length === 0) return 0

  const allSuggestions = await fetchSuggestionsConcurrently(label, repos, config)
  const totalStarted = await processAllSuggestions(label, allSuggestions, options, config, startConfig)

  addLog(`\n[${label}] TOTAL: ${totalStarted} suggestions started`)
  return totalStarted
}'''

    new_proc_tab = r'''async function processTab(tab, options) {
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

  const candidates = await fetchAndFilterTasks(label, config)
  if (!candidates) return 0

  const { toArchive } = await getTasksToArchive(label, candidates, options)
  if (toArchive.length === 0) {
    addLog(`[${label}] Nothing to archive (all tasks have matching open PRs).`)
    return 0
  }

  return await performArchival(label, toArchive, config, options.dryRun)
}'''

    # --- URL Parsing Fix ---
    bg = bg.replace(
        "function extractAccountNum(url) {\n  const parts = new URL(url).pathname.split('/')\n  const uIdx = parts.indexOf('u')\n  return uIdx !== -1 && parts[uIdx + 1] ? parts[uIdx + 1] : '0'\n}",
        "function extractAccountNum(url) {\n  try {\n    const parts = new URL(url).pathname.split('/')\n    const uIdx = parts.indexOf('u')\n    return uIdx !== -1 && parts[uIdx + 1] ? parts[uIdx + 1] : '0'\n  } catch {\n    return '0'\n  }\n}"
    )

    # --- Add helpers before Suggestions Orchestrator ---
    bg = bg.replace("// Suggestions Orchestrator", "// Orchestrators\n" + helpers)

    # --- Replace functions ---
    bg = replace_function(bg, "processSuggestionsForTab", new_proc_sugg)
    bg = replace_function(bg, "processTab", new_proc_tab)

    with open('background.js', 'w') as f:
        f.write(bg)

    # --- content.js fix ---
    with open('content.js', 'r') as f:
        c = f.read()
    c = c.replace(
        "function getAccountNum() {\n  const parts = new URL(location.href).pathname.split('/')\n  const uIdx = parts.indexOf('u')\n  return uIdx !== -1 && parts[uIdx + 1] ? parts[uIdx + 1] : '0'\n}",
        "function getAccountNum() {\n  try {\n    const parts = new URL(location.href).pathname.split('/')\n    const uIdx = parts.indexOf('u')\n    return uIdx !== -1 && parts[uIdx + 1] ? parts[uIdx + 1] : '0'\n  } catch {\n    return '0'\n  }\n}"
    )
    with open('content.js', 'w') as f:
        f.write(c)

    # --- Update background.test.js exports ---
    with open('tests/background.test.js', 'r') as f:
        t = f.read()

    new_exports = [
        'fetchAndFilterTasks', 'getTasksToArchive', 'performArchival',
        'discoverReposFromTasks', 'fetchSuggestionsConcurrently', 'processAllSuggestions',
        'processTab', 'processSuggestionsForTab'
    ]

    marker = "    globalThis.test_getTabLabel = getTabLabel;"
    for exp in new_exports:
        line = f"    globalThis.test_{exp} = {exp};\n"
        if line not in t:
             t = t.replace(marker, marker + "\n" + line)

    with open('tests/background.test.js', 'w') as f:
        f.write(t)

    # --- Update security.test.js stateReadyPromise ---
    with open('tests/security.test.js', 'r') as f:
        s = f.read()
    if 'globalThis.test_stateReadyPromise = stateReadyPromise;' not in s:
        s = s.replace('globalThis.test_ensureContentScript = ensureContentScript;',
                      'globalThis.test_ensureContentScript = ensureContentScript;\n    globalThis.test_stateReadyPromise = stateReadyPromise;')
        with open('tests/security.test.js', 'w') as f:
            f.write(s)

if __name__ == "__main__":
    fix()
