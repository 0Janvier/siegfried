use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

use crate::tool_paths::{resolve_tool, tessdata_dir};

#[derive(Debug, Clone, Serialize)]
pub struct ExtractedPage {
    pub file: String,
    pub page: u32,
    pub text: String,
    pub used_ocr: bool,
}

const OCR_FALLBACK_THRESHOLD: usize = 20;

/// Supported file extensions
const PDF_EXTS: &[&str] = &["pdf"];
const DOCX_EXTS: &[&str] = &["docx"];
const RTF_EXTS: &[&str] = &["rtf"];
const TEXT_EXTS: &[&str] = &["txt", "text", "md", "csv"];

/// Progress callback: (page, total_pages, used_ocr) → continue?
/// Return false to abort extraction early.
pub type ProgressCallback = Box<dyn Fn(u32, u32, bool) -> bool + Send + Sync>;

/// Extract with progress reporting.
pub fn extract_file_with_progress(
    path: &Path,
    progress: ProgressCallback,
) -> Result<Vec<ExtractedPage>> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if PDF_EXTS.contains(&ext.as_str()) {
        extract_pdf(path, Some(progress))
    } else if DOCX_EXTS.contains(&ext.as_str()) {
        let pages = extract_docx(path)?;
        progress(1, 1, false);
        Ok(pages)
    } else if RTF_EXTS.contains(&ext.as_str()) {
        let pages = extract_rtf(path)?;
        progress(1, 1, false);
        Ok(pages)
    } else if TEXT_EXTS.contains(&ext.as_str()) {
        let pages = extract_text(path)?;
        progress(1, 1, false);
        Ok(pages)
    } else {
        Err(anyhow!("format non supporte : .{}", ext))
    }
}

/// Extract text from any supported file format (no progress).
#[allow(dead_code)]
pub fn extract_file(path: &Path) -> Result<Vec<ExtractedPage>> {
    extract_file_with_progress(path, Box::new(|_, _, _| true))
}

// ─── PDF extraction (existing logic) ───

fn extract_pdf(path: &Path, progress: Option<ProgressCallback>) -> Result<Vec<ExtractedPage>> {
    let filename = file_name(path);
    let page_count = pdf_page_count(path)?;
    let mut pages = Vec::with_capacity(page_count as usize);

    for page_num in 1..=page_count {
        let native_text = pdftotext_page(path, page_num).unwrap_or_default();
        let trimmed = native_text.trim();

        let (text, used_ocr) = if trimmed.len() < OCR_FALLBACK_THRESHOLD {
            match ocr_page(path, page_num) {
                Ok(ocr_text) => (ocr_text, true),
                Err(_) => (native_text.clone(), false),
            }
        } else {
            (native_text.clone(), false)
        };

        pages.push(ExtractedPage {
            file: filename.clone(),
            page: page_num,
            text,
            used_ocr,
        });

        if let Some(ref cb) = progress {
            if !cb(page_num, page_count, used_ocr) {
                return Err(anyhow!("extraction annulee"));
            }
        }
    }

    Ok(pages)
}

// ─── DOCX extraction ───
// Uses macOS textutil (built-in, no dependency) to convert DOCX → plain text.

fn extract_docx(path: &Path) -> Result<Vec<ExtractedPage>> {
    let filename = file_name(path);
    let tmp = TempDir::new().context("creating tempdir for DOCX")?;
    let out_path = tmp.path().join("output.txt");

    let status = Command::new("textutil")
        .arg("-convert")
        .arg("txt")
        .arg("-output")
        .arg(&out_path)
        .arg(path)
        .status()
        .context("textutil failed (should be available on macOS)")?;

    if !status.success() {
        return Err(anyhow!("textutil failed to convert DOCX"));
    }

    let content = fs::read_to_string(&out_path)
        .context("reading converted DOCX text")?;

    Ok(split_into_pages(&filename, &content))
}

// ─── RTF extraction ───
// Also uses macOS textutil.

fn extract_rtf(path: &Path) -> Result<Vec<ExtractedPage>> {
    let filename = file_name(path);
    let tmp = TempDir::new().context("creating tempdir for RTF")?;
    let out_path = tmp.path().join("output.txt");

    let status = Command::new("textutil")
        .arg("-convert")
        .arg("txt")
        .arg("-output")
        .arg(&out_path)
        .arg(path)
        .status()
        .context("textutil failed")?;

    if !status.success() {
        return Err(anyhow!("textutil failed to convert RTF"));
    }

    let content = fs::read_to_string(&out_path)
        .context("reading converted RTF text")?;

    Ok(split_into_pages(&filename, &content))
}

// ─── Plain text extraction ───

fn extract_text(path: &Path) -> Result<Vec<ExtractedPage>> {
    let filename = file_name(path);
    let bytes = fs::read(path).context("reading text file")?;
    let content = decode_bytes(&bytes);
    Ok(split_into_pages(&filename, &content))
}

