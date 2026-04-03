# Jules Task Archiver

**Chrome Extension for bulk operations on Jules tasks via batchexecute API -- archive tasks and start code suggestions at scale.**

[![CI](https://github.com/n24q02m/jules-task-archiver/actions/workflows/ci.yml/badge.svg)](https://github.com/n24q02m/jules-task-archiver/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)
[![semantic-release](https://img.shields.io/badge/semantic--release-conventionalcommits-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

## Features

### Archive Tasks

- **Bulk archive** -- archive all completed tasks for repos with zero open PRs in one click
- **GitHub PR check** -- skips repos with open PRs to avoid archiving active work
- **Force mode** -- skip PR check and archive everything

### Start Suggestions

- **Bulk start** -- start all recommended code suggestions (security, performance, testing, cleanup) across repos
- **Category-aware prompts** -- generates tailored prompts per suggestion category (security fix, performance optimization, test coverage, code cleanup)
- **Config capture** -- observes Jules UI to capture model config and experiment IDs for accurate reproduction

### General

- **Multi-account** -- processes all Jules tabs (`/u/0`, `/u/1`, etc.) automatically
- **Dry run mode** -- preview what would happen without making changes
- **batchexecute API** -- direct HTTP calls, no DOM automation, 10x faster than UI clicks
- **Live progress** -- real-time log and progress bar in popup UI
- **State persistence** -- operation continues even if popup is closed; progress restored on reopen

## Installation

1. Download the latest `jules-task-archiver.zip` from [Releases](../../releases)
2. Extract the zip
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked** and select the extracted folder

## Usage

1. Open one or more `jules.google.com` tabs (supports multiple accounts)
2. Click the extension icon in the toolbar
3. Configure:
   - **Operation** -- Archive Tasks or Start Suggestions
   - **GitHub Owner** -- your GitHub username (for PR checks in archive mode)
   - **GitHub Token** -- optional, for private repos
   - **Mode** -- Dry Run (preview) or Run (execute)
   - **Force** -- skip PR check (archive mode only)
   - **Scope** -- current tab only or all Jules tabs
4. Click **Start**

### Start Suggestions tips

- For best results, manually click "Start" on any suggestion in the Jules UI first -- the extension captures the model config and experiment IDs from that request
- Without this capture, the extension uses sensible defaults that may differ from Jules' current configuration

## How It Works

### v2 Architecture

```
popup.js (UI) <-> background.js (batchexecute client) <-> content.js (message relay)
                        |                                        |
                  fetch() to jules.google.com          main-world.js (MAIN world)
                  /_/Swebot/data/batchexecute          reads WIZ_global_data tokens
```

1. `main-world.js` runs in the page's MAIN world, reads auth tokens from `WIZ_global_data`, and observes fetch calls for StartSuggestion config
2. `content.js` relays tokens and config to the background service worker
3. `background.js` makes direct HTTP calls to Jules' batchexecute API endpoint
4. `popup.js` displays real-time progress and manages settings

### RPC IDs

| RPC | ID | Purpose |
|-----|-----|---------|
| ListTasks | `p1Takd` | Fetch all active tasks |
| ArchiveTask | `Tjmm5c` | Archive a single task |
| ListSuggestions | `hQP40d` | Fetch code suggestions for a repo |
| StartSuggestion | `Rja83d` | Start a suggestion as a new task |

## Permissions

| Permission | Why |
|-----------|-----|
| `storage` | Save settings and operation state |
| `tabs` | Query all Jules tabs for multi-account support |
| `scripting` | Inject content script into pre-existing tabs |
| `jules.google.com` | Content script for token extraction |
| `api.github.com` | Check open PRs via GitHub REST API |

## Development

```bash
# Lint and format
npx @biomejs/biome check .
npx @biomejs/biome check --write .

# Run tests
node --test

# Load unpacked in chrome://extensions for testing
```

No build step, no dependencies. Pure vanilla JavaScript with `node:test` for unit tests.

## Related Projects

Check out these MCP servers for AI-powered development:

- [wet-mcp](https://github.com/n24q02m/wet-mcp) -- Web search, extract, and media MCP server
- [better-notion-mcp](https://github.com/n24q02m/better-notion-mcp) -- Notion API MCP server
- [mnemo-mcp](https://github.com/n24q02m/mnemo-mcp) -- Persistent AI memory MCP server

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
