## 2024-06-25 - Queue Processing Optimization
**Learning:** In high-frequency queues (like rate limiters processing many tasks), using `Array.prototype.shift()` causes O(N) overhead.
**Action:** Replace it with a `head` index pointer (`queue[head++]`) and periodically clean up the array using a high-water mark to maintain O(1) dequeue time while bounding memory usage.
