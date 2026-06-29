
## 2026-06-29 - Redundant Array Traversal for Filtering and Grouping
**Learning:** Combining multiple array operations (filter, group, map) into a single standard 'for' loop significantly reduces execution overhead, especially in hot paths like orchestrators where tasks are processed in batches. Using a Map with a single '.get()' call instead of '.has()' then '.get()' further optimizes lookup-and-assign patterns.
**Action:** Always look for opportunities to merge consecutive array transformations into a single traversal when working on performance-sensitive logic.
