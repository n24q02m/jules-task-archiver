## 2024-10-24 - Optimizing Map grouping
**Learning:** When grouping items into a Map, using `map.has(key)` followed by `map.set(key, [])` and `map.get(key).push(item)` causes unnecessary key hashing and lookups (2-3 per iteration).
**Action:** Use a single `let list = map.get(key)` and check for `undefined` before setting. This reduces lookups to 1-2 per iteration and provides measurable performance improvements for large arrays.
