## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2024-05-03 - Context-Aware Loading States & Native Emojis
**Learning:** For async operations in UI popups under "no custom CSS" constraints, using context-aware dynamic text (e.g., "Start Archiving" vs "Start Suggestions") and visually indicating background activity using native emojis (e.g., "⏳ Running...") combined with `aria-busy="true"` improves usability and accessibility significantly without the need to define new custom CSS spinner classes.
**Action:** Use context-specific dynamic text for buttons in multi-mode UI and leverage native emojis alongside `aria-busy="true"` to indicate loading/running states cleanly when custom CSS additions are discouraged.
