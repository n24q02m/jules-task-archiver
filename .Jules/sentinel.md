## 2026-06-29 - [CLEANUP] Catching general exceptions and swallowing without context

**Vulnerability:** Silent exception swallowing in URL parsing.
**Learning:** Swallowing exceptions without logging makes it difficult to diagnose why a fallback value (like '0' for account IDs) is being used in production.
**Prevention:** Always log warnings with a descriptive prefix (e.g., [Jules Archiver]) when falling back due to an error, even if the fallback is safe.
