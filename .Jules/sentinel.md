## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).

## 2026-08-21 - Prevent Credential Leakage via Open Redirects
**Vulnerability:** The `jFetch` wrapper sent API tokens in the Authorization header without explicitly disabling redirects. If an endpoint had an open redirect vulnerability, `fetch` would follow it by default and leak the token to the third-party domain.
**Learning:** The default behavior of `fetch` (follow redirects) is dangerous when transmitting credentials. Even if the initial request targets a trusted origin, the final destination can be hijacked.
**Prevention:** Always set `redirect: 'error'` or `redirect: 'manual'` on network requests that transmit sensitive credentials to ensure they aren't silently leaked via unexpected cross-origin redirects.
