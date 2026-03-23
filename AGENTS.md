# Jules Task Archiver

Chrome Extension (Manifest V3) to bulk-archive completed Jules tasks.

## Build & Lint

```bash
npx @biomejs/biome check .         # Lint + format check
npx @biomejs/biome check --write .  # Auto-fix
```

No build step, no dependencies, no test framework.

## Structure

- `manifest.json` — Extension config (permissions, content_scripts, action)
- `background.js` — Service worker: orchestrator, GitHub API, state management
- `content.js` — Content script: DOM automation on jules.google.com
- `popup.html/js/css` — Popup UI: settings, controls, progress display
- `icons/` — Extension icons (16/48/128px)

## Key Patterns

- DOM selectors in `SEL` object (content.js) — update when Jules UI changes
- Timing constants in `TIMING` object (content.js)
- Batch archive: process N tasks, re-navigate via sidebar, repeat
- Index tracking: keep index on archive success (task disappears), increment on skip
- Service worker keepAlive: `setInterval` + `chrome.runtime.getPlatformInfo()` every 25s
- State in `chrome.storage.session` — survives SW restart

## Commit Convention

Only `feat:` and `fix:` prefixes allowed (+ `chore(release):` by PSR).
