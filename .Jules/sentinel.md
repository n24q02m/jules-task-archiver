## 2026-04-05 - Insecure Storage of GitHub Token
**Vulnerability:** Sensitive GitHub Personal Access Tokens were stored in `chrome.storage.sync`, which synchronizes data across devices in plain text (within the Google account) and has lower security guarantees than local storage.
**Learning:** Developers often use `sync` storage for all settings for convenience, forgetting that it is inappropriate for sensitive credentials or secrets.
**Prevention:** Always use `chrome.storage.local` for sensitive data like API tokens or passwords in Chrome extensions. Implement migration logic to securely move legacy data from `sync` to `local` and remove the insecure copy.
