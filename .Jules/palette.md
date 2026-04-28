## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-05-19 - Loading States for Async Batch Operations
**Learning:** In UIs that trigger long-running background processes (like the `batchexecute` loop), users can feel uncertain if the button only changes text to "Running..." without motion. Text changes alone don't sufficiently communicate "active processing."
**Action:** Always include an animated visual indicator (like a CSS spinner) inside the primary action button during async operations, using flexbox (`display: flex; gap: 8px; align-items: center; justify-content: center;`) to maintain clean alignment with the text label.
