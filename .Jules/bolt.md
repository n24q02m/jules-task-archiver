## 2025-02-24 - Map Lookup and Loop Overhead in Hot Paths
**Learning:** In performance-critical hot paths (like parsing and grouping thousands of tasks), using `for...of` loops and array iteration methods like `.some()` introduces measurable closure allocation and iteration overhead. Similarly, a double Map lookup using `map.has(key)` followed by `map.set(key, [])` or `map.get(key)` requires two hashing operations.
**Action:** Replace array methods (`.some()`, `.forEach()`) and `for...of` loops with standard `for` loops in high-frequency functions. For map insertion/grouping, use a single `map.get(key)` lookup, check for `undefined`, and then assign to reduce hashing overhead.
## 2026-07-05 - Array Operations Overhead
**Learning:** Combining multiple array operations (filtering, grouping, and state collection) into a single standard for loop significantly improves performance in hot paths by eliminating intermediate array allocations and reducing traversals.
**Action:** When working with arrays in performance-critical sections, avoid chaining multiple methods like .map(), .filter(), and external grouping functions. Instead, consolidate these operations into a single loop.
