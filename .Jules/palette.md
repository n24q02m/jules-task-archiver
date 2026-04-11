## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-11 - Accessible Radio Groups
**Learning:** When native `<fieldset>` elements are replaced by custom `<div>` containers for layout or styling reasons, they lose implicit accessibility semantics, which can make radio groups difficult to navigate for screen reader users.
**Action:** Always add `role="radiogroup"` and an appropriate `aria-label` attribute to these container elements to restore the correct semantic meaning and labeling.
