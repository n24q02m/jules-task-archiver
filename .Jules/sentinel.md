## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).

## 2024-07-18 - Prevent Token Leakage via Fetch Redirects
**Vulnerability:** The `jFetch` wrapper allowed fetch to automatically follow redirects while transmitting sensitive tokens (like GitHub API keys), posing a risk of cross-origin token leakage if an API endpoint becomes an open redirect.
**Learning:** By default, `fetch` follows HTTP redirects, resending headers including `Authorization`. If redirected to a malicious origin, credentials are leaked. Setting `redirect: 'error'` (or 'manual') when sending tokens prevents this.
**Prevention:** Conditionally set `redirect: 'error'` on fetch options when injecting sensitive credentials to prevent automatic header transmission across redirects.
