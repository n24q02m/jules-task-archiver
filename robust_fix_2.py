import re
import sys

file_path = 'background.js'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Add archiveRepo helper correctly
# Find the end of archiveTask
archive_task_pattern = r'(async function archiveTask\(taskId, config\) \{.*?\}\n)'
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

# Check if archiveRepo already exists partially or wrongly
content = re.sub(r'/\*\*\n \* Archives tasks for a single repository sequentially\..*?return repoGrandTotal\n\}', '', content, flags=re.DOTALL)
# Also clean up the broken fragment I saw
content = re.sub(r'async function archiveRepo\(repo, repoTasks, config, label\) \{\n  addLog\(`\\n\[\$\{label\}\] -> \$\{repo\} \(\$\{repoTasks\.length\} tasks\)`\)\n', '', content)

# Insert correctly
content = re.sub(archive_task_pattern, r'\1' + archive_repo_code, content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(content)
print("Successfully fixed archiveRepo in background.js")
