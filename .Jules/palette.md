## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.

## 2025-05-08 - Transient Error State Visuals & Input Noise
**Learning:** Error state visual indicators (like turning a progress bar red) must be explicitly cleared when the user initiates a new operation. Failing to do so carries over the negative visual feedback, causing immediate anxiety on retry. Additionally, browsers aggressively spellcheck technical inputs (like GitHub usernames and tokens), adding distracting visual noise.
**Action:** Always verify that state reset functions clear *all* dynamically applied error styles, not just structural changes like width or text. Apply `spellcheck="false"` to non-prose inputs.

## 2025-06-15 - Focus Traps and Accessible Helpers
**Learning:** Hiding an active/focused element via `display: none` (like when clicking a Reset button that immediately hides itself) causes the browser to drop focus to the `<body>`, breaking keyboard navigation flow. Additionally, inline helper text adjacent to inputs is skipped by screen readers unless explicitly linked.
**Action:** Programmatically shift focus to the next logical step (`element.focus()`) when hiding a focused element. Always link helper text to inputs using `aria-describedby` referencing an explicit ID.