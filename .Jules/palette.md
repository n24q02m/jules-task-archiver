## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-05 - Clipped Focus Rings in Overflow Containers
**Learning:** Elements inside containers with `overflow: hidden` will have their default focus rings clipped.
**Action:** To maintain keyboard accessibility, apply a negative outline offset (e.g., `outline-offset: -2px;`) to the child element's `:focus-visible` state.
