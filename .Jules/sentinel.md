## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).

## 2024-08-29 - Prevent Token Leakage via Open Redirects
**Vulnerability:** `fetch` by default follows HTTP redirects. When an `Authorization` header is present, following a cross-origin redirect can leak the sensitive token to a third-party server.
**Learning:** The native `fetch` API does not automatically strip `Authorization` headers during cross-origin redirects.
**Prevention:** Always set `redirect: 'error'` or `redirect: 'manual'` in fetch options when transmitting sensitive credentials.
