## 2024-05-18 - Optimize Map grouping with early undefined checks
**Learning:** `Map.groupBy` (ES2024) and double Map lookups (`map.has` then `map.get` / `map.set`) incur unnecessary hashing and dictionary operations overhead that stacks up in hot loops.
**Action:** When grouping items into a Map, use a single `let val = map.get(key)` call and check for `val === undefined` before conditionally calling `map.set(key, [])` to reduce key hashing and lookups from 2-3 per iteration to 1-2.
