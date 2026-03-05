# pdf-toolkit-mcp

A comprehensive MCP (Model Context Protocol) server for PDF operations. **29 tools** for reading, creating, merging, splitting, watermarking, stamping, form filling, redacting, annotating, and more.

Built on open-source libraries — **not affiliated with Adobe**. Uses [pdf-lib](https://pdf-lib.js.org/) for PDF manipulation and [unpdf](https://github.com/nicbou/unpdf) (Mozilla pdf.js) for text extraction.

## Requirements

- **Node.js >= 18** (tested on Node 18, 20, 22, 24)
- npm or compatible package manager

## Installation

```bash
git clone https://github.com/beepboop2025/pdf-toolkit-mcp.git
cd pdf-toolkit-mcp
npm install
npm run build
```

## Configuration

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "pdf-toolkit": {
      "command": "node",
      "args": ["/path/to/pdf-toolkit-mcp/dist/index.js"]
    }
  }
}
```

### Dev mode (no build step)

```json
{
  "mcpServers": {
    "pdf-toolkit": {
      "command": "npx",
      "args": ["tsx", "/path/to/pdf-toolkit-mcp/src/index.ts"]
    }
  }
}
```

## Tools Overview

| Category | Tools | Count |
|----------|-------|-------|
| **Read** | Extract text (per-page), PDF info & metadata | 2 |
| **Create** | Generate PDFs from text (with headings), images to PDF | 2 |
| **Manipulate** | Merge, split, rotate, delete, extract, reorder, insert, reverse, blank pages, crop, overlay PDF | 11 |
| **Overlay** | Watermark, page numbers, add text, add image, headers/footers, business stamps, signatures | 7 |
| **Annotate** | Redact regions, highlight, draw shapes (rect/line/ellipse) | 3 |
| **Forms** | Read form fields, fill forms (text/checkbox/dropdown/radio) | 2 |
| **Metadata** | Set title, author, subject, keywords, creator, producer | 1 |
| **Security** | Decrypt password-protected PDFs | 1 |

## Tool Reference

### Reading

**`pdf_read_text`** — Extract text from all or specific pages.
- `filePath` (string, required) — PDF path
- `pages` (number[], optional) — Page numbers to extract (1-indexed). Returns per-page text with headers.

**`pdf_info`** — Page count, file size, all metadata, form field count, page dimensions (pts + inches), rotation, PDF version.
- `filePath` (string, required) — PDF path
- `password` (string, optional) — For encrypted PDFs

### Creating

**`pdf_create`** — Create a PDF from text with auto word-wrapping, pagination, and headings.
- `outputPath`, `content` (required) — Lines starting with `# ` render as bold headings
- `fontSize` (default: 12), `margin` (50), `lineSpacing` (1.4)
- `pageSize`: A4, Letter, Legal, A3, A5
- `font`: Helvetica, TimesRoman, Courier
- `title`, `author` (optional metadata)

**`pdf_images_to_pdf`** — Convert PNG/JPG images to a PDF, one per page.
- `imagePaths` (string[], required), `outputPath` (required)
- `pageSize`: A4, Letter, Legal, FitImage (default: A4)
- `margin` (default: 0) — Padding around image

### Manipulating

**`pdf_merge`** — Merge multiple PDFs.
- `filePaths` (string[], min 2), `outputPath`

**`pdf_split`** — Split into individual pages or custom ranges.
- `filePath`, `outputDir`
- `ranges` (optional) — `[{start, end}]` (1-indexed, inclusive). Omit to split into individual pages.

**`pdf_rotate`** — Rotate pages 90/180/270 degrees clockwise.
- `filePath`, `outputPath`, `rotation` ("90"/"180"/"270")
- `pages` (optional) — Omit for all pages

**`pdf_delete_pages`** — Remove specific pages.
- `filePath`, `outputPath`, `pages` (number[], required)

**`pdf_extract_pages`** — Extract specific pages into a new PDF.
- `filePath`, `outputPath`, `pages` (number[], required)

**`pdf_reorder`** — Reorder or duplicate pages.
- `filePath`, `outputPath`, `pageOrder` (number[]) — e.g. `[3, 1, 2]` or `[1, 1, 2]` to duplicate page 1

**`pdf_insert_pages`** — Insert pages from one PDF into another at a specific position.
- `targetPath`, `sourcePath`, `outputPath`
- `insertAfter` (number) — 0 = beginning, use target page count for end
- `sourcePages` (number[], optional) — Which source pages to take. Omit for all.

**`pdf_reverse`** — Reverse page order.
- `filePath`, `outputPath`

**`pdf_blank_pages`** — Insert blank pages after specified positions.
- `filePath`, `outputPath`
- `afterPages` (number[]) — e.g. `[0, 3]` inserts blanks at the beginning and after page 3
- `pageSize`: MatchPrevious (default), A4, Letter, Legal

