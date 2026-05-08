import sys

with open('background.js', 'r') as f:
    lines = f.readlines()

# Find the loop
start_line = -1
for i, line in enumerate(lines):
    if "await Promise.all(" in line and "repoTasks.map" in lines[i+1]:
        start_line = i
        break

if start_line != -1:
    # Find the end of Promise.all
    end_line = -1
    for i in range(start_line, len(lines)):
        if "    )" in lines[i] and i > start_line + 5:
            end_line = i + 1
            break

    if end_line != -1:
        new_loop = [
            "    for (let i = 0; i < repoTasks.length; i += ARCHIVE_CHUNK_SIZE) {\n",
            "      const chunk = repoTasks.slice(i, i + ARCHIVE_CHUNK_SIZE)\n",
            "      const results = await Promise.all(\n",
            "        chunk.map((task) =>\n",
            "          archiveTask(task.id, config)\n",
            "            .then(() => ({ task, ok: true }))\n",
            "            .catch((e) => ({ task, ok: false, error: e.message }))\n",
            "        )\n",
            "      )\n",
            "\n",
            "      for (const res of results) {\n",
            "        if (res.ok) {\n",
            "          grandTotal++\n",
            "          addLog(`  Archived: [${res.task.id}] ${res.task.title}`)\n",
            "\n",
            "          updateState({\n",
            "            progress: {\n",
            "              ...state.progress,\n",
            "              archived: grandTotal,\n",
            "              total: totalTasks\n",
            "            }\n",
            "          })\n",
            "        } else {\n",
            "          addLog(`  ERROR archiving ${res.task.id}: ${res.error}`)\n",
            "        }\n",
            "      }\n",
            "    }\n"
        ]
        lines[start_line:end_line] = new_loop
        with open('background.js', 'w') as f:
            f.writelines(lines)
        print("Successfully updated background.js")
    else:
        print("Failed to find end of Promise.all block")
else:
    print("Failed to find start of Promise.all block")
