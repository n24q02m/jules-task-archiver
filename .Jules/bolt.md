## 2025-02-24 - Map Lookup and Loop Overhead in Hot Paths
**Learning:** In performance-critical hot paths (like parsing and grouping thousands of tasks), using `for...of` loops and array iteration methods like `.some()` introduces measurable closure allocation and iteration overhead. Similarly, a double Map lookup using `map.has(key)` followed by `map.set(key, [])` or `map.get(key)` requires two hashing operations.
**Action:** Replace array methods (`.some()`, `.forEach()`) and `for...of` loops with standard `for` loops in high-frequency functions. For map insertion/grouping, use a single `map.get(key)` lookup, check for `undefined`, and then assign to reduce hashing overhead.
## 2025-02-24 - Nested Regex vs State Machine
**Learning:** In modern JavaScript engines, adding a redundant `regex.test()` before a `replace(regex, callback)` is a flawed optimization because V8 inherently bypasses the callback if there is no match. Furthermore, replacing complex nested regular expressions with a single-pass `for` loop state machine using `charCodeAt()` avoids large intermediate string allocations and iteration overhead, providing massive speedups for large text payloads.
**Action:** Do not use `regex.test()` to guard a `replace()`. Instead, for critical hot paths parsing large payloads with complex constraints (like finding control characters only inside JSON strings), use a single-pass character loop state machine and `str.slice()` for unmodified chunks.
## 2025-02-25 - Request Coalescing
**Learning:** When fetching external data (like PRs) in parallel across multiple tabs, caching only the *resolved* result leads to thundering herd problems where multiple identical network requests are fired concurrently.
**Action:** Cache the *Promise* of the fetch operation synchronously (request coalescing) so concurrent calls to the same resource wait on the same in-flight network request, saving API quota and time.

## 2024-08-28 - Optimize array trimming in hot path
**Learning:** Calling `.splice(0, n)` to constantly cap a growing array size at max length causes O(N^2) degradation when executed frequently in a hot path because all remaining elements must shift on every insert.
**Action:** Implement a high-water mark buffer `MAX + BUFFER` to batch cleanup operations. The array is only spliced when it significantly exceeds the max length, dramatically reducing CPU overhead.
