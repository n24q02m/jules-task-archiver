## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.

## 2025-05-05 - Dynamic Context and Low-Overhead Async UI State
**Learning:** For async operations in multi-mode UI popups under 'no custom CSS' constraints, static button text (e.g., 'Start') fails to communicate specific intent, and introducing traditional loading spinners may require non-trivial CSS or SVG elements.
**Action:** Use context-aware dynamic text (e.g., 'Start Archiving' vs 'Start Suggestions') and visually indicate background activity using native emojis (e.g., '⏳ Running...') combined with `aria-busy="true"` to improve usability and accessibility without adding new CSS classes.
