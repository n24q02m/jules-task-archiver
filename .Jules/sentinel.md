## 2025-05-15 - Missing Authorization Header Validation and Path Traversal Fix
**Vulnerability:** The `getOpenPRs` function (GitHub API client) was vulnerable to path traversal via `owner` and `repo` parameters because `encodeURIComponent("..")` returns `..`. It also had a cache collision vulnerability due to simple string joining of parameters.
**Learning:** `encodeURIComponent` is not sufficient for path component validation if the component is used in a REST API path, as ".." is a valid (though dangerous) URI segment. Cache keys should always use unique delimiters to prevent parameter injection/collision.
**Prevention:** Use strict regex validation for URL slugs and use delimited cache keys.
