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
## 2025-06-25 - Context-Aware Loading States
**Learning:** Using a generic loading indicator (like "⏳ Running...") on the primary action button during asynchronous operations can create user ambiguity, especially in multi-mode interfaces (e.g., Dry Run vs. Run, Archive vs. Suggestions). Users may feel uncertain about which specific action is being processed.
**Action:** Always provide context-aware text during loading/processing states (e.g., "⏳ Dry Running Archive...") that dynamically reflects the user's selected configuration, assuring them the system is performing exactly what they intended.
## 2025-06-25 - Differentiating Loading vs Disabled States
**Learning:** Using the same disabled styling (grayed out) for an active, processing state (e.g., when a button is clicked and waiting for an async operation) makes the UI feel unresponsive and "dead," confusing users about whether the action is actually occurring.
**Action:** Always visually distinguish a loading state from a purely disabled state. If a button is disabled because it is busy (`[aria-busy="true"]`), maintain the primary visual context (like color) but indicate processing (e.g., cursor: wait, partial opacity). Additionally, add subtle interactive feedback like `transform: scale(0.98)` on active states to improve tactile feel.
## 2026-06-06 - Structural Progressive Disclosure Targeting
**Learning:** When using progressive disclosure to hide form inputs, targeting only the direct parent element can leave sibling elements (like structural wrappers, descriptive text, or styling boundaries) visible, causing layout issues and orphaned text. Furthermore, if the controlled section is visually placed above the controlling toggle, hiding the section causes the UI to jump, jarring the user experience.
**Action:** Always target the highest logical structural wrapper (e.g., `.closest('.setting-row')`) rather than just the direct parent. Always position the controlling toggle structurally above the sections it controls to prevent jarring layout shifts when elements are hidden.
## 2026-06-07 - Contextual Helper Text
**Learning:** Adding context-aware helper text (e.g. explaining what an optional field is used for) improves form usability.
**Action:** Always include clear helper text for optional fields, especially when their usage might be ambiguous (e.g., used only for specific checks).
## 2026-10-25 - Dark Mode Contrast and State Transitions
**Learning:** Subtle helper text (like `.hint` or `.version`) and secondary UI elements can easily fail WCAG AA contrast guidelines on dark backgrounds if generic "gray" colors are reused without checking. Additionally, interactive elements without state transitions feel jarring and unresponsive, reducing perceived quality.
**Action:** Always verify color contrast on dark backgrounds using `#94a3b8` or lighter instead of darker grays like `#64748b`. Always add CSS `transition` properties (e.g., `background-color`, `border-color`, `transform`) to interactive elements like buttons to provide smooth, delightful visual feedback.
## 2026-06-09 - Empty State Feedback
**Learning:** When a list or process finishes with zero results, an empty summary container gives no feedback, leaving the user wondering if it actually ran or failed silently.
**Action:** Always provide a helpful empty state message explaining why no results might have occurred, using styles consistent with other hints to offer guidance without showing as an error.
## 2026-06-15 - Use Semantic Fieldsets for Form Grouping
**Learning:** Generic `div` containers and pseudo-labels using `role="group"`, `role="radiogroup"`, and `aria-labelledby` can be entirely avoided by using native `<fieldset>` and `<legend>` elements. This inherently structures grouped form controls (like radio buttons or segmented buttons) for assistive technologies. We can then easily reset browser default `fieldset` styles (`border`, `padding`, `margin`) in CSS.
**Action:** Next time I encounter `div`s with `role="radiogroup"` or `role="group"`, replace them with native `<fieldset>` and style `<legend>` directly instead of managing `aria-labelledby` attributes.
