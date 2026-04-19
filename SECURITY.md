# Security Policy

## Reporting a Vulnerability

Siegfried2 processes legally privileged material (secret professionnel avocat).
Security issues are taken seriously.

**Do not open a public GitHub issue for security reports.**

Instead, email the maintainer directly with the subject line `[Siegfried2 Security]`.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Your assessment of impact
- Any suggested mitigation

Expect an acknowledgement within 7 days and a full response within 30 days.

## Scope

The following are in scope:

- Bypasses of the reversible pseudonymization mapping (e.g. information leak in exported `texte_anonymise.txt`)
- Weaknesses in the AES-GCM / PBKDF2 mapping encryption implementation
- Injection vulnerabilities in the Tauri <-> external tools (poppler, tesseract) boundary
- Unauthorized filesystem access beyond the declared scope (`$HOME`, `$DESKTOP`, `$DOCUMENT`)
- Any path that causes Siegfried2 to make a network request (even accidentally)

Out of scope:

- Vulnerabilities in third-party tools (poppler, tesseract) — report to those projects
- User errors (sharing the unencrypted `mapping.json` publicly, weak passphrase)
- Issues that only affect development builds or sideloaded/unsigned binaries

## Disclaimer

This software is provided under the Apache License 2.0. See [LICENSE](./LICENSE)
for the full warranty disclaimer and limitation of liability. Users are solely
responsible for verifying the correctness of anonymization before sharing output
with any third party (including AI systems).
