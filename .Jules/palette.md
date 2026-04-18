## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2026-04-18 - Visual Feedback for Async Operations
**Learning:** The UI lacked clear visual feedback during long-running background batch processes beyond text changes, making it seem unresponsive. Users need visual cues (like a spinner) to indicate active background processing in popup interfaces.
**Action:** For async batch operations in UI popups, visually indicate background activity by adding an animated loading spinner (`<span class="spinner" aria-hidden="true"></span>`) inside the primary action button, utilizing a flexbox layout (`display: flex; gap: 8px;`) alongside the loading text (e.g., 'Running...').
