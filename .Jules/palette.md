## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-03 - Semantic grouping of custom radio buttons
**Learning:** When avoiding native `<fieldset>` tags for styling purposes on radio buttons grouped within divs, the native grouping semantics are lost to screen readers.
**Action:** Always add `role="radiogroup"` and an appropriate `aria-label` to custom wrapper elements for radio groups to maintain accessibility.
