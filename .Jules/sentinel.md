## 2024-05-24 - DoS via URL Parsing
**Vulnerability:** Unhandled exceptions in background scripts when parsing URLs can crash the service worker, leading to Denial of Service.
**Learning:** The native `URL` API throws on invalid input. If this happens in a top-level listener or a critical path (like sorting tabs), the extension stops working.
**Prevention:** Always wrap `new URL()` in try/catch blocks when dealing with external or potentially malformed inputs.
