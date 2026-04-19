#!/usr/bin/env bash
# Build a universal (arm64 + x86_64) .app that runs on any Mac.
#
# Usage:
#   ./scripts/build-universal.sh
#
# Output: src-tauri/target/universal-apple-darwin/release/bundle/macos/siegfried.app
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log() { printf "\033[36m[build-universal]\033[0m %s\n" "$1"; }

# Ensure tools are bundled
if [[ ! -f "$ROOT/src-tauri/tools/pdfinfo" ]]; then
  log "Bundling tools first"
  "$SCRIPT_DIR/bundle-tools.sh"
fi

# Ensure both Rust targets are installed
log "Installing Rust targets (arm64 + x86_64)"
rustup target add aarch64-apple-darwin x86_64-apple-darwin

log "Running tauri build --target universal-apple-darwin"
cd "$ROOT"
bun run tauri build --target universal-apple-darwin

APP="$ROOT/src-tauri/target/universal-apple-darwin/release/bundle/macos/siegfried.app"
if [[ -d "$APP" ]]; then
  log "Done: $APP"
  log "Verify arch: file $APP/Contents/MacOS/siegfried"
else
  log "Build failed — check output above"
  exit 1
fi
