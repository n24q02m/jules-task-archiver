## 2026-06-29 - Redundant Async Storage I/O in Tab Processing Loop

**Learning:** [Insight] Fetching configuration from storage inside loops or frequently called per-tab functions causes unnecessary async overhead. Centralizing these reads at the start of an operation and passing them down via options improves performance and simplifies function signatures.

**Action:** [How to apply next time] Always identify stable configuration values (like API tokens or user settings) that are needed across multiple network requests or tab processing steps. Fetch them once in the orchestrator's entry point (`startOperation`) and propagate them through the call stack using the `options` object.
