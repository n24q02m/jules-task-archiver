## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-23 - Async Background Operations Feedback
**Learning:** For async batch operations where the action spans multiple states or times out gracefully, the primary action button needs a clear visual loading indicator inside the button itself rather than just changing text, to reassure the user that a background process is active.
**Action:** Use a flexbox layout (`display: flex; gap: 8px; justify-content: center; align-items: center;`) on the primary action button to easily position a `.spinner` element alongside the "Running..." text, utilizing an animated `currentColor` CSS border for the spinner.
