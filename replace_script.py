import sys

file_path = 'background.js'
with open(file_path, 'r') as f:
    content = f.read()

search_text = """  for (const [repo, repoTasks] of archiveByRepo) {
    updateState({ currentRepo: repo })
    addLog(`\\n[${label}] -> ${repo} (${repoTasks.length} tasks)`)

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
  }"""

replace_text = """  // ⚡ Bolt Optimization: Parallelize across different repositories
  // Use (N repos) to prevent UI flickering during parallel processing
  if (archiveByRepo.size > 1) {
    updateState({ currentRepo: `(${archiveByRepo.size} repos)` })
  } else if (archiveByRepo.size === 1) {
    updateState({ currentRepo: archiveByRepo.keys().next().value })
  }

  const repoPromises = [...archiveByRepo.entries()].map(([repo, repoTasks]) =>
    archiveRepo(repo, repoTasks, config, label)
  )
  const repoTotals = await Promise.all(repoPromises)
  grandTotal = repoTotals.reduce((a, b) => a + b, 0)"""

if search_text in content:
    new_content = content.replace(search_text, replace_text)
    with open(file_path, 'w') as f:
        f.write(new_content)
    print('Replacement successful')
else:
    print('Search text not found')
