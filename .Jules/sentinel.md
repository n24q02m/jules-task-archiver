## 2025-02-27 - Fix ReDoS vulnerability in JSON parser
**Vulnerability:** Regular expression `/"(?:[^"\\]|\\.)*"/g` in JSON control character parsing has overlapping quantifiers and is vulnerable to ReDoS.
**Learning:** Using regex with overlapping quantifiers to parse untrusted network payloads is susceptible to Regular Expression Denial of Service.
**Prevention:** Use a single-pass character loop state machine for string manipulation instead of complex regexes to prevent ReDoS and guarantee predictable execution time.
