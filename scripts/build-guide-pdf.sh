#!/usr/bin/env bash
# Build a styled PDF of GUIDE.md using pandoc + weasyprint.
# Usage: ./scripts/build-guide-pdf.sh
# Output: dist/Siegfried-Guide.pdf
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="docs"
HTML_TMP="$OUT_DIR/_guide.html"
PDF_OUT="$OUT_DIR/Siegfried-Guide.pdf"
CSS_TMP="$OUT_DIR/_guide.css"

mkdir -p "$OUT_DIR"

cat > "$CSS_TMP" <<'CSS'
@page {
  size: A4;
  margin: 22mm 20mm 22mm 20mm;
  @bottom-center {
    content: "Siegfried — Guide de l'utilisateur · page " counter(page) " / " counter(pages);
    font-family: "Futura", "Avenir Next", "Helvetica Neue", sans-serif;
    font-size: 9pt;
    color: #8e8e93;
  }
  @top-right {
    content: "v0.1.0";
    font-family: "Futura", sans-serif;
    font-size: 8pt;
    color: #b0b0b8;
  }
}

@page :first {
  @top-right { content: ""; }
  @bottom-center { content: ""; }
}

html, body {
  font-family: "Garamond", "EB Garamond", "Baskerville", "Georgia", serif;
  font-size: 12pt;
  line-height: 1.55;
  color: #1c1c1e;
  background: #fff;
}

/* Cover page */
.cover {
  page-break-after: always;
  min-height: 230mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 40mm 10mm 20mm;
  border-top: 3px solid #5696AB;
  border-bottom: 1px solid #e5e5ea;
}
.cover-title {
  font-family: "Futura", "Avenir Next", "Helvetica Neue", sans-serif;
  font-size: 44pt;
  font-weight: 300;
  letter-spacing: 0.02em;
  color: #5696AB;
  margin: 0 0 6mm;
}
.cover-sub {
  font-family: "Futura", sans-serif;
  font-size: 13pt;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4a4a4f;
  margin: 0 0 28mm;
}
.cover-tagline {
  font-style: italic;
  font-size: 13pt;
  color: #4a4a4f;
  max-width: 120mm;
  margin: 0 auto;
  line-height: 1.6;
}
.cover-meta {
  margin-top: auto;
  padding-top: 28mm;
  font-family: "Futura", sans-serif;
  font-size: 10pt;
  color: #8e8e93;
  letter-spacing: 0.05em;
}
.cover-meta strong { color: #5696AB; font-weight: 500; }

/* Headings */
h1, h2, h3 {
  font-family: "Futura", "Avenir Next", "Helvetica Neue", sans-serif;
  font-weight: 500;
  letter-spacing: -0.005em;
  color: #1c1c1e;
}
h1 {
  font-size: 22pt;
  margin: 14mm 0 4mm;
  padding-bottom: 2mm;
  border-bottom: 2px solid #5696AB;
  page-break-after: avoid;
}
h2 {
  font-size: 15pt;
  margin: 10mm 0 3mm;
  color: #5696AB;
  page-break-after: avoid;
}
h3 {
  font-size: 12pt;
  margin: 7mm 0 2mm;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #4a4a4f;
  page-break-after: avoid;
}

p { margin: 0 0 3mm; text-align: justify; hyphens: auto; }

/* Lists */
ul, ol { margin: 2mm 0 4mm; padding-left: 6mm; }
li { margin: 1mm 0; }
ul li::marker { color: #5696AB; }
ol li::marker { color: #5696AB; font-weight: 500; }

/* Inline code & code blocks */
code {
  font-family: "JetBrains Mono", "Menlo", "Consolas", monospace;
  font-size: 10pt;
  background: #f2f2f7;
  padding: 0.5mm 1.5mm;
  border-radius: 1mm;
  color: #3a3a3c;
}
pre {
  font-family: "JetBrains Mono", "Menlo", monospace;
  font-size: 9.5pt;
  background: #f7f7f9;
  border-left: 3px solid #5696AB;
  padding: 3mm 4mm;
  margin: 3mm 0;
  overflow: hidden;
  page-break-inside: avoid;
  border-radius: 0 1mm 1mm 0;
}
pre code { background: transparent; padding: 0; font-size: inherit; }

/* Blockquotes */
blockquote {
  border-left: 3px solid #5696AB;
  background: #f7f9fa;
  margin: 4mm 0;
  padding: 3mm 5mm;
  color: #2a2a2e;
  font-style: italic;
  page-break-inside: avoid;
  border-radius: 0 1mm 1mm 0;
}
blockquote p { margin: 0 0 2mm; }
blockquote p:last-child { margin-bottom: 0; }
blockquote strong { font-style: normal; color: #5696AB; }

/* Tables */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 3mm 0 5mm;
  page-break-inside: avoid;
  font-size: 10.5pt;
}
th {
  background: #5696AB;
  color: #fff;
  padding: 2mm 3mm;
  text-align: left;
  font-family: "Futura", sans-serif;
  font-weight: 500;
  font-size: 10pt;
  letter-spacing: 0.02em;
}
td {
  padding: 2mm 3mm;
  border-bottom: 1px solid #e5e5ea;
  vertical-align: top;
}
tr:nth-child(even) td { background: #f7f9fa; }

/* Horizontal rules → page breaks subtle */
hr {
  border: none;
  border-top: 1px solid #e5e5ea;
  margin: 6mm 0;
}

/* Strong / emphasis */
strong { color: #1c1c1e; font-weight: 600; }
em { color: #2a2a2e; }

/* Links */
a { color: #5696AB; text-decoration: none; border-bottom: 1px dotted #5696AB; }

/* Footer signature */
.signature {
  margin-top: 12mm;
  padding-top: 4mm;
  border-top: 1px solid #e5e5ea;
  text-align: center;
  font-family: "Futura", sans-serif;
  font-size: 9pt;
  color: #8e8e93;
  letter-spacing: 0.04em;
}
.signature strong { color: #5696AB; font-weight: 500; }
CSS

# Cover page as raw HTML, then append pandoc-rendered body
cat > "$HTML_TMP" <<'HTML_HEAD'
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>Siegfried — Guide de l'utilisateur</title>
<link rel="stylesheet" href="_guide.css">
</head>
<body>

<section class="cover">
  <h1 class="cover-title">Siegfried</h1>
  <p class="cover-sub">Guide de l'utilisateur</p>
  <p class="cover-tagline">
    Anonymiseur PDF 100 % local, pensé pour les avocats français.<br/>
    Concatène. Extrait. Pseudonymise. Rien ne quitte la machine.
  </p>
  <p class="cover-meta">
    <strong>Version 0.1.0</strong> &nbsp;·&nbsp; Apache License 2.0 &nbsp;·&nbsp; 2026
  </p>
</section>
HTML_HEAD

# Convert markdown body (skip the first H1 title of GUIDE.md since cover replaces it)
pandoc \
  --from gfm+smart \
  --to html5 \
  --no-highlight \
  GUIDE.md \
  >> "$HTML_TMP"

cat >> "$HTML_TMP" <<'HTML_FOOT'

<p class="signature">
  <strong>Marc Sztulman</strong> · Développeur amateur, avocat par ailleurs · © 2026
</p>

</body>
</html>
HTML_FOOT

weasyprint "$HTML_TMP" "$PDF_OUT"

rm -f "$HTML_TMP" "$CSS_TMP"

ls -lh "$PDF_OUT"
echo "PDF généré : $PDF_OUT"