**`pdf_crop`** — Crop pages by setting a crop box (does not resize, hides content outside the box).
- `filePath`, `outputPath`, `x`, `y`, `width`, `height` (all in points)
- `pages` (optional)

**`pdf_overlay_pdf`** — Overlay a single page from one PDF on top of another. Uses a single overlay page applied to selected base pages — not a page-by-page multi-page overlay.
- `basePath` (background), `overlayPath` (foreground), `outputPath`
- `overlayPage` (default: 1) — Which overlay page to use
- `pages` (optional) — Which base pages to apply it to

### Overlays

**`pdf_watermark`** — Diagonal text watermark, properly centered regardless of rotation angle.
- `filePath`, `outputPath`, `text` (required)
- `opacity` (0.15), `fontSize` (60), `color` (#888888), `rotation` (45 degrees)
- `pages` (optional)

**`pdf_page_numbers`** — Add page numbers to every page.
- `filePath`, `outputPath`
- `position`: bottom-center (default), bottom-left, bottom-right, top-center, top-left, top-right
- `startNumber` (1), `prefix` (""), `suffix` (""), `fontSize` (10), `margin` (30), `color` (#4d4d4d)

**`pdf_add_text`** — Add text at exact coordinates. Supports multi-line (`\n`) and bold fonts.
- `filePath`, `outputPath`, `text`, `page`, `x`, `y`
- `fontSize` (12), `color` (black), `lineSpacing` (1.4)
- `font`: Helvetica, HelveticaBold, TimesRoman, TimesRomanBold, Courier, CourierBold

**`pdf_add_image`** — Add PNG/JPG at exact coordinates.
- `filePath`, `outputPath`, `imagePath`, `page`, `x`, `y`
- `width`, `height` (proportional scaling if only one given; original size if both omitted)
- `opacity` (1)

**`pdf_header_footer`** — Headers and/or footers with dynamic placeholders.
- `filePath`, `outputPath`
- `header`, `footer` — Use `{page}` for current page, `{pages}` for total
- `fontSize` (9), `margin` (30), `align` (center/left/right), `color` (#4d4d4d)

**`pdf_stamp`** — Styled business stamps with border and rotation.
- `filePath`, `outputPath`
- `type`: APPROVED, REJECTED, CONFIDENTIAL, DRAFT, FINAL, COPY, VOID, ORIGINAL, REVISED, FOR REVIEW, CUSTOM
- `customText` (string, only for CUSTOM type)
- `position`: top-right (default), top-left, bottom-right, bottom-left, center
- `pages` (optional), `opacity` (0.75), `rotation` (-15)

**`pdf_sign`** — Add a signature image with smart positioning.
- `filePath`, `outputPath`, `imagePath`
- `page` (default: last page)
- `position`: bottom-right (default), bottom-left, bottom-center
- `width` (150, height scales proportionally), `margin` (50)

### Annotating

**`pdf_redact`** — Draw opaque rectangles over regions.
- `filePath`, `outputPath`
- `regions` — `[{page, x, y, width, height}]`
- `color` (default: black)

> **WARNING: Visual-only redaction.** This tool covers content with an opaque box but does **NOT** remove the underlying text or data from the PDF structure. The original content can still be extracted programmatically by anyone with a PDF parser. **Do NOT use this for true sanitization of sensitive data** (SSNs, passwords, PII, etc). For secure redaction that strips content from the PDF, use Adobe Acrobat Pro, `qpdf`, or `mutool clean`.

**`pdf_highlight`** — Translucent highlight boxes (like a highlighter pen).
- `filePath`, `outputPath`
- `highlights` — `[{page, x, y, width, height, color?}]` (per-highlight color, default: yellow)
- `opacity` (0.35)

**`pdf_draw`** — Draw shapes: rectangles, lines, and ellipses.
- `filePath`, `outputPath`
- `shapes` — array of shape objects:
  - **rectangle:** `{type: "rectangle", page, x, y, width, height, color?, borderColor?, borderWidth?, filled?, opacity?}`
  - **line:** `{type: "line", page, x, y, width, height}` where x/y = start point, width/height = end point coordinates
  - **ellipse:** `{type: "ellipse", page, x, y, width, height, color?, filled?, opacity?}`

### Forms

**`pdf_form_read`** — List all form fields with names, types, current values, and dropdown/radio options.
- `filePath`, `password` (optional)

**`pdf_form_fill`** — Fill form fields by name. Supports partial fills (unfilled fields remain editable).
- `filePath`, `outputPath`
- `fields` — `{"fieldName": "value"}`. Checkboxes: "true"/"false". Dropdowns/radio: the option value.
- `flatten` (default: false) — When true, all fields become non-editable (filled AND unfilled)
- `password` (optional)

### Metadata

**`pdf_set_metadata`** — Update document metadata. Only specified fields change; others are untouched.
- `filePath`, `outputPath`
- `title`, `author`, `subject`, `creator`, `producer` (all optional strings)
- `keywords` (string[], optional)

### Security

**`pdf_decrypt`** — Remove password protection (requires the correct password).
- `filePath`, `password`, `outputPath`

## Error Handling

All tools return structured error messages. Common scenarios:

| Scenario | Error Message |
|----------|--------------|
| File not found | `Error: ENOENT: no such file or directory, open '/path/to/file.pdf'` |
| Not a valid PDF | `Error: Failed to read PDF: ...` with parser details |
| Wrong password | `Error: Incorrect password or the PDF is not encrypted.` |
| Page out of range | `Error: Page 5 out of range (1-3).` or `No valid pages. PDF has 3 page(s).` |
| Unsupported image | `Error: Unsupported image format: .webp. Use PNG or JPG.` |
| Delete all pages | `Error: Cannot delete all pages` |
| No metadata given | `Error: No metadata fields specified. Provide at least one of: title, author, ...` |

Tools never throw unhandled exceptions — all errors are caught and returned as MCP error responses with `isError: true`.

## File Size & Performance

- **No hard file size limit** — bounded only by available memory (Node.js heap)
- PDFs up to ~100MB work reliably; larger files may need `--max-old-space-size`
- `pdf_merge` with many large files is the most memory-intensive operation
- `pdf_read_text` loads the entire PDF into memory for parsing
- All operations are single-threaded (no worker pool)

## Named Colors Reference

All color parameters (`color`, `borderColor`, highlight `color`, etc.) accept:

| Format | Example |
|--------|---------|
| **Hex (6-char)** | `#ff0000` |
| **Hex (3-char)** | `#f00` |
| **Named color** | `red` |

**Complete named color list (28 colors):**

| Color | Hex | Color | Hex |
|-------|-----|-------|-----|
| black | #000000 | white | #ffffff |
| red | #ff0000 | green | #00ff00 |
| blue | #0000ff | yellow | #ffff00 |
| orange | #ff8800 | purple | #800080 |
| pink | #ff69b4 | gray / grey | #808080 |
| cyan / aqua | #00ffff | magenta | #ff00ff |
| brown | #8b4513 | navy | #000080 |
| teal | #008080 | maroon | #800000 |
| olive | #808000 | lime | #00ff00 |
| coral | #ff7f50 | salmon | #fa8072 |
| gold | #ffd700 | silver | #c0c0c0 |
| indigo | #4b0082 | violet | #ee82ee |
| crimson | #dc143c | tomato | #ff6347 |

## Coordinate System

- Origin: **bottom-left** corner of each page
- Units: **points** (1 inch = 72 points, 1 cm ~ 28.35 points)
- Standard page sizes:

| Size | Width | Height | Inches |
|------|-------|--------|--------|
| A4 | 595 | 842 | 8.3" x 11.7" |
| Letter | 612 | 792 | 8.5" x 11" |
| Legal | 612 | 1008 | 8.5" x 14" |
| A3 | 842 | 1191 | 11.7" x 16.5" |
| A5 | 420 | 595 | 5.8" x 8.3" |

## Limitations

| Feature | Limitation |
|---------|-----------|
| **Text extraction** | Text-based PDFs only. No OCR for scanned images. |
| **Encryption** | Can decrypt (with password) but cannot encrypt/password-protect. |
| **Image formats** | PNG and JPG only. No WebP, SVG, TIFF, or GIF. |
| **Fonts** | Helvetica, Times Roman, Courier (standard PDF fonts with bold/italic). No custom font embedding. |
| **Redaction** | **Visual only** — covers content but does NOT strip data from the PDF. See warning above. |
| **Overlay** | Single overlay page applied to base pages. Not a page-by-page multi-page overlay. |
| **Form filling** | Supports partial fills. Flatten affects ALL fields (filled and unfilled). |
| **Compression** | No PDF optimization/compression tool. Load+save may slightly change file size. |
| **Annotations** | Drawn as page content (not PDF annotation objects). Cannot be toggled or removed by PDF viewers. |

## Tech Stack

- [pdf-lib](https://pdf-lib.js.org/) — PDF creation and manipulation (open-source, MIT)
- [unpdf](https://github.com/nicbou/unpdf) — Text extraction via Mozilla's pdf.js (open-source)
- [@modelcontextprotocol/sdk](https://modelcontextprotocol.io/) — MCP server framework

## Disclaimer

This project is **not affiliated with, endorsed by, or associated with Adobe Inc.** "PDF" is an open standard (ISO 32000). This tool uses open-source libraries to work with PDF files.

## License

MIT
