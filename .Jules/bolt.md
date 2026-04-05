## 2025-05-14 - Centralize URL Parsing Logic

**Learning:** Duplicated regex logic across multiple functions makes the codebase harder to maintain and prone to inconsistent behavior, especially when handling edge cases like invalid URLs.

**Action:** Extract recurring regex patterns into top-level constants and wrap extraction logic in robust helper functions with try/catch blocks to ensure consistent and safe behavior across the application.
