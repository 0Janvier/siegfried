//! PDF redaction: rasterize → draw black rectangles → re-assemble.
//!
//! Security model: the text in redacted zones is destroyed at the pixel level.
//! Unlike overlay approaches (PDF annotation on top of existing text), a
//! copy-paste or metadata extraction cannot recover the original content.
//!
//! Pipeline per page:
//! 1. `pdftoppm` rasterizes the PDF page to PNG (200 dpi, tunable).
//! 2. `tesseract --hocr` produces word bounding boxes for the page.
//! 3. Each redaction request is fuzzy-matched against OCR words; matched
//!    bounding boxes are unified and painted solid black on the PNG.
//! 4. `tesseract ... pdf` rebuilds a single-page searchable PDF from the
//!    redacted PNG (non-redacted areas keep a text layer for search).
//! 5. `pdfunite` concatenates all per-page PDFs into the final output.

use anyhow::{anyhow, Context, Result};
use image::{Rgba, RgbaImage};
use imageproc::drawing::draw_filled_rect_mut;
use imageproc::rect::Rect;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;

use crate::tool_paths::{resolve_tool, tessdata_dir};

/// Rasterization density. 200 dpi is a good balance between quality and speed.
const RASTER_DPI: u32 = 200;

/// Horizontal/vertical padding added to each redaction rectangle (in pixels,
/// at RASTER_DPI). Hides OCR bounding box jitter and gives visual clarity.
const BBOX_PADDING: i32 = 2;

/// Levenshtein tolerance when fuzzy-matching OCR words against entity words.
const FUZZY_TOLERANCE: usize = 1;

/// A request to redact a given text on a given page of a given file.
/// `file` must match the basename of the source PDF (as passed via
/// `source_paths`).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RedactionRequest {
    pub file: String,
    pub page: u32,
    pub text: String,
}

#[derive(Debug, Clone)]
struct OcrWord {
    text: String,
    x1: i32,
    y1: i32,
    x2: i32,
    y2: i32,
}

#[derive(Debug, Clone, Copy)]
struct Bbox {
    x1: i32,
    y1: i32,
    x2: i32,
    y2: i32,
}

/// Progress callback invoked before processing each page.
/// Return `false` to abort (caller's decision: currently ignored).
pub type ProgressCallback = Box<dyn Fn(u32, u32, &str) + Send + Sync>;

pub fn redact_pdf(
    source_paths: &[PathBuf],
    redactions: &[RedactionRequest],
    output_path: &Path,
    progress: ProgressCallback,
) -> Result<()> {
    if source_paths.is_empty() {
        return Err(anyhow!("aucun fichier source"));
    }

    let tmp = TempDir::new().context("creating temp dir")?;
    let mut page_pdfs: Vec<PathBuf> = Vec::new();

    // Compute total page count for progress
    let per_file_pages: Vec<u32> = source_paths
        .iter()
        .map(|p| page_count(p).unwrap_or(0))
        .collect();
    let total_pages: u32 = per_file_pages.iter().sum();
    let mut absolute_page: u32 = 0;

    for (file_idx, source) in source_paths.iter().enumerate() {
        let file_name = source
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        let pages = per_file_pages[file_idx];

        for page_num in 1..=pages {
            absolute_page += 1;
            progress(absolute_page, total_pages, &file_name);

            let page_entities: Vec<&RedactionRequest> = redactions
                .iter()
                .filter(|r| r.file == file_name && r.page == page_num)
                .collect();

            let png_path = rasterize_page(source, page_num, tmp.path())
                .with_context(|| format!("rasterize {} page {}", file_name, page_num))?;

            let final_png = if page_entities.is_empty() {
                png_path
            } else {
                let words = tesseract_hocr(&png_path)
                    .with_context(|| format!("OCR hocr {} page {}", file_name, page_num))?;

                let mut img = image::open(&png_path)
                    .with_context(|| format!("open png {:?}", png_path))?
                    .to_rgba8();

                for entity in page_entities {
                    let bboxes = match_entity_bboxes(&entity.text, &words);
                    for bb in bboxes {
                        draw_redaction(&mut img, bb);
                    }
                }

                let out = tmp.path().join(format!("page_{}_red.png", absolute_page));
                img.save(&out).context("save redacted png")?;
                out
            };

            let page_pdf_base = tmp.path().join(format!("page_{:04}", absolute_page));
            pdf_from_image(&final_png, &page_pdf_base)
                .with_context(|| format!("png->pdf page {}", absolute_page))?;
            let page_pdf = page_pdf_base.with_extension("pdf");
            if !page_pdf.exists() {
                return Err(anyhow!("tesseract did not produce {:?}", page_pdf));
            }
            page_pdfs.push(page_pdf);
        }
    }

    // Concatenate all pages
    if page_pdfs.len() == 1 {
        std::fs::copy(&page_pdfs[0], output_path).context("copy single-page output")?;
    } else {
        concatenate_pdfs(&page_pdfs, output_path)?;
    }

    Ok(())
}

