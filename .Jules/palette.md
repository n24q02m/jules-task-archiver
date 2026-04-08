## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2025-04-08 - Accessible Forms and Radio Groups
**Learning:** Inputs with inline text hints (like "(optional)") are not automatically read by screen readers unless explicitly linked, and standalone groups of radio buttons lack context without grouping roles.
**Action:** Use `aria-describedby` to link inputs with their descriptive text hints. Wrap related radio buttons in a container with `role="radiogroup"` and a descriptive `aria-label` to provide context.
