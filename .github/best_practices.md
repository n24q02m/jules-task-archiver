# Jules Task Archiver — Code Review Guidelines

## Architecture

Chrome Extension (Manifest V3) with 3 layers:

- **content.js**: DOM automation on `jules.google.com/*`. Reads repos from sidebar, archives tasks via menu clicks. Uses batch + re-navigate strategy to keep DOM fresh.
- **background.js**: Service worker orchestrator. Handles GitHub API calls, tab management, state persistence in `chrome.storage.session`. Includes keepAlive mechanism to prevent SW termination during operations.
- **popup.js**: UI layer. Reads/writes settings to `chrome.storage.sync`. Displays progress by listening to `chrome.storage.onChanged`.

## Key Patterns

- **Batch archiving**: Archive N tasks, then re-navigate to repo via sidebar click (not page reload) to refresh task list without killing content script.
- **Index tracking**: When archiving, keep index on success (task disappears, next slides in), increment on skip (task stays in DOM).
- **State recovery**: Background SW restores state from `chrome.storage.session` on restart. If interrupted mid-operation, marks as error.
- **Content script injection**: Uses `chrome.scripting.executeScript()` fallback when content script isn't loaded in pre-existing tabs.

## Security

- No `innerHTML` — all DOM construction uses `textContent` + `createElement`
- GitHub tokens stored in `chrome.storage.local` (security over convenience)
- Only communicates with `jules.google.com` and `api.github.com`
- All GitHub API responses treated as untrusted data

## Code Style

- Vanilla JavaScript, no build step, no dependencies
- Biome for linting and formatting
- DOM selectors extracted to `SEL` config object for easy updates if Jules UI changes
- Timing constants in `TIMING` object
