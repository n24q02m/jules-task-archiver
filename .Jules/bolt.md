
## 2024-05-18 - Hot path closures and double Map lookups
**Learning:** In V8, using array methods like `.some()` inside high-frequency loops (like `taskHasOpenPR` running thousands of times) allocates function closures that create measurable GC pressure and overhead compared to a standard `for` loop. Similarly, using `Map.has()` followed by `Map.get()` forces double hashing, whereas a single `Map.get()` with an `undefined` check is twice as fast.
**Action:** In high-frequency parsing and grouping paths (especially background service workers processing large API responses), avoid intermediate array functions (`some`, `forEach`) and double Map lookups. Default to standard `for` loops and single-lookup Map access.
