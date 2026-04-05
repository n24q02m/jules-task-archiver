# Jules Task Archiver

**Chrome Extension to bulk-archive completed Jules tasks for repos with no open GitHub PRs.**

[![CI](https://github.com/n24q02m/jules-task-archiver/actions/workflows/ci.yml/badge.svg)](https://github.com/n24q02m/jules-task-archiver/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)
[![semantic-release](https://img.shields.io/badge/semantic--release-conventionalcommits-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

## Features

- **Bulk archive** — archive all tasks for repos with zero open PRs in one click
- **Multi-account** — processes all Jules tabs (`/u/0`, `/u/1`, etc.) automatically
- **GitHub PR check** — skips repos with open PRs to avoid archiving active work
- **Dry run mode** — preview which repos would be archived without making changes
- **Force mode** — skip PR check and archive everything
- **Batch processing** — archives in batches with DOM refresh between batches for reliability
- **Live progress** — real-time log and progress bar in popup UI
- **State persistence** — operation continues even if popup is closed; progress restored on reopen

## Installation

1. Download the latest `jules-task-archiver.zip` from [Releases](../../releases)
2. Extract the zip
3. Open `chrome://extensions` in Chrome or Brave
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked** and select the extracted folder

## Usage

1. Open one or more `jules.google.com` tabs (supports multiple accounts)
2. Click the extension icon in the toolbar
3. Configure:
   - **GitHub Owner** — your GitHub username (for PR checks)
   - **GitHub Token** — optional, for private repos (public repos work without it)
   - **Mode** — Dry Run (preview) or Archive (execute)
   - **Force** — skip PR check
   - **Scope** — current tab only or all Jules tabs
4. Click **Start**

## How It Works

1. Finds all open Jules tabs and sorts by account number
2. For each tab, reads the sidebar to find repos with tasks
3. Checks GitHub API for open PRs on each repo
4. For repos with 0 open PRs: clicks into each repo and archives tasks in batches
5. After each batch, re-navigates to the repo to refresh the DOM
6. Reports progress in real-time via the popup UI

## Permissions

| Permission | Why |
|-----------|-----|
| `storage` | Save settings (GitHub owner, token) and operation state |
| `tabs` | Query all Jules tabs for multi-account support |
| `scripting` | Inject content script into pre-existing tabs |
| `jules.google.com` | Content script for DOM automation |
| `api.github.com` | Check open PRs via GitHub REST API |

## Development

```bash
# Lint and format
npx @biomejs/biome check .
npx @biomejs/biome check --write .

# Load unpacked in chrome://extensions for testing
```

No build step, no dependencies. Pure vanilla JavaScript.

## Related Projects

Check out these MCP servers for AI-powered development:

- [wet-mcp](https://github.com/n24q02m/wet-mcp) — Web search, extract, and media MCP server
- [better-notion-mcp](https://github.com/n24q02m/better-notion-mcp) — Notion API MCP server
- [mnemo-mcp](https://github.com/n24q02m/mnemo-mcp) — Persistent AI memory MCP server

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
