## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-03 - Accessible Custom Radio Groups
**Learning:** When using custom `div` wrappers (like `.radio-group`) instead of semantic `<fieldset>` elements to preserve CSS styling, screen readers lose the context that the contained radio buttons belong to a cohesive group.
**Action:** Always add `role="radiogroup"` and an appropriate `aria-label` to custom radio group containers to ensure structural accessibility is maintained without sacrificing visual design.
