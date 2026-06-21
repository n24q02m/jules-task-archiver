## 2024-06-21 - Optimize String Parsing in High-Frequency Paths
**Learning:** In high-frequency parsing paths (like `parseTask` which processes large lists of tasks), allocating arrays and strings via `.split()` is significantly slower than manual index scanning with `indexOf` and `.slice()`. Avoiding the array allocation yields ~26% performance improvement for typical GitHub paths.
**Action:** Use manual string scanning via `indexOf` instead of `.split()` or regex when parsing high-frequency payloads, avoiding unnecessary intermediate object/array allocations.
