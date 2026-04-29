## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2024-04-29 - Animated Loading Spinners with Flexbox
**Learning:** When adding loading states to UI popup action buttons, replacing block display with flexbox (`display: flex; gap: 8px; align-items: center; justify-content: center;`) allows for an elegant inline placement of an animated spinner span immediately preceding the loading text. Ensure `aria-hidden="true"` is added to the spinner to maintain screen reader clarity.
**Action:** Always prefer inline flexbox loading states for primary action buttons over replacing the entire button text, as it maintains UI layout stability and provides immediate, recognizable visual feedback during async operations.
