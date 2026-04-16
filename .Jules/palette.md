## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-14 - Semantic Grouping for Custom Radio Containers
**Learning:** When using custom `div` elements instead of semantic `<fieldset>` tags for radio button groups (often done to preserve specific CSS layouts), the semantic association of the grouped options is lost for screen reader users, breaking accessibility.
**Action:** Always add `role="radiogroup"` and an appropriate `aria-label` attribute to custom wrapper elements containing related radio inputs to ensure screen readers correctly announce the group context.
