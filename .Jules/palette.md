## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-05-08 - Transient Error State Visuals & Input Noise
**Learning:** Error state visual indicators (like turning a progress bar red) must be explicitly cleared when the user initiates a new operation. Failing to do so carries over the negative visual feedback, causing immediate anxiety on retry. Additionally, browsers aggressively spellcheck technical inputs (like GitHub usernames and tokens), adding distracting visual noise.
**Action:** Always verify that state reset functions clear *all* dynamically applied error styles, not just structural changes like width or text. Apply `spellcheck="false"` to non-prose inputs.
## 2025-05-16 - Screen Reader Hints & Dynamic Focus Management
**Learning:** Supplemental form hints (like "optional, for private repos") are ignored by screen readers if they are just visually adjacent to inputs. Additionally, hiding a focused button (like a "Reset" button after clicking it) drops keyboard focus to the document body, breaking navigation flow.
**Action:** Always link visual hint text to input fields using `aria-describedby` pointing to the hint's ID. When programmatically hiding an interactive element, always manually shift focus to the next logical element (e.g., `.focus()`) to maintain a continuous, accessible keyboard experience.
