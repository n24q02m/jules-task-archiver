## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).

## 2024-05-20 - Prevent token leakage on open redirects
**Vulnerability:** The `jFetch` network wrapper transmitted sensitive credentials (like GitHub API tokens) without restricting redirects, allowing potential token leakage if an API endpoint issued a cross-origin open redirect.
**Learning:** Default `fetch` behavior automatically follows HTTP redirects. Even though browsers strip the `Authorization` header on cross-origin redirects, Node environments or older implementations might not. Explicitly rejecting redirects when sending tokens guarantees safety across all execution environments.
**Prevention:** Explicitly set `redirect: 'error'` or `redirect: 'manual'` in fetch options when transmitting sensitive credentials to prevent automatic redirect following.
