## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-20 - Adding Loading Spinners to Async Batch Operations
**Learning:** For async batch operations in UI popups, visually indicating background activity is important for providing immediate feedback. Using a loading spinner (`<span class="spinner" aria-hidden="true"></span>`) inside the primary action button, along with text like 'Running...', helps users understand that an operation is in progress without creating a jarring layout shift.
**Action:** Always utilize a flexbox layout (`display: flex; gap: 8px; justify-content: center; align-items: center;`) on the button alongside the loading text for smooth visual alignment.
