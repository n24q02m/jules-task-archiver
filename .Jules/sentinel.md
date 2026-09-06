## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).

## 2026-09-06 - Prevent Credential Leakage via Open Redirects
**Vulnerability:** Fetch calls including sensitive tokens (like GitHub API keys) were susceptible to token leakage if the initial request was redirected to a malicious third-party origin.
**Learning:** Native `fetch` follows redirects transparently, including passing custom `Authorization` headers to the new origin, creating a cross-origin token leak vector.
**Prevention:** Always enforce `redirect: 'error'` or `'manual'` in network wrappers when injecting sensitive credentials to prevent accidental token transmission to unverified redirect targets.
