# jules-task-archiver

Chrome Extension (Manifest V3) to bulk-archive Jules tasks for repos with no open GitHub PRs.

## Structure

- `manifest.json` -- Extension config: permissions, content_scripts, action
- `background.js` -- Service worker: orchestrator, GitHub API, state management
- `content.js` -- Content script: DOM automation on jules.google.com
- `popup.html/js/css` -- Popup UI: settings, controls, progress display
- `icons/` -- Extension icons (16/48/128px)

## Architecture

```
popup.js (UI) <-> background.js (orchestrator) <-> content.js (DOM worker)
                        |
                chrome.storage.session (state)
                chrome.storage.sync (settings)
```

- Content script handles all DOM operations (lives in tab, no 30s timeout)
- Background SW handles GitHub API + tab coordination (keepAlive during operations)
- Popup is display-only — closing it doesn't interrupt operations

## Key DOM Selectors (in content.js SEL object)

- `a.source-row` -- repo links in sidebar
- `.repo` / `.owner` / `.source-task-count` -- repo info
- `button[aria-label="Task options"]` -- per-task menu trigger
- `button[role="menuitem"]` -- menu items (find "Archive" text)

## Development

```bash
# Lint + format
npx @biomejs/biome check .
npx @biomejs/biome check --write .

# Load extension
# chrome://extensions -> Developer mode -> Load unpacked -> select this folder
```

## Commit Convention

Conventional Commits enforced by pre-commit hook.
Tag format: `v{version}`. PSR config: `semantic-release.toml`.

## CD Pipeline

workflow_dispatch (beta/stable) -> PSR v10 -> zip extension files -> upload to GitHub Release.
No Docker, no npm/pypi, no MCP registry.

## Important Notes

- Zero dependencies — vanilla JS, no build step
- Biome for linting (biome.json config)
- DOM selectors may change when Jules updates UI — update SEL object in content.js
- Batch archive strategy: archive N tasks -> re-navigate to repo via sidebar click -> fresh DOM
- Service worker keepAlive: `setInterval` calling `chrome.runtime.getPlatformInfo()` every 25s
- State persisted in `chrome.storage.session` — survives SW restart
