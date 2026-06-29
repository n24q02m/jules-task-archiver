## 2026-06-29 - Missing Type Validation in JSON Parser

**Vulnerability:** Missing type validation on deeply nested JSON payloads from `batchexecute` RPC responses. While the top-level response was checked for array type, the inner payload (`entry[2]`) and its parsed result were not, potentially leading to runtime exceptions or unexpected behavior if the API returns non-array structures.

**Learning:** When parsing multi-layered JSON (especially from internal/undocumented RPCs like `batchexecute`), every layer of deserialization must be accompanied by explicit type validation. Assuming the structure based on successful cases is insufficient for security-critical paths.

**Prevention:** Always validate that the input to `JSON.parse` is of the expected type (e.g., `string`) and that the output matches the expected schema (e.g., `Array.isArray`) before proceeding with iteration or property access.
