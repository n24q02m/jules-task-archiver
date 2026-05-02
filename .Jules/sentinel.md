
## 2026-05-02 - Fix Cross-World postMessage Vulnerability
**Vulnerability:** The `window.postMessage` calls in `content.js` and `main-world.js` used the wildcard origin `'*'` and lacked `event.origin` validation in their message event listeners. This allowed any malicious iframe or window to intercept sensitive tokens (like `WIZ_global_data`) or inject spoofed configuration messages.
**Learning:** Cross-world communication between isolated and main worlds is a common pattern in Chrome extensions, but relying solely on `event.source === window` is insufficient if the target origin is `'*'`, as it broadcasts to all frames.
**Prevention:** Always specify an exact target origin (e.g., `window.origin`) when calling `window.postMessage` for sensitive data, and explicitly validate `event.origin === window.origin` in all `message` event listeners.
