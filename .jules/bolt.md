## 2026-06-12 - Prevent Intermediate Array Allocation in `parseTask`

**Learning:** In high-frequency parsing functions that extract strings from delimited formats (like `source` paths), using `String.prototype.split()` needlessly allocates intermediate arrays which increases garbage collection overhead. Since this is an extension running potentially large batch operations, this micro-optimization is actually beneficial.
**Action:** Use `indexOf()` and `substring()` to manually extract specific segments from delimited strings on hot paths like `parseTask` instead of creating throwaway arrays.
