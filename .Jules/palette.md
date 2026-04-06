## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.

## 2025-04-06 - Keyboard accessibility in overflow: hidden containers
**Learning:** Elements inside containers with `overflow: hidden` (like the `.segmented` group in `popup.html`) will have their default focus rings clipped if `outline-offset` pushes the outline outside the element bounds.
**Action:** Always apply a negative outline offset (e.g., `outline-offset: -2px;`) to the child element's `:focus-visible` state when its parent uses `overflow: hidden` to ensure the focus ring remains visible for keyboard users.