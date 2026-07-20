## 2024-05-18 - [ReDoS in JSON string parser]
**Vulnerability:** Regular Expression Denial of Service (ReDoS) due to overlapping quantifiers `(?:[^"\\]|\\.)*` used for parsing untrusted batchexecute network responses.
**Learning:** Security scanners flag mutually exclusive alternations in regex that parse untrusted external strings, as they can cause unbounded backtracking/execution time.
**Prevention:** Use a single-pass linear-time `for` loop state machine instead of complex regexes with overlapping quantifiers when parsing potentially large, untrusted payloads.
