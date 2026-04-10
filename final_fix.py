import re
import sys

file_path = 'background.js'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Define archiveRepo
archive_repo_code = '''
/**
 * Archives tasks for a single repository sequentially.
 * Used by processTab to parallelize across repositories.
 */
async function archiveRepo(repo, repoTasks, config, label) {
  addLog(`\\n[${label}] -> ${repo} (${repoTasks.length} tasks)`)
  let repoGrandTotal = 0

  for (const task of repoTasks) {
    if (state.status === 'cancelled') break
    try {
      await archiveTask(task.id, config)
      repoGrandTotal++

      // Update shared progress counter
      updateState({
        progress: {
          archived: state.progress.archived + 1,
          skipped: state.progress.skipped,
          total: state.progress.total
        }
      })

      addLog(`  [${repo}] Archived: [${task.id}] ${task.title}`)
    } catch (e) {
      addLog(`  [${repo}] ERROR archiving ${task.id}: ${e.message}`)
    }
  }
  return repoGrandTotal
}
'''

# Insert archiveRepo after archiveTask
content = re.sub(r'(async function archiveTask\(taskId, config\) \{.*?\}\n)', r'\1' + archive_repo_code, content, flags=re.DOTALL)

# 2. Parallelize processTab
# Find the specific block in processTab
search_block = """  for (const [repo, repoTasks] of archiveByRepo) {
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

replace_block = """  // ⚡ Bolt Optimization: Parallelize across different repositories
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

if search_block in content:
    content = content.replace(search_block, replace_block)
else:
    print("Error: search_block not found")
    sys.exit(1)

with open(file_path, 'w') as f:
    f.write(content)
print("Successfully updated background.js")
