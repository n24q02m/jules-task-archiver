## 2025-04-28 - TOCTOU Vulnerability in Content Script Injection
**Vulnerability:** A Time-of-Check to Time-of-Use (TOCTOU) race condition in `ensureContentScript` permitted content scripts to be injected into an attacker-controlled origin if the tab navigated away from `jules.google.com` after the origin check but before injection.
**Learning:** Using `chrome.tabs.get` to check tab URLs provides no protection against race conditions. Between the check and `executeScript` or `sendMessage`, the tab can load a completely different page.
**Prevention:** Always use `chrome.webNavigation.getFrame` to obtain a `documentId` and use `documentIds` to explicitly pin the script execution and messages to a specific, verified document instance rather than a mutable tab ID.
