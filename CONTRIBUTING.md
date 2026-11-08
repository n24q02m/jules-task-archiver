# Contributing

Thank you for your interest in contributing to Jules Task Archiver!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Load the extension in Chrome/Brave (Developer mode > Load unpacked)

## Development

This is a Chrome Extension (Manifest V3) with no runtime dependencies. No build step required.

### Code Style

[Biome](https://biomejs.dev/) and [oxlint](https://oxc.rs/docs/guide/usage/linter) lint the code;
[oxfmt](https://oxc.rs/docs/guide/usage/formatter) formats it. oxlint and oxfmt are pinned in
`package.json`; install them with [Bun](https://bun.sh/):

```bash
bun install --frozen-lockfile

# Check
npx @biomejs/biome@2.4.16 check .
bun run lint:ox
bun run fmt:check

# Fix
bun run fmt
```

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add batch size configuration`
- `fix: handle stale DOM after archive`
- `docs: update installation instructions`

### Testing

1. Load the extension unpacked in Chrome/Brave
2. Open one or more `jules.google.com` tabs
3. Test both Dry Run and Archive modes
4. Verify multi-account support (`/u/0`, `/u/1`, etc.)

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run the checks under Code Style above to verify code style
4. Submit a PR with a clear description

## Reporting Issues

Use the issue templates on the repository for bug reports and feature requests.
