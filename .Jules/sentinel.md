## 2024-07-18 - Restrict Content Security Policy
**Vulnerability:** The extension's Content Security Policy (CSP) in `manifest.json` lacked explicit `default-src 'none'` and broad network constraints, relying solely on script and object restrictions.
**Learning:** A permissive CSP allows unexpected resource loading and potential data exfiltration if an XSS vulnerability occurs. A strict whitelist (`default-src 'none'`) provides a robust defense-in-depth layer.
**Prevention:** Always define a strict CSP for extensions, setting `default-src 'none'` and explicitly allowing only required origins (e.g., `connect-src`).

## 2024-07-25 - Add Input Validation and Enter Key Submission to Popup
**Vulnerability:** The popup form inputs bypassed native HTML5 validation constraints (`pattern`, `maxlength`) because the primary submit button was not inside a semantic `<form>`, allowing potentially invalid strings to be processed.
**Learning:** When form elements cannot be wrapped in a `<form>` to avoid layout breakage, native validation must be enforced manually via `.reportValidity()` during the click handler, and implicit 'Enter' key submission restored via a `keydown` listener, to prevent invalid user data injection.
**Prevention:** Always ensure input validation is triggered, either implicitly via `<form>` wrapping or explicitly via JavaScript `.reportValidity()`, before processing user inputs.
