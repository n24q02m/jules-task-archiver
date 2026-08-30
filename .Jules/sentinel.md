## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2024-05-14 - Prevent Token Leakage via Open Redirects
**Vulnerability:** Fetch requests sending sensitive tokens (e.g., GitHub tokens) could accidentally leak the token if the target URL responds with a 3xx redirect to an untrusted cross-origin domain, because `fetch` follows redirects by default.
**Learning:** We must not implicitly trust all endpoints when sending sensitive headers. The `fetch` API doesn't strip `Authorization` headers when automatically following redirects across origins.
**Prevention:** Conditionally set `redirect: 'error'` or `redirect: 'manual'` in fetch options whenever transmitting sensitive credentials (e.g., API tokens).
