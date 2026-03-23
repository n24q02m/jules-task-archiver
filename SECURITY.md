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

- **GitHub tokens** stored in `chrome.storage.sync` are synced across devices. Use a token with minimal permissions (`public_repo` scope only)
- The extension only communicates with `jules.google.com` and `api.github.com`
- No data is sent to any third-party servers
- Content scripts run in an isolated world and cannot access page JavaScript variables
