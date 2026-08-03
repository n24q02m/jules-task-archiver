## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2024-07-25 - Replace Math.random with crypto.getRandomValues
**Vulnerability:** Use of `Math.random()` triggers weak random number generation warnings from SAST tools in browser extensions, even for non-cryptographic purposes like backoff jitter.
**Learning:** Security scanners flag `Math.random()` because it is not cryptographically secure.
**Prevention:** Always prefer `crypto.getRandomValues()` over `Math.random()` for all randomization in browser extensions to avoid security tool warnings.
