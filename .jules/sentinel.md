## 2024-07-20 - Fix ReDoS vulnerability in fixJsonControlChars
**Vulnerability:** Regular Expression Denial of Service (ReDoS) due to overlapping quantifiers in `/"(?:[^"\\]|\\.)*"/g`.
**Learning:** Parsing untrusted JSON strings with complex regexes can cause catastrophic backtracking.
**Prevention:** Use a single-pass `for` loop state machine instead of regex to parse string literals and replace characters.
