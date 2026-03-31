# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue
2. Email the maintainer or use GitHub's private vulnerability reporting
3. Include steps to reproduce the vulnerability
4. Allow reasonable time for a fix before public disclosure

## Security Considerations

- **GitHub tokens** are stored locally in `chrome.storage.local` to prevent syncing sensitive credentials across devices. However, you should still use a token with minimal permissions (`public_repo` scope only)
- The extension only communicates with `jules.google.com` and `api.github.com`
- No data is sent to any third-party servers
- Content scripts run in an isolated world and cannot access page JavaScript variables
