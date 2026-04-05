## 2024-05-24 - Testing extension UI in Node.js
**Learning:** Testing Chrome Extension popups without a real browser can be done by mocking the DOM and `chrome` APIs in a `node:vm` sandbox.
**Action:** Use a robust `createMockElement` helper that supports basic tree structure and common DOM properties (`classList`, `style`, `textContent`) to avoid "Maximum call stack" errors or missing properties.
