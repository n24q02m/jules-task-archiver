## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2026-08-27 - Prevent token leakage via open redirects
**Vulnerability:** The `jFetch` wrapper did not constrain HTTP redirects when sending requests with sensitive credentials (API tokens), making it susceptible to accidental token leakage via cross-origin open redirects.
**Learning:** When implementing network wrappers (e.g., `fetch`) that transmit sensitive credentials like API tokens, conditionally setting `redirect: 'error'` or `redirect: 'manual'` in the fetch options when credentials are provided prevents accidental token leakage via cross-origin open redirects without breaking legitimate API endpoints that rely on standard HTTP redirects.
**Prevention:** Always restrict redirect behavior when sending authorization headers in custom fetch wrappers.