// ─── Helpers ────────────────────────────────────────────────────────

fn page_count(path: &Path) -> Result<u32> {
    let output = Command::new(resolve_tool("pdfinfo"))
        .arg(path)
        .output()
        .context("run pdfinfo")?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("Pages:") {
            return rest.trim().parse().context("parse page count");
        }
    }
    Err(anyhow!("could not read page count"))
}

fn rasterize_page(source: &Path, page_num: u32, out_dir: &Path) -> Result<PathBuf> {
    let prefix = out_dir.join(format!("raster_{}", page_num));
    let status = Command::new(resolve_tool("pdftoppm"))
        .arg("-r")
        .arg(RASTER_DPI.to_string())
        .arg("-png")
        .arg("-f")
        .arg(page_num.to_string())
        .arg("-l")
        .arg(page_num.to_string())
        .arg(source)
        .arg(&prefix)
        .status()
        .context("spawn pdftoppm")?;
    if !status.success() {
        return Err(anyhow!("pdftoppm failed for page {}", page_num));
    }
    // pdftoppm writes `prefix-<padded>.png`
    for entry in std::fs::read_dir(out_dir)? {
        let p = entry?.path();
        if p.extension().and_then(|e| e.to_str()) == Some("png") {
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                if name.starts_with(&format!("raster_{}", page_num)) {
                    return Ok(p);
                }
            }
        }
    }
    Err(anyhow!("no PNG produced for page {}", page_num))
}

