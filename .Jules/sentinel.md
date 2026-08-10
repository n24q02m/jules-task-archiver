## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).

## 2026-08-10 - Remove unsafe-inline from Content Security Policy
**Vulnerability:** The Content Security Policy in `manifest.json` allowed `unsafe-inline` for styles, increasing the risk of XSS attacks via CSS injection.
**Learning:** Relying on inline styles requires weakening the CSP, which contradicts the principle of least privilege.
**Prevention:** Move all inline styles to external stylesheets and explicitly remove `'unsafe-inline'` from `style-src` in the CSP.
