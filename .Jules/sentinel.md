## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2024-08-22 - Prevent Token Leakage via Open Redirects
**Vulnerability:** The custom `fetch` wrapper (`jFetch`) sends authorization tokens (like GitHub API keys) to authenticated endpoints but did not restrict the redirect behavior. If an endpoint is vulnerable to an open redirect, the browser could automatically follow it to an attacker-controlled domain, potentially leaking the authorization headers.
**Learning:** By default, `fetch` follows redirects (`redirect: 'follow'`). When implementing network wrappers that transmit sensitive credentials, this default behavior poses a security risk if the destination endpoint cannot be fully trusted to never redirect to malicious origins.
**Prevention:** Explicitly set `redirect: 'error'` or `redirect: 'manual'` in the `fetch` options for requests carrying sensitive credentials. This ensures the request will fail or can be manually inspected rather than automatically leaking headers to arbitrary domains.
