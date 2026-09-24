## 2025-02-24 - Map Lookup and Loop Overhead in Hot Paths
**Learning:** In performance-critical hot paths (like parsing and grouping thousands of tasks), using `for...of` loops and array iteration methods like `.some()` introduces measurable closure allocation and iteration overhead. Similarly, a double Map lookup using `map.has(key)` followed by `map.set(key, [])` or `map.get(key)` requires two hashing operations.
**Action:** Replace array methods (`.some()`, `.forEach()`) and `for...of` loops with standard `for` loops in high-frequency functions. For map insertion/grouping, use a single `map.get(key)` lookup, check for `undefined`, and then assign to reduce hashing overhead.
## 2025-02-24 - Nested Regex vs State Machine
**Learning:** In modern JavaScript engines, adding a redundant `regex.test()` before a `replace(regex, callback)` is a flawed optimization because V8 inherently bypasses the callback if there is no match. Furthermore, replacing complex nested regular expressions with a single-pass `for` loop state machine using `charCodeAt()` avoids large intermediate string allocations and iteration overhead, providing massive speedups for large text payloads.
**Action:** Do not use `regex.test()` to guard a `replace()`. Instead, for critical hot paths parsing large payloads with complex constraints (like finding control characters only inside JSON strings), use a single-pass character loop state machine and `str.slice()` for unmodified chunks.
## 2025-02-25 - Request Coalescing
**Learning:** When fetching external data (like PRs) in parallel across multiple tabs, caching only the *resolved* result leads to thundering herd problems where multiple identical network requests are fired concurrently.
**Action:** Cache the *Promise* of the fetch operation synchronously (request coalescing) so concurrent calls to the same resource wait on the same in-flight network request, saving API quota and time.
## 2026-09-10 - Array Splice High-Water Mark
**Learning:** Frequent `.splice(0, n)` calls on large arrays to enforce a maximum length on every insert cause severe O(N^2) performance degradation due to constant element shifting.
**Action:** Implement a high-water mark buffer (e.g., `if (arr.length > MAX + BUFFER) arr.splice(0, arr.length - MAX)`) to batch cleanup operations and significantly reduce CPU overhead in high-frequency paths.
## 2025-02-25 - API Quota Short-Circuit
**Learning:** Checking quotas or limits *after* executing expensive discovery network requests (e.g., retrieving lists of items to process) results in wasted network calls and latency if the quota was already exhausted.
**Action:** Always fetch quotas and check session limits early in a workflow so the application can short-circuit and avoid O(N) wasteful network calls.
## 2026-09-23 - Array Allocation and Push Overhead
**Learning:** In performance-critical hot paths (like concurrent pool management), using `[].push()` introduces measurable overhead due to dynamic array resizing and closure allocation.
**Action:** When the final array size is known or bounded, pre-allocate the array using `new Array(size)` and assign elements by index (e.g., `pool[i] = drain()`) instead of dynamically pushing them.
## 2025-02-25 - Regex exec vs String split
**Learning:** Using `.split()` for string parsing (like URL pathnames) creates intermediate array allocations that increase GC pressure in high-frequency paths.
**Action:** Use pre-compiled regular expressions with `.exec()` instead of `.split()` to parse structured strings without allocating intermediate arrays.
