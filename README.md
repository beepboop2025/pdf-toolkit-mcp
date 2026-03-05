# adobe-pdf-mcp

A comprehensive MCP server for PDF operations. **29 tools** for reading, creating, merging, splitting, watermarking, stamping, form filling, redacting, annotating, and more.

## Features

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

## Installation

```bash
cd adobe-pdf-mcp
npm install
npm run build
```

## Configuration

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "adobe-pdf": {
      "command": "node",
      "args": ["/path/to/adobe-pdf-mcp/dist/index.js"]
    }
  }
}
```

### Dev mode (no build)

```json
{
  "mcpServers": {
    "adobe-pdf": {
      "command": "npx",
      "args": ["tsx", "/path/to/adobe-pdf-mcp/src/index.ts"]
    }
  }
}
```

## Tool Reference

### Reading

**`pdf_read_text`** — Extract text from all or specific pages.
- `filePath` (string) — PDF path
- `pages` (number[], optional) — Page numbers to extract (1-indexed)

**`pdf_info`** — Page count, file size, metadata, form fields, page dimensions, PDF version.
- `filePath` (string) — PDF path
- `password` (string, optional)

### Creating

**`pdf_create`** — Create a PDF from text with auto word-wrapping, pagination, and headings.
- `outputPath`, `content` (required) — Lines starting with `# ` render as bold headings
- `fontSize` (12), `margin` (50), `lineSpacing` (1.4), `pageSize` (A4/Letter/Legal/A3/A5), `font` (Helvetica/TimesRoman/Courier)
- `title`, `author` (optional metadata)

**`pdf_images_to_pdf`** — Convert PNG/JPG images to a PDF.
- `imagePaths` (string[]), `outputPath`
- `pageSize` (A4/Letter/Legal/FitImage), `margin` (0)

### Manipulating

**`pdf_merge`** — Merge multiple PDFs into one.
- `filePaths` (string[], min 2), `outputPath`

**`pdf_split`** — Split into individual pages or custom ranges.
- `filePath`, `outputDir`, `ranges` (optional `[{start, end}]`)

**`pdf_rotate`** — Rotate pages 90/180/270 degrees.
- `filePath`, `outputPath`, `rotation`, `pages` (optional)

**`pdf_delete_pages`** — Remove pages.
- `filePath`, `outputPath`, `pages` (number[])

**`pdf_extract_pages`** — Extract specific pages to a new PDF.
- `filePath`, `outputPath`, `pages` (number[])

**`pdf_reorder`** — Reorder (or duplicate) pages.
- `filePath`, `outputPath`, `pageOrder` (number[])

**`pdf_insert_pages`** — Insert pages from one PDF into another at a position.
- `targetPath`, `sourcePath`, `outputPath`, `insertAfter` (0 = beginning)
- `sourcePages` (optional — which source pages to use)

**`pdf_reverse`** — Reverse page order.
- `filePath`, `outputPath`

**`pdf_blank_pages`** — Insert blank pages after specified positions.
- `filePath`, `outputPath`, `afterPages` (number[])
- `pageSize` (MatchPrevious/A4/Letter/Legal)

**`pdf_crop`** — Crop pages by setting a crop box.
- `filePath`, `outputPath`, `x`, `y`, `width`, `height`
- `pages` (optional)

**`pdf_overlay_pdf`** — Overlay one PDF on top of another (letterhead, templates).
- `basePath`, `overlayPath`, `outputPath`
- `overlayPage` (1), `pages` (optional)

### Overlays