/// Decode bytes with charset detection: BOM → chardetng → UTF-8 lossy.
/// Handles Windows-1252, ISO-8859-1, UTF-16 BOM correctly.
fn decode_bytes(bytes: &[u8]) -> String {
    // BOM detection
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(&bytes[3..]).into_owned();
    }
    if bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]) {
        let (cow, _, _) = encoding_rs::UTF_16LE.decode(bytes);
        return cow.into_owned();
    }

    // Try UTF-8 strict
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }

    // Charset detection on non-UTF-8 bytes
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    let encoding = detector.guess(None, true);
    let (cow, _, _) = encoding.decode(bytes);
    cow.into_owned()
}

// ─── Helpers ───

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string()
}

/// Split a long text into virtual "pages" of ~3000 chars for consistency
/// with the PDF page model. Single-page documents stay as one page.
fn split_into_pages(filename: &str, content: &str) -> Vec<ExtractedPage> {
    const PAGE_SIZE: usize = 3000;

    if content.len() <= PAGE_SIZE {
        return vec![ExtractedPage {
            file: filename.to_string(),
            page: 1,
            text: content.to_string(),
            used_ocr: false,
        }];
    }

    let mut pages = Vec::new();
    let mut start = 0;
    let mut page_num = 1u32;

    while start < content.len() {
        let end = (start + PAGE_SIZE).min(content.len());
        // Try to break at a newline near the boundary
        let actual_end = if end < content.len() {
            content[start..end]
                .rfind('\n')
                .map(|pos| start + pos + 1)
                .unwrap_or(end)
        } else {
            end
        };

        pages.push(ExtractedPage {
            file: filename.to_string(),
            page: page_num,
            text: content[start..actual_end].to_string(),
            used_ocr: false,
        });
        start = actual_end;
        page_num += 1;
    }

    pages
}

// ─── PDF-specific helpers ───

fn pdf_page_count(path: &Path) -> Result<u32> {
    let output = Command::new(resolve_tool("pdfinfo"))
        .arg(path)
        .output()
        .context("failed to run pdfinfo")?;

    if !output.status.success() {
        return Err(anyhow!(
            "pdfinfo failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("Pages:") {
            let num: u32 = rest.trim().parse().context("parsing page count")?;
            return Ok(num);
        }
    }
    Err(anyhow!("could not find page count in pdfinfo output"))
}

fn pdftotext_page(path: &Path, page: u32) -> Result<String> {
    let output = Command::new(resolve_tool("pdftotext"))
        .arg("-layout")
        .arg("-f")
        .arg(page.to_string())
        .arg("-l")
        .arg(page.to_string())
        .arg(path)
        .arg("-")
        .output()
        .context("pdftotext failed to spawn")?;

    if !output.status.success() {
        return Err(anyhow!(
            "pdftotext failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn ocr_page(path: &Path, page: u32) -> Result<String> {
    let tmp = TempDir::new().context("creating tempdir for OCR")?;
    let prefix = tmp.path().join("page");

    let status = Command::new(resolve_tool("pdftoppm"))
        .arg("-r")
        .arg("300")
        .arg("-png")
        .arg("-f")
        .arg(page.to_string())
        .arg("-l")
        .arg(page.to_string())
        .arg(path)
        .arg(&prefix)
        .status()
        .context("pdftoppm failed to spawn")?;

    if !status.success() {
        return Err(anyhow!("pdftoppm failed for page {}", page));
    }

    let mut image_path = None;
    for entry in std::fs::read_dir(tmp.path())? {
        let entry = entry?;
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) == Some("png") {
            image_path = Some(p);
            break;
        }
    }
    let image_path = image_path.ok_or_else(|| anyhow!("no PNG produced by pdftoppm"))?;

    let mut cmd = Command::new(resolve_tool("tesseract"));
    cmd.arg(&image_path).arg("-").arg("-l").arg("fra");

    if let Some(td) = tessdata_dir() {
        if td.exists() {
            cmd.env("TESSDATA_PREFIX", td);
        }
    }

    let output = cmd.output().context("tesseract failed to spawn")?;

    if !output.status.success() {
        return Err(anyhow!(
            "tesseract failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn extracts_txt_file() {
        let tmp = TempDir::new().unwrap();
        let p = tmp.path().join("test.txt");
        fs::write(&p, "Bonjour M. Dupont").unwrap();
        let pages = extract_file(&p).unwrap();
        assert_eq!(pages.len(), 1);
        assert!(pages[0].text.contains("Dupont"));
    }

    #[test]
    fn split_long_text() {
        let long = "a\n".repeat(5000);
        let pages = split_into_pages("test.txt", &long);
        assert!(pages.len() > 1);
        let total: usize = pages.iter().map(|p| p.text.len()).sum();
        assert_eq!(total, long.len());
    }
}
