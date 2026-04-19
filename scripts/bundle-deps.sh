#!/bin/bash
set -euo pipefail

# Bundle external dependencies (poppler tools + tesseract) into the .app
# Run AFTER `bun tauri build`

APP_DIR="src-tauri/target/release/bundle/macos/siegfried.app"
RESOURCES="$APP_DIR/Contents/Resources"
TOOLS_DIR="$RESOURCES/tools"
LIBS_DIR="$RESOURCES/tools/lib"
TESSDATA="$RESOURCES/tools/tessdata"

if [ ! -d "$APP_DIR" ]; then
  echo "Error: $APP_DIR not found. Run 'bun tauri build' first."
  exit 1
fi

echo "=== Bundling dependencies into $APP_DIR ==="

mkdir -p "$TOOLS_DIR" "$LIBS_DIR" "$TESSDATA"

# ── 1. Copy binaries ──
echo "Copying binaries..."
for tool in pdfinfo pdftotext pdftoppm tesseract; do
  real=$(readlink -f "/opt/homebrew/bin/$tool")
  cp "$real" "$TOOLS_DIR/$tool"
  chmod 755 "$TOOLS_DIR/$tool"
  echo "  $tool"
done

# ── 2. Copy tesseract language data ──
echo "Copying tessdata..."
FRA_DATA=$(readlink -f /opt/homebrew/share/tessdata/fra.traineddata)
cp "$FRA_DATA" "$TESSDATA/fra.traineddata"
# Also copy eng as fallback
ENG_DATA=$(readlink -f /opt/homebrew/share/tessdata/eng.traineddata 2>/dev/null || true)
[ -f "$ENG_DATA" ] && cp "$ENG_DATA" "$TESSDATA/eng.traineddata"
echo "  fra.traineddata"

# ── 3. Collect and copy all dylib dependencies ──
echo "Collecting dylibs..."
DYLIBS=()

collect_dylibs() {
  local bin="$1"
  for dep in $(otool -L "$bin" 2>/dev/null | awk 'NR>1{print $1}' | grep '^/opt/homebrew'); do
    local real=$(readlink -f "$dep" 2>/dev/null || echo "$dep")
    [ -f "$real" ] || continue
    local name=$(basename "$real")
    if [ ! -f "$LIBS_DIR/$name" ]; then
      cp "$real" "$LIBS_DIR/$name"
      chmod 644 "$LIBS_DIR/$name"
      DYLIBS+=("$LIBS_DIR/$name")
      echo "  $name"
      # Recurse into this dylib's deps
      collect_dylibs "$real"
    fi
  done
}

for tool in "$TOOLS_DIR"/{pdfinfo,pdftotext,pdftoppm,tesseract}; do
  collect_dylibs "$tool"
done

# Also resolve @rpath deps
for tool in "$TOOLS_DIR"/{pdfinfo,pdftotext,pdftoppm}; do
  for dep in $(otool -L "$tool" | awk 'NR>1{print $1}' | grep '^@rpath'); do
    name=$(basename "$dep")
    real=$(find /opt/homebrew/Cellar -name "$name" -type f 2>/dev/null | head -1)
    if [ -n "$real" ] && [ -f "$real" ] && [ ! -f "$LIBS_DIR/$name" ]; then
      cp "$real" "$LIBS_DIR/$name"
      chmod 644 "$LIBS_DIR/$name"
      DYLIBS+=("$LIBS_DIR/$name")
      echo "  $name (from @rpath)"
      collect_dylibs "$real"
    fi
  done
done

# ── 4. Fix rpaths in binaries ──
echo "Fixing rpaths in binaries..."
for tool in "$TOOLS_DIR"/{pdfinfo,pdftotext,pdftoppm,tesseract}; do
  toolname=$(basename "$tool")
  # Replace /opt/homebrew refs with @executable_path/lib/
  for dep in $(otool -L "$tool" | awk 'NR>1{print $1}' | grep -E '^(/opt/homebrew|@rpath)'); do
    libname=$(basename "$dep")
    if [ -f "$LIBS_DIR/$libname" ]; then
      install_name_tool -change "$dep" "@executable_path/lib/$libname" "$tool" 2>/dev/null || true
    fi
  done
  # Add rpath
  install_name_tool -add_rpath "@executable_path/lib" "$tool" 2>/dev/null || true
  echo "  Fixed $toolname"
done

# ── 5. Fix rpaths in dylibs ──
echo "Fixing rpaths in dylibs..."
for lib in "$LIBS_DIR"/*.dylib; do
  libname=$(basename "$lib")
  # Fix self-reference
  install_name_tool -id "@loader_path/$libname" "$lib" 2>/dev/null || true
  # Fix deps
  for dep in $(otool -L "$lib" | awk 'NR>1{print $1}' | grep -E '^(/opt/homebrew|@rpath)'); do
    depname=$(basename "$dep")
    if [ -f "$LIBS_DIR/$depname" ]; then
      install_name_tool -change "$dep" "@loader_path/$depname" "$lib" 2>/dev/null || true
    fi
  done
done

# ── 6. Ad-hoc sign everything ──
echo "Signing..."
for f in "$TOOLS_DIR"/{pdfinfo,pdftotext,pdftoppm,tesseract} "$LIBS_DIR"/*.dylib; do
  codesign --force --sign - "$f" 2>/dev/null || true
done

# ── Summary ──
TOTAL_SIZE=$(du -sh "$TOOLS_DIR" | awk '{print $1}')
echo ""
echo "=== Done ==="
echo "Tools dir: $TOOLS_DIR"
echo "Total size: $TOTAL_SIZE"
echo "Contents:"
ls -la "$TOOLS_DIR"/
echo "Libs:"
ls "$LIBS_DIR"/ | wc -l | xargs echo "  dylibs:"
echo "Tessdata:"
ls "$TESSDATA"/
