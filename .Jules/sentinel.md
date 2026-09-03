## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).

## 2026-08-31 - Prevent token leakage via open redirects
**Vulnerability:** The `jFetch` function attached an authorization token to requests but allowed standard HTTP redirects. If an attacker exploited an open redirect on the API endpoint, the token could be sent to a third-party server.
**Learning:** Fetch APIs follow redirects transparently by default, preserving original headers including `Authorization`. When sending credentials, this can lead to accidental token leakage.
**Prevention:** Always set `redirect: 'error'` (or `manual`) in fetch options when transmitting sensitive credentials to prevent automatic header forwarding to untrusted origins.
