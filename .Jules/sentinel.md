## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2024-09-09 - Prevent Token Leakage via Open Redirects in Fetch Wrappers
**Vulnerability:** The standard `jFetch` wrapper handles transmitting GitHub API tokens (secrets) via headers. By default, `fetch()` transparently follows redirects. If an attacker could induce a redirect to a malicious third-party origin (e.g. via an open redirect vulnerability in the API), the fetch client would automatically forward the `Authorization: token ...` header to the attacker-controlled origin.
**Learning:** Network wrappers transmitting sensitive credentials like API tokens must defensively account for open redirects. The fetch API provides `redirect: 'error'` or `redirect: 'manual'` to halt transparent redirection.
**Prevention:** Always conditionally enforce `redirect: 'error'` on fetch requests when a token or sensitive credential is included.
