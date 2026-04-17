## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2024-05-14 - Add loading spinner to long-running batchexecute operation
**Learning:** In popups that perform API batch operations, simply changing button text to "Running..." without motion isn't enough visual feedback. Users may question whether the application has frozen during long operations, especially if progress logs take time to appear.
**Action:** Always include an animated loading spinner (`aria-hidden="true"`) alongside loading text inside primary action buttons for operations that take more than a second to execute. Ensure the button uses a flex layout (`display: flex; align-items: center; gap: 8px;`) so the text and spinner remain properly aligned.
