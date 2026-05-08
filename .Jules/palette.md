## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.

## 2025-04-03 - Contextual Input Configurations and Visual Resets
**Learning:** Browser spellchecking on technical inputs (like GitHub usernames and API tokens) creates distracting red squiggly lines that detract from the UI, while missing autocomplete attributes prevent smooth credential entry. Additionally, persistent error states (like a red progress bar) that don't clear when a new operation starts create visual confusion.
**Action:** Explicitly add `spellcheck="false"` and appropriate `autocomplete` attributes (`username`, `current-password`) to technical inputs. Always ensure transient error-state visual indicators are explicitly reset when user action initiates a new flow.