## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.

## 2026-04-08 - Semantic Grouping for Custom Radio Groups
**Learning:** Wrapping UI radio groups in custom div containers (instead of native `fieldset`) for styling removes semantic grouping for screen readers.
**Action:** Always add `role="radiogroup"` and a descriptive `aria-label` to custom radio group container `div`s.