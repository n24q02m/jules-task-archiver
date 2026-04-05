
## 2026-04-05 - Insecure Content Script Injection & URL Parsing Robustness
**Vulnerability:** Insecure Content Script Injection and potential Denial of Service via unhandled URL parsing exceptions.
**Learning:** Programmatic script injection must verify the target tab's origin twice (before and immediately after any async operations) to prevent TOCTOU (Time-of-Check to Time-of-Use) attacks. Additionally, using the `URL` constructor on untrusted or empty strings without try/catch can crash the service worker.
**Prevention:** Use a dedicated `checkOrigin` helper that wraps origin verification in a try/catch. Extract and use constants for allowed origins and URL patterns. Prefer robust regex-based extraction for simple path parameters like account IDs to handle edge cases where full URL parsing might fail.
