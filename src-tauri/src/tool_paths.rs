use std::path::PathBuf;
use std::sync::OnceLock;

/// Resolves the path to an external tool.
/// Looks in the app bundle's Resources/tools/ first (production),
/// then falls back to system PATH (development).
pub fn resolve_tool(name: &str) -> String {
    if let Some(bundled) = bundled_tools_dir() {
        let candidate = bundled.join(name);
        if candidate.exists() {
            return candidate.to_string_lossy().into_owned();
        }
    }
    // Fallback: use system PATH
    name.to_string()
}

/// Returns the TESSDATA_PREFIX for bundled tesseract data.
pub fn tessdata_dir() -> Option<PathBuf> {
    bundled_tools_dir().map(|d| d.join("tessdata"))
}

/// Resolves the bundled tools directory inside the .app bundle.
/// macOS layout: siegfried.app/Contents/Resources/tools/
fn bundled_tools_dir() -> Option<PathBuf> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        let exe = std::env::current_exe().ok()?;
        // exe = .app/Contents/MacOS/siegfried
        let contents = exe.parent()?.parent()?;
        let tools = contents.join("Resources").join("tools");
        if tools.is_dir() {
            Some(tools)
        } else {
            None
        }
    })
    .clone()
}
