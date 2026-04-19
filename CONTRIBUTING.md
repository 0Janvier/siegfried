# Contributing to Siegfried2

Thanks for considering a contribution.

## Ground rules

- **Stay 100% local.** No network calls, no telemetry, no cloud features. This is a hard constraint: Siegfried2 handles legally privileged material.
- **French legal domain first.** Features specific to French law (juridictions, NIR, SIREN, civilité) take priority over internationalization, though PRs adding locale support are welcome.
- **Keep the core minimal.** The app is intentionally small; discuss large additions in an issue first.

## Setup

```bash
brew install poppler tesseract tesseract-lang
bun install
bun run tauri dev
```

## Tests

```bash
bun run test                    # anonymizer regression
cd src-tauri && cargo test      # Rust backend
bunx tsc --noEmit               # typecheck
```

## PR checklist

- [ ] `bunx tsc --noEmit` passes
- [ ] `cargo check` passes in `src-tauri/`
- [ ] `bun run test` passes
- [ ] No new runtime network calls
- [ ] No hardcoded personal paths or identifiable data in tests
- [ ] New regex detection added? Include a test case
- [ ] New PII category added? Update `PiiCategory`, `CATEGORY_LABELS`, `CATEGORY_COLORS`, `PseudoMap.counters`

## Commit style

Atomic commits, English messages, version tag in brackets:

```
[v0.1.4] Fix AZERTY apostrophe in search bar
```

## Reporting bugs

Open an issue with:
- macOS version
- Steps to reproduce
- Expected vs actual behavior
- Sanitized extract of the input text (never share real client data)

## Security issues

See [SECURITY.md](./SECURITY.md). Do **not** open a public issue for security concerns.
