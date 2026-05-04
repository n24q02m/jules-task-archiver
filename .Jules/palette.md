## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-05-04 - Context-Aware Async UI Feedback
**Learning:** For async operations in UI popups under 'no custom CSS' constraints, use context-aware dynamic text (e.g., 'Start Archiving' vs 'Start Suggestions') and visually indicate background activity using native emojis (e.g., '⏳ Running...') combined with `aria-busy="true"` to improve usability and accessibility without adding new CSS classes.
**Action:** Update the UI label text according to the selected mode rather than showing a generic 'Start'. Integrate `aria-busy="true"` correctly across states (running, idle, complete, error).
