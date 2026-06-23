## 2025-05-14 - Redundant Session Storage Read Optimization
**Learning:** Repetitive async reads from `chrome.storage.session` in tight loops or parallel account processing add unnecessary overhead, especially since the configuration is unlikely to change during a single operation run.
**Action:** Cache storage-backed configuration in a local variable within the service worker. Invalidate the cache explicitly via message handlers (`RESET`, `CACHE_START_CONFIG`) or at the start of a fresh operation to ensure data consistency without sacrificing performance.
