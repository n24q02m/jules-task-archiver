## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-12 - ARIA Roles for Custom Radio Groups
**Learning:** When using custom `div` wrappers instead of native `fieldset` elements to group radio buttons (often done to preserve specific CSS layouts), the semantic grouping is lost for screen readers.
**Action:** Always add `role="radiogroup"` and an explicit `aria-label` to the container `div` to restore accessibility and ensure screen reader users understand the context of the radio buttons.
