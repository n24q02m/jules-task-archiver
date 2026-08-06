## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2024-07-25 - Prevent Weak Randomness Warnings
**Vulnerability:** Weak random number generation warning from security scanners due to using `Math.random()` for backoff jitter.
**Learning:** Even for non-cryptographic purposes like backoff jitter, `Math.random()` is often flagged by SAST tools in browser extensions. Replacing it prevents false positives and ensures a baseline level of cryptographic safety.
**Prevention:** Prefer `crypto.getRandomValues()` over `Math.random()` in browser extensions, using `crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296` for an equivalent `[0, 1)` range.
