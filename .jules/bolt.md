## 2026-06-29 - Redundant Session Storage Read Optimization
**Learning:** Repetitive asynchronous reads from `chrome.storage.session` in a processing loop (like tab processing) can be a bottleneck. Caching the value in a local variable for the duration of the operation significantly reduces overhead.
**Action:** Always implement a local cache for storage-backed configurations that are stable during a batch operation, and ensure proper invalidation on configuration updates or operation resets.
