## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2026-06-05 - Weak random number generation in background.js
**Vulnerability:** Used `Math.random()` to generate jitter delay during backoff retry loops. This is a weak PRNG which is generally discouraged by static analysis tools for security contexts, even when used merely for jitter.
**Learning:** Browser extension linting and security scanning tools often strictly flag any usage of `Math.random()` in background scripts as a potential weakness.
**Prevention:** Always use `crypto.getRandomValues()` for generating random numbers in browser extensions, regardless of the cryptographical necessity of the randomness. Convert the `Uint32Array` output to a float by dividing by 4294967296.
