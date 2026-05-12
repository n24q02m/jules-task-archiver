## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-05-08 - Transient Error State Visuals & Input Noise
**Learning:** Error state visual indicators (like turning a progress bar red) must be explicitly cleared when the user initiates a new operation. Failing to do so carries over the negative visual feedback, causing immediate anxiety on retry. Additionally, browsers aggressively spellcheck technical inputs (like GitHub usernames and tokens), adding distracting visual noise.
**Action:** Always verify that state reset functions clear *all* dynamically applied error styles, not just structural changes like width or text. Apply `spellcheck="false"` to non-prose inputs.
## 2025-05-18 - Input Helper Text Accessibility
**Learning:** Screen readers won't automatically read supplemental helper text (like "optional, for private repos") next to inputs unless explicitly linked.
**Action:** Always link visual hint text to input fields using `aria-describedby` (referencing the hint element's ID) to ensure screen reader users get the full context when focusing the input.

## 2025-05-18 - Keyboard Focus Flow on Hidden Elements
**Learning:** When hiding a currently focused element (e.g., hiding a reset button after clicking it via `display: none`), keyboard focus defaults back to the document body, breaking the user's navigation flow.
**Action:** When programmatically hiding an active element, always explicitly shift focus to the next logical element (e.g., `element.focus()`) to maintain keyboard accessibility.
