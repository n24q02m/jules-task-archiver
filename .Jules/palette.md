## 2025-04-03 - Progressive Disclosure for Multi-Mode UIs
**Learning:** In a multi-mode UI (like Archive vs Suggestions), showing all settings at once creates cognitive overload, especially when settings like GitHub tokens are only relevant to one mode.
**Action:** Use progressive disclosure in `popup.js` to hide mode-specific settings (like the `.settings` section and `force` checkbox) when they are not relevant to the currently selected mode, keeping the UI clean and focused.
## 2024-05-15 - Segmented Control Focus Outline Clipping
**Learning:** Containers with `overflow: hidden` (like the `.segmented` wrapper used to create pill-shaped button groups) will visually clip the default browser focus ring (`outline`) on child elements, rendering them invisible to keyboard users and violating accessibility guidelines.
**Action:** Always verify focus rings on interactive elements within clipped containers. Use `outline-offset: -2px;` (or similar negative values) on the child elements' `:focus-visible` state to draw the outline inside the element's bounding box, preventing clipping.
