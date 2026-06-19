## 2024-05-14 - Optimized parseTask Array Allocation Overhead

**Learning:** When a parsing function executing in a tight loop uses high-level array methods (like `.split('/')`), it introduces significant intermediate object allocations and GC pressure, leading to measurable slowdowns on large data payloads. Manual string scanning (`indexOf` + `slice`) dramatically outperforms these operations by avoiding unnecessary heap allocations.

**Action:** Identify cold paths vs. hot paths. In high-frequency, critical path parsing operations, default to manual string manipulation over allocating array splits to preserve performance.

## 2024-05-14 - Optimized getJulesTabs Discovery Phase

**Learning:** Combining `.filter()` and `.map()` iterations into a single manual `for` loop prevents intermediate array allocation overhead. While insignificant on small sets, this represents an architectural best practice in code executing frequently or dealing with variable payloads.

**Action:** Look for instances of chained array methods (like `.filter().map()`) in discovery and polling loops, and consolidate them into single-pass loops to reduce memory pressure.
