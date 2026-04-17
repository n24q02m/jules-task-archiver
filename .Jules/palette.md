## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-18 - Visual Feedback for Async Operations
**Learning:** Users lack confidence when initiating long-running tasks if the only feedback is a text change (e.g., "Running..."). This can lead to frustration or multiple button clicks.
**Action:** Always add a visual loading indicator (like an animated spinner) alongside text changes for async actions to clearly communicate that the system is actively working.
