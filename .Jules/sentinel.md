## 2025-05-14 - Robust Tab Label Parsing
**Vulnerability:** The 'extractAccountNum' function was directly calling 'new URL(url)' without error handling, which could lead to service worker crashes if an invalid URL (e.g. empty string or malformed data) was passed to 'getTabLabel'.
**Learning:** In extension service workers, unhandled exceptions in utility functions can cause the background process to crash, resulting in a Denial of Service for the extension's operations.
**Prevention:** Always wrap URL parsing and other potentially failing native API calls in try/catch blocks, especially when they process data from external or dynamic sources like tab objects, and provide safe fallback values.
