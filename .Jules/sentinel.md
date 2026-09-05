## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2025-02-18 - Fix token leakage via open redirects
**Vulnerability:** The fetch wrapper `jFetch` was appending an authorization token when requested but allowing automatic redirects (`redirect: 'follow'` by default in `fetch`). An attacker could compromise a whitelisted API endpoint, causing it to redirect to a malicious origin. The browser would automatically follow the redirect, sending the sensitive authorization header to the attacker.
**Learning:** Always assume whitelisted API endpoints might be compromised or misconfigured to act as open redirects. The browser's default `fetch` behavior will transparently forward authorization headers to the redirect target.
**Prevention:** When sending sensitive credentials (like API tokens) via `fetch`, conditionally set the `redirect` option to `'error'` or `'manual'` to prevent the browser from transparently leaking the headers cross-origin.
