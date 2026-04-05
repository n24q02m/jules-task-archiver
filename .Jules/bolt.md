## 2026-04-12 - Chunked JSON parsing
**Learning:** For large JSON strings, chunked string slicing is 7-10x faster than character-by-character processing.
**Action:** Use chunked slicing for batchexecute response parsing.
