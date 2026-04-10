import re
import sys

file_path = 'background.js'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Add archiveRepo
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

# Use a more robust regex to find the end of archiveTask
content = re.sub(r'(async function archiveTask\(taskId, config\) \{.*?\}\n)', r'\1' + archive_repo_code, content, flags=re.DOTALL)

# 2. Parallelize processTab
# Use regex to find the loop in processTab
loop_pattern = r'  for \(const \[repo, repoTasks\] of archiveByRepo\) \{.*?\}\n\n  addLog\(`\\n\[\$\{label\}\] TOTAL: \$\{grandTotal\} archived`\)'

replace_logic = r'''  // ⚡ Bolt Optimization: Parallelize across different repositories
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
  grandTotal = repoTotals.reduce((a, b) => a + b, 0)

  addLog(`\n[${label}] TOTAL: ${grandTotal} archived`)'''

new_content = re.sub(loop_pattern, replace_logic, content, flags=re.DOTALL)

if new_content == content:
    print("Error: loop_pattern not found")
    # Debug: show what we're looking for
    sys.exit(1)

with open(file_path, 'w') as f:
    f.write(new_content)
print("Successfully updated background.js")
