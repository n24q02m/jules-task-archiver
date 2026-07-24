## 2025-02-26 - Fix Potential ReDoS in JSON String Parsing
**Vulnerability:** Regular Expression Denial of Service (ReDoS) risk via overlapping quantifiers (/(?:[^"\\]|\\.)*"/g) used to parse untrusted JSON network payloads.
**Learning:** Security scanners flag mutually exclusive alternations with quantifiers because they can lead to catastrophic backtracking on crafted payloads.
**Prevention:** Avoid complex regular expressions for parsing strings from untrusted sources. Use a single-pass character loop (state machine) instead to guarantee linear execution time.
