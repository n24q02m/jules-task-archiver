## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).
## 2024-08-22 - Prevent Token Leakage via Open Redirects
**Vulnerability:** The custom `fetch` wrapper (`jFetch`) sends authorization tokens (like GitHub API keys) to authenticated endpoints but did not restrict the redirect behavior. If an endpoint is vulnerable to an open redirect, the browser could automatically follow it to an attacker-controlled domain, potentially leaking the authorization headers.
**Learning:** By default, `fetch` follows redirects (`redirect: 'follow'`). When implementing network wrappers that transmit sensitive credentials, this default behavior poses a security risk if the destination endpoint cannot be fully trusted to never redirect to malicious origins.
**Prevention:** Explicitly set `redirect: 'error'` or `redirect: 'manual'` in the `fetch` options for requests carrying sensitive credentials. This ensures the request will fail or can be manually inspected rather than automatically leaking headers to arbitrary domains.
## 2024-09-02 - Enforce Strict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` included the `'unsafe-inline'` directive in `style-src`, allowing inline styles which could be a vector for CSS injection attacks.
**Learning:** Removing `'unsafe-inline'` from `style-src` forces all styles to be declared in external stylesheets (or within `<style>` tags with a nonce/hash, which we avoided). This requires a slight refactoring of DOM manipulations: replacing `element.style.xxx = ...` assignments with CSS class toggles (`classList.add/remove/toggle`). When implementing this, corresponding test suites matching on `element.style` must also be updated to test `element.classList.contains()`, and mock element implementations must support methods like `toggle` to prevent regressions. It is also good practice to add `!important` to utility classes meant to forcibly hide elements to prevent accidental overrides.
**Prevention:** Avoid `'unsafe-inline'` in CSP `style-src`. Use CSS classes for state changes and update tests and mocks to reflect this methodology.
## 2026-09-19 - Conditional open redirect protection
**Vulnerability:** Setting `redirect: 'error'` globally for all fetch requests can break legitimate endpoints that rely on standard HTTP redirects.
**Learning:** Only restrict redirects when sensitive credentials (like tokens or cookies) are being transmitted to prevent token leakage via cross-origin open redirects.
**Prevention:** Use a conditional redirect mode based on the presence of credentials.
