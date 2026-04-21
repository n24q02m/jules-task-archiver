## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-21 - Visual Feedback for Async Popups
**Learning:** For async batch operations in UI popups, users may experience uncertainty or assume the process has stalled if the primary action button simply changes text to "Running..." without any visual activity indicator.
**Action:** Always visually indicate background activity by adding an animated loading spinner (e.g., `<span class="spinner" aria-hidden="true"></span>`) inside the primary action button, utilizing a flexbox layout (`display: flex; gap: 8px; justify-content: center; align-items: center;`) alongside the loading text. This provides immediate, continuous feedback during long-running tasks.
