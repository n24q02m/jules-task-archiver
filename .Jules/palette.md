## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-26 - Loading Spinners in Extension Popups
**Learning:** For asynchronous operations triggered by users in a popup, changing button text (e.g. to "Running...") is often insufficient visual feedback. Without an animated indicator, users might think the extension is frozen.
**Action:** Always include an animated loading spinner (`.spinner`) using CSS keyframes and a flexbox layout alongside the text to clearly indicate that a background process is active.
