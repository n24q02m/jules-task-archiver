## 2024-05-24 - ReDoS Vulnerability in JSON Parser Regex
**Vulnerability:** The `fixJsonControlChars` function used a regex `/"(?:[^"\\]|\\.)*"/g` to parse JSON strings, which has overlapping quantifiers and is vulnerable to Regular Expression Denial of Service (ReDoS) when processing malicious input payloads.
**Learning:** Using regex with overlapping matching possibilities for parsing complex or untrusted inputs (like network payloads or JSON strings) can lead to catastrophic backtracking and DoS attacks.
**Prevention:** Avoid using regex for complex string parsing where quantifiers can overlap. Instead, use a single-pass character loop (state machine) to safely parse and process untrusted strings.
