## 2026-07-23 - ReDoS in Network Payload Parsing
**Vulnerability:** Regular Expression Denial of Service (ReDoS) risk via overlapping quantifiers `/(?:[^"\]|\.)*/` used to parse untrusted JSON responses containing control characters.
**Learning:** Security scanners flag mutually exclusive alternations inside quantifiers as ReDoS vulnerabilities. They are especially dangerous for untrusted network payloads.
**Prevention:** Mitigate overlapping quantifiers by using linear-time `for` loop state machines for string manipulation, utilizing `charCodeAt()` and `slice()`.
