## 2026-06-29 - Suboptimal Map lookups during Task grouping
**Learning:** [Insight] Reducing Map operations (get/has/set) in tight loops significantly improves performance. Manual grouping with a single `get` is faster than `has` + `get` or `Map.groupBy` in performance-critical sections.
**Action:** [How to apply next time] Always use the `let val = map.get(key); if (val === undefined) { ... }` pattern for grouping items in a Map to minimize lookups.
