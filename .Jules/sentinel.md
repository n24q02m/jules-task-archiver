## 2025-05-15 - Hardcoded GitHub API URL limits configurability
**Vulnerability:** Hardcoded API endpoints prevent users from using the extension with Enterprise GitHub or custom proxies, which can be a security and flexibility limitation.
**Learning:** Hardcoding external API URLs reduces the extensibility of the tool and can lead to messy "security origin" checks if they need to be updated. Centralizing configuration and allowing user overrides improves robustness.
**Prevention:** Use configuration constants and provide UI settings for external API endpoints. Always validate user-provided URLs against expected patterns and origin requirements in network wrappers.
