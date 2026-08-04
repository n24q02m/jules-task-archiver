## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2026-08-04 - Secure Random Number Generation
**Vulnerability:** Weak random number generation using Math.random() for security-related backoff jitter
**Learning:** Math.random() is predictable and can be flagged by SAST tools even for non-cryptographic purposes like backoff jitter.
**Prevention:** Use crypto.getRandomValues() and emulate the [0, 1) range via (crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) to satisfy security scanners while retaining identical functionality.
