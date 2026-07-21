## 2025-02-24 - Map Lookup and Loop Overhead in Hot Paths
**Learning:** In performance-critical hot paths (like parsing and grouping thousands of tasks), using `for...of` loops and array iteration methods like `.some()` introduces measurable closure allocation and iteration overhead. Similarly, a double Map lookup using `map.has(key)` followed by `map.set(key, [])` or `map.get(key)` requires two hashing operations.
**Action:** Replace array methods (`.some()`, `.forEach()`) and `for...of` loops with standard `for` loops in high-frequency functions. For map insertion/grouping, use a single `map.get(key)` lookup, check for `undefined`, and then assign to reduce hashing overhead.
## 2024-05-18 - Avoid replacing string with Regex

**Learning:** Replacing complex nested regular expressions with a single-pass `for` loop state machine using `charCodeAt()` avoids large intermediate string allocations and iteration overhead, providing massive speedups for large text payloads.
**Action:** Replace regular expressions string operations on large strings with a simple pass-through.
