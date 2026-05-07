import sys

def apply_diff(filename, search, replace):
    with open(filename, 'r') as f:
        content = f.read()
    if search not in content:
        print(f"FAILED: search block not found in {filename}")
        print("SEARCH BLOCK:")
        print(search)
        return False
    new_content = content.replace(search, replace)
    with open(filename, 'w') as f:
        f.write(new_content)
    return True

# processTab progress initialization
search1 = """  if (candidates.length === 0) {
    addLog(`[${label}] No completed/failed tasks to archive.`)
    return 0
  }"""
replace1 = """  if (candidates.length === 0) {
    addLog(`[${label}] No completed/failed tasks to archive.`)
    return 0
  }

  state.progress.total += candidates.length
  updateState({})"""

# processTab PR skip
search2 = """        } else if (taskHasOpenPR(task, openPRs)) {
          toSkip.push(task)
          addLog(`    SKIP [${task.id}] ${task.title} (matching open PR)`)
        } else {"""
replace2 = """        } else if (taskHasOpenPR(task, openPRs)) {
          toSkip.push(task)
          addLog(`    SKIP [${task.id}] ${task.title} (matching open PR)`)
          state.progress.skipped++
          updateState({})
        } else {"""

# processTab archive loop
search3 = """    for (const task of repoTasks) {
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
    }"""
replace3 = """    for (const task of repoTasks) {
      try {
        await archiveTask(task.id, config)
        grandTotal++
        addLog(`  Archived: [${task.id}] ${task.title}`)
        state.progress.archived++
        updateState({})
      } catch (e) {
        addLog(`  ERROR archiving ${task.id}: ${e.message}`)
        state.progress.skipped++
        updateState({})
      }
    }"""

# processSuggestionsForTab initialization
search4 = """  const allSuggestions = await Promise.all(suggestionFetches)

  let totalStarted = 0"""
replace4 = """  const allSuggestions = await Promise.all(suggestionFetches)

  const totalSuggestions = allSuggestions.reduce((sum, { suggestions }) => sum + (suggestions?.length || 0), 0)
  state.progress.total += totalSuggestions
  updateState({})

  let totalStarted = 0"""

# processSuggestionsForTab loop
search5 = """      if (options.dryRun) {
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
      })"""
replace5 = """      if (options.dryRun) {
        addLog(`  [DRY] Would start: ${s.title} (${s.categorySlug})`)
        state.progress.archived++
      } else {
        addLog(`  Starting: ${s.title}...`)
        try {
          await startSuggestion(s, repo, config, startConfig)
          addLog(`  Started: ${s.title}`)
          totalStarted++
          state.progress.archived++
        } catch (err) {
          addLog(`  [!] Failed to start "${s.title}": ${err.message}`)
          state.progress.skipped++
        }
      }
      updateState({})"""

filename = 'background.js'
if apply_diff(filename, search1, replace1) and \
   apply_diff(filename, search2, replace2) and \
   apply_diff(filename, search3, replace3) and \
   apply_diff(filename, search4, replace4) and \
   apply_diff(filename, search5, replace5):
    print("SUCCESS")
else:
    sys.exit(1)
