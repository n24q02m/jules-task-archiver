## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2025-02-27 - Prevent token leakage via cross-origin open redirects
**Vulnerability:** Fetch wrappers sending sensitive authorization headers (like `Authorization: token ...`) could leak the token if the target URL responds with a 3xx redirect to an attacker-controlled origin, as standard HTTP clients follow redirects and re-transmit headers by default.
**Learning:** Open redirects on trusted API domains can be weaponized to steal credentials sent in the initial request.
**Prevention:** When sending sensitive tokens, explicitly set the fetch option `redirect: 'error'` (or `'manual'`) to abort the request if a redirect is encountered, preventing automatic token transmission to unintended destinations.
