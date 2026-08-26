## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2025-02-24 - Prevent Token Leakage via Open Redirects
**Vulnerability:** Fetch requests that send sensitive credentials (like GitHub API tokens) were using the default `redirect: 'follow'` behavior. If an endpoint is compromised or acts as an open redirect, the browser transparently forwards the authorization header to the attacker-controlled origin.
**Learning:** Browsers implicitly follow HTTP redirects and carry over headers, which can leak secrets to untrusted domains.
**Prevention:** Conditionally set `redirect: 'error'` or `redirect: 'manual'` in fetch options whenever credentials are included to prevent cross-origin leaks.
