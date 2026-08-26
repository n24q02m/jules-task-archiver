## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).

## 2024-07-18 - Prevent Token Leakage on Redirects
**Vulnerability:** Sending tokens (like GitHub PATs) using `fetch` can lead to token leakage if the target endpoint responds with an HTTP redirect, as `fetch` natively follows the redirect and passes the same authorization headers to the new origin.
**Learning:** Open redirects or API changes can inadvertently route sensitive credentials to third parties when using standard network wrappers.
**Prevention:** When sending sensitive credentials in `fetch` headers, explicitly set `redirect: 'error'` or `redirect: 'manual'` in the options to prevent automatic forwarding of the headers cross-origin.
