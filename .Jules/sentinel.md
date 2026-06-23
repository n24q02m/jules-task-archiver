## 2025-05-14 - Missing Type Validation in JSON Parser
**Vulnerability:** Denial of Service / Runtime Exception via malformed JSON response.
**Learning:** `JSON.parse` only guarantees valid JSON syntax, not the structure (object vs array). Iterating over a non-iterable (like an object) results in a `TypeError`.
**Prevention:** Always use `Array.isArray()` to validate types after parsing JSON if the code expects an array.
