## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-05-01 - Context-Aware Loading States & Native Emoji Attributes
**Learning:** For async operations in UI popups under 'no custom CSS' constraints, using context-aware dynamic text (e.g., 'Start Archiving' vs 'Start Suggestions') rather than generic terms, and visually indicating background activity using native emojis (e.g., '⏳ Running...') combined with `aria-busy="true"` dramatically improves usability and accessibility without requiring any new CSS classes or dependencies.
**Action:** Always implement context-aware button text and use `aria-busy="true"` with native emojis for loading states when custom CSS or spinners are unavailable.
