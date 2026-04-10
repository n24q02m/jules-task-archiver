import sys

file_path = 'background.js'
with open(file_path, 'r') as f:
    lines = f.readlines()

# Re-read to get the original state
with open(file_path, 'r') as f:
    content = f.read()

# Helper function to find function index
def find_line_index(lines, search_str):
    for i, line in enumerate(lines):
        if search_str in line:
            return i
    return -1

# Identify the target areas
idx_archive_task = find_line_index(lines, 'async function archiveTask')
idx_suggestion_ops = find_line_index(lines, 'Suggestion Operations')

if idx_archive_task != -1 and idx_suggestion_ops != -1:
    # 1. Insert archiveRepo after archiveTask
    new_archive_repo = [
        '\n',
        '/**\n',
        ' * Archives tasks for a single repository sequentially.\n',
        ' * Used by processTab to parallelize across repositories.\n',
        ' */\n',
        'async function archiveRepo(repo, repoTasks, config, label) {\n',
        '  addLog(`\\n[${label}] -> ${repo} (${repoTasks.length} tasks)`)\n',
        '  let repoGrandTotal = 0\n',
        '\n',
        '  for (const task of repoTasks) {\n',
        '    if (state.status === "cancelled") break\n',
        '    try {\n',
        '      await archiveTask(task.id, config)\n',
        '      repoGrandTotal++\n',
        '      state.progress.archived++\n',
        '      addLog(`  [${repo}] Archived: [${task.id}] ${task.title}`)\n',
        '\n',
        '      updateState({\n',
        '        progress: {\n',
        '          archived: state.progress.archived,\n',
        '          skipped: state.progress.skipped,\n',
        '          total: state.progress.total\n',
        '        }\n',
        '      })\n',
        '    } catch (e) {\n',
        '      addLog(`  [${repo}] ERROR archiving ${task.id}: ${e.message}`)\n',
        '    }\n',
        '  }\n',
        '  return repoGrandTotal\n',
        '}\n'
    ]

    # Locate archiveTask's end
    end_archive_task = idx_archive_task + 1
    while end_archive_task < len(lines) and '}' not in lines[end_archive_task]:
        end_archive_task += 1
    end_archive_task += 1

    # 2. Update processTab
    # We'll use the replace_script approach here for processTab

    # Reconstruct lines
    # (Actually it's easier to just overwrite everything from scratch or use robust string replacement)
    pass

# String-based replacement is safer if we know the unique markers
import re

# Clean up any potential duplicates first (from failed previous attempts)
content = re.sub(r'async function archiveRepo\(repo, repoTasks, config, label\) \{.*?\}\n', '', content, flags=re.DOTALL)

# 1. Add archiveRepo helper
archive_task_end_pattern = r'(async function archiveTask\(taskId, config\) \{.*?\}\n)'
archive_repo_code = '''
/**
 * Archives tasks for a single repository sequentially.
 * Used by processTab to parallelize across repositories.
 */
async function archiveRepo(repo, repoTasks, config, label) {
  addLog(`\\n[${label}] -> ${repo} (${repoTasks.length} tasks)`)
  let repoGrandTotal = 0

  for (const task of repoTasks) {
    if (state.status === "cancelled") break
    try {
      await archiveTask(task.id, config)
      repoGrandTotal++
      state.progress.archived++
      addLog(`  [${repo}] Archived: [${task.id}] ${task.title}`)

      updateState({
        progress: {
          archived: state.progress.archived,
          skipped: state.progress.skipped,
          total: state.progress.total
        }
      })
    } catch (e) {
      addLog(`  [${repo}] ERROR archiving ${task.id}: ${e.message}`)
    }
  }
  return repoGrandTotal
}
'''

content = re.sub(archive_task_end_pattern, r'\1' + archive_repo_code, content)

# 2. Update processTab
process_tab_search = r'  for \(const \[repo, repoTasks\] of archiveByRepo\) \{.*?  \}\n\n  addLog\(`\\n\[\$\{label\}\] TOTAL: \$\{grandTotal\} archived`\)'
process_tab_replace = r'''  // ⚡ Bolt Optimization: Parallelize across different repositories
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

# We need to be careful with the search pattern as it might contain variables
# Let's find the group toArchive by repo block
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
    print("Warning: search_block for processTab not found")

with open(file_path, 'w') as f:
    f.write(content)
