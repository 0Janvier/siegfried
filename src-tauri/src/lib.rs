mod text_extract;
mod tool_paths;

use text_extract::{extract_file_with_progress, ExtractedPage, ProgressCallback};
use tool_paths::resolve_tool;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct ExtractionState {
    cancel: Arc<AtomicBool>,
}

#[derive(serde::Serialize, Clone)]
struct ProgressEvent {
    file: String,
    page: u32,
    total_pages: u32,
    file_index: usize,
    file_count: usize,
    used_ocr: bool,
}

#[tauri::command]
async fn extract_files(
    app: AppHandle,
    state: State<'_, ExtractionState>,
    paths: Vec<String>,
) -> Result<Vec<ExtractedPage>, String> {
    state.cancel.store(false, Ordering::SeqCst);
    let cancel = state.cancel.clone();
    let file_count = paths.len();

    tauri::async_runtime::spawn_blocking(move || {
        let mut all_pages = Vec::new();
        for (file_index, path_str) in paths.iter().enumerate() {
            if cancel.load(Ordering::SeqCst) {
                return Err(format!("extraction annulee apres {} fichier(s)", file_index));
            }
            let path = PathBuf::from(path_str);
            if !path.exists() {
                return Err(format!("fichier introuvable : {}", path_str));
            }

            let app_clone = app.clone();
            let path_str_clone = path_str.clone();
            let cancel_clone = cancel.clone();
            let cb: ProgressCallback = Box::new(move |page, total, used_ocr| {
                let _ = app_clone.emit(
                    "extract:progress",
                    ProgressEvent {
                        file: path_str_clone.clone(),
                        page,
                        total_pages: total,
                        file_index,
                        file_count,
                        used_ocr,
                    },
                );
                !cancel_clone.load(Ordering::SeqCst)
            });

            match extract_file_with_progress(&path, cb) {
                Ok(pages) => all_pages.extend(pages),
                Err(e) => return Err(format!("extraction echouee pour {} : {}", path_str, e)),
            }
        }
        Ok(all_pages)
    })
    .await
    .map_err(|e| format!("erreur interne : {}", e))?
}

#[tauri::command]
fn cancel_extraction(state: State<'_, ExtractionState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn check_tools() -> Vec<(String, bool)> {
    ["pdfinfo", "pdftotext", "pdftoppm", "tesseract"]
        .iter()
        .map(|t| {
            let tool_path = resolve_tool(t);
            let ok = std::process::Command::new(&tool_path)
                .arg("--version")
                .output()
                .map(|o| o.status.success() || !o.stderr.is_empty())
                .unwrap_or(false);
            (t.to_string(), ok)
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            app.manage(ExtractionState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            extract_files,
            cancel_extraction,
            check_tools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
