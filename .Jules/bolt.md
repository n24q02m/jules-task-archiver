## 2025-04-05 - Robust Communication with Retries
**Learning:** When implementing retry logic for asynchronous Chrome APIs (like `chrome.tabs.sendMessage`), it's crucial to handle different failure modes: (1) content script not injected, (2) temporary network/context issues, and (3) permanent security errors.
**Action:** Use a helper like `sendToTab` that centralizes injection logic and exponential backoff, while failing fast on security-related exceptions to avoid infinite loops or unnecessary delays.