fn tesseract_hocr(image_path: &Path) -> Result<Vec<OcrWord>> {
    let mut cmd = Command::new(resolve_tool("tesseract"));
    cmd.arg(image_path)
        .arg("-")
        .arg("-l")
        .arg("fra")
        .arg("hocr");
    if let Some(td) = tessdata_dir() {
        if td.exists() {
            cmd.env("TESSDATA_PREFIX", td);
        }
    }
    let output = cmd.output().context("spawn tesseract hocr")?;
    if !output.status.success() {
        return Err(anyhow!(
            "tesseract hocr failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let hocr = String::from_utf8_lossy(&output.stdout);
    parse_hocr(&hocr)
}

fn parse_hocr(hocr: &str) -> Result<Vec<OcrWord>> {
    // HOCR word spans look like:
    //   <span class='ocrx_word' id='word_1_1' title='bbox 12 34 567 89;...'>Hello</span>
    // Quote style and attribute order vary.
    let re = Regex::new(
        r#"(?is)<span[^>]*class=['"]ocrx_word['"][^>]*title=['"]bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)[^'"]*['"][^>]*>(.*?)</span>"#,
    )
    .context("hocr regex")?;

    let mut words = Vec::new();
    for cap in re.captures_iter(hocr) {
        let x1 = cap[1].parse::<i32>().unwrap_or(0);
        let y1 = cap[2].parse::<i32>().unwrap_or(0);
        let x2 = cap[3].parse::<i32>().unwrap_or(0);
        let y2 = cap[4].parse::<i32>().unwrap_or(0);
        // Strip inner HTML tags (tesseract wraps with <strong>, <em>...)
        let inner = cap[5].to_string();
        let stripped = strip_tags(&inner);
        let decoded = html_escape::decode_html_entities(&stripped).to_string();
        let text = decoded.trim().to_string();
        if !text.is_empty() {
            words.push(OcrWord { text, x1, y1, x2, y2 });
        }
    }
    Ok(words)
}

fn strip_tags(s: &str) -> String {
    let re = Regex::new(r"<[^>]*>").unwrap();
    re.replace_all(s, "").to_string()
}

fn match_entity_bboxes(entity_text: &str, words: &[OcrWord]) -> Vec<Bbox> {
    let needle: Vec<String> = entity_text
        .split_whitespace()
        .map(normalize_word)
        .filter(|s| !s.is_empty())
        .collect();
    if needle.is_empty() {
        return Vec::new();
    }

    let mut matches = Vec::new();
    if words.len() < needle.len() {
        return matches;
    }

    for start in 0..=words.len() - needle.len() {
        let window = &words[start..start + needle.len()];
        let ok = window.iter().zip(needle.iter()).all(|(w, target)| {
            let candidate = normalize_word(&w.text);
            if candidate == *target {
                true
            } else {
                levenshtein(&candidate, target) <= FUZZY_TOLERANCE
            }
        });
        if ok {
            let x1 = window.iter().map(|w| w.x1).min().unwrap_or(0);
            let y1 = window.iter().map(|w| w.y1).min().unwrap_or(0);
            let x2 = window.iter().map(|w| w.x2).max().unwrap_or(0);
            let y2 = window.iter().map(|w| w.y2).max().unwrap_or(0);
            matches.push(Bbox { x1, y1, x2, y2 });
        }
    }
    matches
}

fn normalize_word(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

fn levenshtein(a: &str, b: &str) -> usize {
    if a == b {
        return 0;
    }
    let la = a.chars().count();
    let lb = b.chars().count();
    if la == 0 {
        return lb;
    }
    if lb == 0 {
        return la;
    }
    if la.abs_diff(lb) > 2 {
        return 99;
    }
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=lb).collect();
    let mut curr: Vec<usize> = vec![0; lb + 1];
    for i in 1..=la {
        curr[0] = i;
        for j in 1..=lb {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1)
                .min(curr[j - 1] + 1)
                .min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[lb]
}

fn draw_redaction(img: &mut RgbaImage, bb: Bbox) {
    let x = (bb.x1 - BBOX_PADDING).max(0);
    let y = (bb.y1 - BBOX_PADDING).max(0);
    let w = ((bb.x2 - bb.x1) + 2 * BBOX_PADDING).max(1) as u32;
    let h = ((bb.y2 - bb.y1) + 2 * BBOX_PADDING).max(1) as u32;
    draw_filled_rect_mut(img, Rect::at(x, y).of_size(w, h), Rgba([0u8, 0, 0, 255]));
}

fn pdf_from_image(image_path: &Path, output_base: &Path) -> Result<()> {
    let mut cmd = Command::new(resolve_tool("tesseract"));
    cmd.arg(image_path)
        .arg(output_base)
        .arg("-l")
        .arg("fra")
        .arg("pdf");
    if let Some(td) = tessdata_dir() {
        if td.exists() {
            cmd.env("TESSDATA_PREFIX", td);
        }
    }
    let output = cmd.output().context("spawn tesseract pdf")?;
    if !output.status.success() {
        return Err(anyhow!(
            "tesseract pdf failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

fn concatenate_pdfs(page_pdfs: &[PathBuf], output: &Path) -> Result<()> {
    let mut cmd = Command::new(resolve_tool("pdfunite"));
    for p in page_pdfs {
        cmd.arg(p);
    }
    cmd.arg(output);
    let status = cmd.status().context("spawn pdfunite")?;
    if !status.success() {
        return Err(anyhow!("pdfunite failed"));
    }
    Ok(())
}
