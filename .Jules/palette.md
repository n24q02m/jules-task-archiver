## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-05-08 - Transient Error State Visuals & Input Noise
**Learning:** Error state visual indicators (like turning a progress bar red) must be explicitly cleared when the user initiates a new operation. Failing to do so carries over the negative visual feedback, causing immediate anxiety on retry. Additionally, browsers aggressively spellcheck technical inputs (like GitHub usernames and tokens), adding distracting visual noise.
**Action:** Always verify that state reset functions clear *all* dynamically applied error styles, not just structural changes like width or text. Apply `spellcheck="false"` to non-prose inputs.
## 2025-05-22 - Dynamic Action Button Context
**Learning:** Using static text (e.g., 'Start Archiving') on a primary action button when multiple execution modes (e.g., 'Run' vs 'Dry Run') are available creates ambiguity and hesitation for the user. They may be unsure if clicking the button will actually modify data or just simulate the process.
**Action:** Always implement context-aware dynamic text for primary action buttons that reflects both the operation type and the execution mode (e.g., 'Dry Run Archive' vs 'Start Archiving'). Attach event listeners to the mode selection inputs to update this text immediately when the user changes settings, ensuring clear, real-time feedback on what the primary action will do.
## 2025-06-15 - Inaccessible Tooltips on Form Controls
**Learning:** Using native HTML `title` attributes for hints on form controls (like checkboxes) creates significant accessibility barriers. They are completely inaccessible on touch devices and often skipped or read unreliably by screen readers compared to explicitly linked text.
**Action:** Always replace `title` attributes with visible, inline helper text (e.g., `<span class="hint">`) and link it directly to the input field using `aria-describedby` so the hint is always discoverable and correctly announced by assistive technologies.
## 2025-06-16 - Explicit Labels for Radio Groups
**Learning:** Using invisible `aria-label`s on form control groups (like radio groups) when visual context is needed can cause confusion for sighted users.
**Action:** Always provide explicit, visible `<label>` elements and link them directly to the group via `aria-labelledby` (e.g., `<label id="modeLabel">...` and `<div role="radiogroup" aria-labelledby="modeLabel">`) to ensure a clear visual and semantic hierarchy.
