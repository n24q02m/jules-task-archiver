## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2024-05-24 - Prevent Token Leakage via Open Redirects
**Vulnerability:** Fetch calls including sensitive credentials (API tokens) did not restrict redirection. An attacker could exploit an open redirect on a trusted API origin to forward the request—and the `Authorization` header—to an attacker-controlled server.
**Learning:** Standard HTTP clients (like `fetch`) automatically follow redirects and forward headers by default. Sending tokens without disabling redirects creates an exfiltration vector.
**Prevention:** Conditionally set `redirect: 'error'` or `redirect: 'manual'` in fetch options whenever credentials are included in the request.
