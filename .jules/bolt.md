## 2023-10-27 - Map lookup optimization over Map.groupBy

**Learning:** When grouping large arrays into maps, checking `let list = map.get(key)` and conditionally creating/setting the list if `undefined` is significantly faster (~2.7x) than using the older `map.has(key)` + `map.get(key)` pattern, and notably faster than the new `Map.groupBy` standard library function. `Map.groupBy` carries overhead that doesn't beat a well-optimized JS loop for simple accumulation.

**Action:** Prefer the single `map.get(key) === undefined` check pattern for grouping collections when performance is critical, avoiding redundant map hashing/lookups or `Map.groupBy` overhead.