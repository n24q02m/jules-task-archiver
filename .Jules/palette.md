## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-30 - Contextual Button States
**Learning:** Using generic verbs like "Start" on buttons can be ambiguous in multi-mode interfaces. Enhancing the text with the current context (e.g., "Start Archiving" vs "Start Suggestions") and using `aria-busy` combined with a visual cue (like an hourglass emoji `⏳`) during processing significantly improves clarity and screen reader accessibility without requiring custom CSS classes.
**Action:** Dynamically update primary action button text to reflect the specific operation mode, and use `aria-busy="true"` with native text/emoji feedback for async loading states to keep changes lightweight and accessible.