**`pdf_watermark`** — Diagonal text watermark with proper rotation centering.
- `filePath`, `outputPath`, `text`
- `opacity` (0.15), `fontSize` (60), `color` (#888888), `rotation` (45)
- `pages` (optional)

**`pdf_page_numbers`** — Add page numbers.
- `filePath`, `outputPath`
- `position` (bottom-center), `startNumber` (1), `prefix`, `suffix`
- `fontSize` (10), `margin` (30), `color` (#4d4d4d)

**`pdf_add_text`** — Add text at exact coordinates. Supports multi-line (\\n) and bold fonts.
- `filePath`, `outputPath`, `text`, `page`, `x`, `y`
- `fontSize` (12), `color` (black), `font` (Helvetica/HelveticaBold/TimesRoman/TimesRomanBold/Courier/CourierBold)
- `lineSpacing` (1.4)

**`pdf_add_image`** — Add PNG/JPG at exact coordinates.
- `filePath`, `outputPath`, `imagePath`, `page`, `x`, `y`
- `width`, `height` (proportional scaling), `opacity` (1)

**`pdf_header_footer`** — Headers/footers with `{page}` and `{pages}` placeholders.
- `filePath`, `outputPath`, `header`, `footer`
- `fontSize` (9), `margin` (30), `align` (center), `color` (#4d4d4d)

**`pdf_stamp`** — Styled business stamps with border and rotation.
- `filePath`, `outputPath`
- `type`: APPROVED, REJECTED, CONFIDENTIAL, DRAFT, FINAL, COPY, VOID, ORIGINAL, REVISED, FOR REVIEW, CUSTOM
- `customText` (for CUSTOM type)
- `position` (top-right), `pages` (optional), `opacity` (0.75), `rotation` (-15)

**`pdf_sign`** — Add signature image with smart positioning.
- `filePath`, `outputPath`, `imagePath`
- `page` (last page), `position` (bottom-right), `width` (150), `margin` (50)

### Annotating

**`pdf_redact`** — Draw opaque boxes over sensitive content.
- `filePath`, `outputPath`
- `regions` — `[{page, x, y, width, height}]`
- `color` (black)

**`pdf_highlight`** — Translucent highlight boxes.
- `filePath`, `outputPath`
- `highlights` — `[{page, x, y, width, height, color?}]` (per-highlight color)
- `opacity` (0.35)

**`pdf_draw`** — Draw shapes: rectangle, line, ellipse.
- `filePath`, `outputPath`
- `shapes` — `[{type, page, x, y, width?, height?, color?, borderColor?, borderWidth?, filled?, opacity?}]`
- For lines: `width`/`height` = end x/y coordinates

### Forms

**`pdf_form_read`** — List all form fields with names, types, values, options.
- `filePath`, `password` (optional)

**`pdf_form_fill`** — Fill form fields by name.
- `filePath`, `outputPath`
- `fields` — `{"fieldName": "value"}`. Checkboxes: "true"/"false". Dropdowns/radio: option value.
- `flatten` (false) — make non-editable
- `password` (optional)

### Metadata

**`pdf_set_metadata`** — Set document metadata.
- `filePath`, `outputPath`
- `title`, `author`, `subject`, `creator`, `producer` (string, optional)
- `keywords` (string[], optional)

### Security

**`pdf_decrypt`** — Remove password protection (requires password).
- `filePath`, `password`, `outputPath`

## Color Support

All color parameters accept:
- **Hex (6-char):** `#ff0000`
- **Hex (3-char):** `#f00`
- **Named colors:** `red`, `blue`, `navy`, `teal`, `gold`, `coral`, `salmon`, `indigo`, `crimson`, `tomato`, and 20+ more

## Coordinate System

- Origin: **bottom-left** corner of each page
- Units: **points** (1 inch = 72 points)
- Standard sizes: A4 = 595 x 842, Letter = 612 x 792, Legal = 612 x 1008

## Limitations

- **Text extraction** — text-based PDFs only (no OCR for scanned images)
- **Encryption** — can decrypt (with password) but cannot encrypt
- **Images** — PNG and JPG only
- **Fonts** — Helvetica, Times Roman, Courier (standard PDF fonts, with bold/italic variants)
- **Redaction** — visual only (covers content but doesn't strip underlying PDF data)

## Tech Stack

- [pdf-lib](https://pdf-lib.js.org/) — PDF creation and manipulation
- [unpdf](https://github.com/nicbou/unpdf) — Text extraction (modern pdf.js wrapper)
- [@modelcontextprotocol/sdk](https://modelcontextprotocol.io/) — MCP server framework

## License

MIT
