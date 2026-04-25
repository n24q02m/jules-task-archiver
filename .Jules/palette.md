## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.## 2025-04-25 - CSS Spinner Best Practices
**Learning:** Adding custom CSS animations like `@keyframes spin` in a plain CSS project requires manual class implementation since no utility frameworks (like Tailwind) are available.
**Action:** Use standard flexbox properties (`display: flex; gap: 8px; align-items: center; justify-content: center;`) alongside the `aria-hidden="true"` spinner span to ensure the button contents remain cleanly aligned during dynamic state changes without breaking accessibility.
