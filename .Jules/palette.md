## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2024-05-18 - Animated Loading Spinner for Async Actions
**Learning:** Using an animated loading spinner within the primary action button visually indicates background activity and reduces user uncertainty for async operations.
**Action:** Implement `<span class="spinner" aria-hidden="true"></span>` with flexbox layout inside primary buttons during async tasks to provide clear visual feedback without compromising accessibility.
