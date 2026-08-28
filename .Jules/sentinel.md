## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2024-08-28 - Prevent Token Leakage via Open Redirects
**Vulnerability:** Network wrappers transmitting sensitive credentials like API tokens can leak them via cross-origin open redirects if automatic HTTP redirects are followed.
**Learning:** Conditionally setting `redirect: 'error'` or `redirect: 'manual'` in fetch options when credentials are provided prevents token leakage without breaking legitimate endpoints.
**Prevention:** Always conditionally set `redirect: 'error'` or `redirect: 'manual'` in fetch options when credentials are provided to prevent open redirect SSRF.
