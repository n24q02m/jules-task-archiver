## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2024-08-05 - Replace Math.random with crypto.getRandomValues
**Vulnerability:** Weak random number generation using Math.random for security-adjacent purposes or to avoid SAST warnings.
**Learning:** Math.random is not cryptographically secure. Extensions and security linters flag it.
**Prevention:** Use crypto.getRandomValues() even for backoff jitter, normalizing to a float via Uint32Array.
