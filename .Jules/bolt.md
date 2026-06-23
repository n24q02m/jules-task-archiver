## 2025-05-15 - Optimize Map lookups during Task grouping

**Learning:** Using `map.has(key)` followed by `map.get(key)` and `map.set(key)` results in redundant key hashing and lookups (3 lookups in the worst case, 2 in the common case). A more efficient pattern is to use a single `map.get(key)` and check if the result is `undefined`.

**Action:** Prefer `let val = map.get(key); if (val === undefined) { val = []; map.set(key, val); } val.push(item);` over the `if (!map.has(key)) map.set(key, []); map.get(key).push(item);` pattern.
