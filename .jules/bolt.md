## $(date +%Y-%m-%d) - [PERF] Redundant Async Storage I/O in Tab Processing Loop

**Learning:** Repeatedly fetching configuration from `chrome.storage` inside a loop (especially one that processes multiple tabs/accounts) introduces unnecessary latency and redundant asynchronous calls. `chrome.storage` is asynchronous and can be a bottleneck when called hundreds of times.

**Action:** Hoist storage reads to the highest possible level in the call chain (e.g., `startOperation`) and pass the configuration down through function arguments (options objects). This reduces the total number of storage I/O operations to a constant number (O(1)) regardless of the number of items being processed.
