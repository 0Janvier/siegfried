# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Apache 2.0 license
- NOTICE file with third-party attributions
- CHANGELOG, CONTRIBUTING, SECURITY docs

## [0.1.0] — 2026-04-19

### Added
- PDF, DOCX, RTF, TXT input with OCR fallback (Tesseract `fra`)
- Regex detection of 16 PII categories with checksum validation (Luhn, MOD-97, NIR key)
- Post-processing passes inspired by Cour de cassation juritools:
  - Multi-occurrence propagation
  - Orthographic variant detection (Levenshtein ≤ 2, bucketed)
  - Procedural vs birth date reclassification
  - Physico-morale cross-reference
  - Professional (avocat/magistrat) detection, disabled by default per CNIL 01-057
  - French grammatical particle trimming (articles, prepositions, pronouns)
- Manual entity addition via text selection or search bar with overlap handling
- Entity merge for adjacent detections
- Reversible pseudonymization with consistent cross-document mapping
- AES-GCM encrypted mapping export (PBKDF2-SHA256, 200k iterations)
- Async extraction pipeline with per-page progress events and cancellation
- Zustand state persistence with version-based invalidation
- Bundled external tools (poppler, tesseract, tessdata) for self-contained builds
- Universal (arm64 + x86_64) build script
- Unicode uppercase character class fix (`À-ÖØ-ÞŸ` instead of broken `À-Ÿ`)
- French charset detection (BOM, UTF-8, chardetng fallback)

### Security
- `mapping.json` can be encrypted client-side before export (opt-in by default)
- No network calls, no telemetry
- Filesystem access scoped to `$HOME`, `$DESKTOP`, `$DOCUMENT`
