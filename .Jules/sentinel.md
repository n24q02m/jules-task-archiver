## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).

## 2024-07-25 - Prevent Token Leakage in Fetch wrapper
**Vulnerability:** The internal `jFetch` wrapper attaches sensitive credentials (like GitHub tokens) to requests but relies on standard `fetch` which follows HTTP redirects transparently by default. This could leak tokens to a 3rd party if the API endpoint issued an unexpected redirect.
**Learning:** Adding token headers to network requests is risky if the underlying transport blindly follows cross-origin redirects.
**Prevention:** Conditionally set `redirect: 'error'` or `redirect: 'manual'` in fetch options whenever transmitting sensitive headers.
