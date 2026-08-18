## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2026-08-18 - Prevent Token Leakage via Open Redirects
**Vulnerability:** The `jFetch` network wrapper transmitted sensitive GitHub tokens (`Authorization: token ...`) without explicitly disabling redirect following.
**Learning:** While modern browsers strip `Authorization` headers on cross-origin redirects, relying on implicit or evolving browser behavior for secret protection is risky. If an API endpoint is compromised or misconfigured to issue an open redirect, the HTTP client may automatically follow it, creating a risk of token exfiltration.
**Prevention:** Always set `redirect: 'error'` (or `'manual'`) in `fetch` options when transmitting sensitive credentials like Bearer tokens or API keys to explicitly instruct the client to abort on unexpected redirects.
