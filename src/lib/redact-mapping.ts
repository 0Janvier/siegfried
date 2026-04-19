import type { Entity } from "./types";

/**
 * Given a concatenated extraction text (with `=== file — page N ===`
 * separators inserted by `setPages`) and a list of entities, produce the
 * list of {file, page, text} redaction requests expected by the Rust
 * backend.
 *
 * Works by scanning the separator positions once, then bisecting each
 * entity's `start` offset into the appropriate page range.
 */
export interface RedactionRequest {
  file: string;
  page: number;
  text: string;
}

interface PageSpan {
  start: number;      // offset in text where this page's content begins
  end: number;        // offset where the next separator begins (or text length)
  file: string;
  page: number;
}

const SEPARATOR_RE = /=== (.+?) — page (\d+)(?: \(OCR\))? ===\n\n/g;

function buildPageSpans(text: string): PageSpan[] {
  const spans: PageSpan[] = [];
  SEPARATOR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  const headers: { idx: number; contentStart: number; file: string; page: number }[] = [];
  while ((match = SEPARATOR_RE.exec(text)) !== null) {
    headers.push({
      idx: match.index,
      contentStart: match.index + match[0].length,
      file: match[1],
      page: parseInt(match[2], 10),
    });
  }
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const endIdx = i + 1 < headers.length ? headers[i + 1].idx : text.length;
    spans.push({ start: h.contentStart, end: endIdx, file: h.file, page: h.page });
  }
  return spans;
}

export function entitiesToRedactionRequests(
  text: string,
  entities: Entity[]
): RedactionRequest[] {
  const spans = buildPageSpans(text);
  if (spans.length === 0) return [];

  // Filter enabled entities and map each to a page span.
  const seen = new Set<string>(); // dedupe (file, page, text)
  const out: RedactionRequest[] = [];

  for (const e of entities) {
    if (!e.enabled) continue;
    // Find span covering e.start
    const span = spans.find((s) => e.start >= s.start && e.start < s.end);
    if (!span) continue;
    const key = `${span.file}::${span.page}::${e.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file: span.file, page: span.page, text: e.text });
  }
  return out;
}
