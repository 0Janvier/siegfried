#!/usr/bin/env bash
# Bundle poppler + tesseract + tessdata into src-tauri/tools/
# for a self-contained .app that runs on any Mac (no brew required).
#
# Usage:
#   ./scripts/bundle-tools.sh
#
# Prerequisites on the BUILD machine:
#   brew install poppler tesseract tesseract-lang dylibbundler
#
# Output: src-tauri/tools/{pdfinfo,pdftotext,pdftoppm,tesseract,lib/*,tessdata/fra.traineddata}
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TOOLS_DIR="$ROOT/src-tauri/tools"
LIB_DIR="$TOOLS_DIR/lib"
TESSDATA_DIR="$TOOLS_DIR/tessdata"

BREW_PREFIX="$(brew --prefix)"

BINARIES=(pdfinfo pdftotext pdftoppm pdfunite tesseract)

log() { printf "\033[36m[bundle-tools]\033[0m %s\n" "$1"; }
err() { printf "\033[31m[error]\033[0m %s\n" "$1" >&2; exit 1; }

# ── Prerequisites ───────────────────────────────────────────────
command -v brew >/dev/null || err "Homebrew required"
command -v dylibbundler >/dev/null || err "dylibbundler required. Install: brew install dylibbundler"

for bin in "${BINARIES[@]}"; do
  [[ -x "$BREW_PREFIX/bin/$bin" ]] || err "$bin missing. Install: brew install poppler tesseract"
done

[[ -f "$BREW_PREFIX/share/tessdata/fra.traineddata" ]] \
  || err "fra.traineddata missing. Install: brew install tesseract-lang"

# ── Clean + prepare ─────────────────────────────────────────────
log "Cleaning $TOOLS_DIR"
rm -rf "$TOOLS_DIR"
mkdir -p "$TOOLS_DIR" "$LIB_DIR" "$TESSDATA_DIR"

# ── Copy binaries ───────────────────────────────────────────────
for bin in "${BINARIES[@]}"; do
  log "Copying $bin"
  cp "$BREW_PREFIX/bin/$bin" "$TOOLS_DIR/$bin"
  chmod +w "$TOOLS_DIR/$bin"
done

# ── Bundle dylibs + rewrite rpaths ──────────────────────────────
# dylibbundler : collects deps recursively, copies them to -d, rewrites
# binary install names to @executable_path/../tools/lib/
log "Running dylibbundler (may take 30-60s)"
# -s adds search paths; needed because brew's lib dir is not in default search
# -cd skips prompts for missing libs (will warn and continue)
# stdin redirected from /dev/null to fail fast instead of prompting
dylibbundler \
  -od -b \
  -x "$TOOLS_DIR/pdfinfo" \
  -x "$TOOLS_DIR/pdftotext" \
  -x "$TOOLS_DIR/pdftoppm" \
  -x "$TOOLS_DIR/pdfunite" \
  -x "$TOOLS_DIR/tesseract" \
  -d "$LIB_DIR" \
  -p "@executable_path/../tools/lib/" \
  -s "$BREW_PREFIX/lib" \
  -s "$BREW_PREFIX/opt/poppler/lib" \
  -s "$BREW_PREFIX/opt/tesseract/lib" \
  -s "$BREW_PREFIX/opt/leptonica/lib" \
  </dev/null 2>&1 | grep -E "^\s*\*|Fixing|Changing|Error|Warning|error" | tail -40 || true

# ── Copy tessdata (French only, ~55MB) ──────────────────────────
log "Copying tessdata fra"
cp "$BREW_PREFIX/share/tessdata/fra.traineddata" "$TESSDATA_DIR/"
# osd.traineddata is required for orientation detection
if [[ -f "$BREW_PREFIX/share/tessdata/osd.traineddata" ]]; then
  cp "$BREW_PREFIX/share/tessdata/osd.traineddata" "$TESSDATA_DIR/"
fi

# ── Smoke test ──────────────────────────────────────────────────
# poppler tools use -v, tesseract uses --version
log "Smoke test"
for bin in "${BINARIES[@]}"; do
  case "$bin" in
    tesseract|pdfunite) flag="--version" ;;
    *)                  flag="-v" ;;
  esac
  if ! "$TOOLS_DIR/$bin" "$flag" 2>&1 | head -1 | grep -qiE "version|[0-9]+\.[0-9]"; then
    err "$bin failed smoke test (flag: $flag)"
  fi
done

# ── Summary ─────────────────────────────────────────────────────
TOTAL_SIZE=$(du -sh "$TOOLS_DIR" | cut -f1)
LIB_COUNT=$(find "$LIB_DIR" -name "*.dylib" | wc -l | tr -d ' ')
log "Done. $TOOLS_DIR ($TOTAL_SIZE, $LIB_COUNT dylibs)"
