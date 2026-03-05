import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PDFDocument, degrees } from 'pdf-lib';
import path from 'path';
import { loadPdf, savePdf, resolvePageIndices, ensureDir, formatBytes, getPageSize, toolResult, toolError, errMsg } from '../utils.js';

export function registerManipulateTools(server: McpServer) {
  server.tool(
    'pdf_merge',
    'Merge multiple PDF files into a single PDF. Pages are combined in the order listed.',
    {
      filePaths: z.array(z.string()).min(2).describe('PDF file paths to merge in desired order (min 2)'),
      outputPath: z.string().describe('Output path for the merged PDF'),
    },
    async ({ filePaths, outputPath }) => {
      try {
        const merged = await PDFDocument.create();
        for (const fp of filePaths) {
          const donor = await loadPdf(fp);
          const indices = Array.from({ length: donor.getPageCount() }, (_, i) => i);
          const pages = await merged.copyPages(donor, indices);
          pages.forEach((p) => merged.addPage(p));
        }
        const result = await savePdf(merged, outputPath);
        return toolResult(`Merged ${filePaths.length} PDFs: ${result.path}\nTotal pages: ${result.pages} | Size: ${formatBytes(result.size)}`);
      } catch (error: unknown) {
        return toolError(`Failed to merge: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_split',
    'Split a PDF into multiple files — either individual pages or custom page ranges.',
    {
      filePath: z.string().describe('PDF file to split'),
      outputDir: z.string().describe('Directory for output files'),
      ranges: z.array(z.object({
        start: z.number().describe('Start page (1-indexed)'),
        end: z.number().describe('End page (1-indexed, inclusive)'),
      })).optional().describe('Page ranges. If omitted, splits into individual pages.'),
    },
    async ({ filePath, outputDir, ranges }) => {
      try {
        const source = await loadPdf(filePath);
        const totalPages = source.getPageCount();
        const baseName = path.basename(filePath, path.extname(filePath));
        await ensureDir(outputDir);
        const created: string[] = [];

        if (ranges && ranges.length > 0) {
          for (const { start, end } of ranges) {
            const doc = await PDFDocument.create();
            const indices = [];
            for (let p = Math.max(1, start); p <= Math.min(end, totalPages); p++) indices.push(p - 1);
            if (indices.length === 0) continue;
            const pages = await doc.copyPages(source, indices);
            pages.forEach((p) => doc.addPage(p));
            const outPath = path.join(outputDir, `${baseName}_pages_${start}-${end}.pdf`);
            await savePdf(doc, outPath);
            created.push(outPath);
          }
        } else {
          for (let i = 0; i < totalPages; i++) {
            const doc = await PDFDocument.create();
            const [page] = await doc.copyPages(source, [i]);
            doc.addPage(page);
            const outPath = path.join(outputDir, `${baseName}_page_${i + 1}.pdf`);
            await savePdf(doc, outPath);
            created.push(outPath);
          }
        }

        return toolResult(`Split into ${created.length} file(s) in ${path.resolve(outputDir)}/\n${created.map((f) => `  - ${path.basename(f)}`).join('\n')}`);
      } catch (error: unknown) {
        return toolError(`Failed to split: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_rotate',
    'Rotate pages by 90, 180, or 270 degrees clockwise.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      rotation: z.enum(['90', '180', '270']).describe('Clockwise rotation degrees'),
      pages: z.array(z.number()).optional().describe('Pages to rotate (1-indexed). Omit for all pages.'),
    },
    async ({ filePath, outputPath, rotation, pages }) => {
      try {
        const doc = await loadPdf(filePath);
        const indices = resolvePageIndices(pages, doc.getPageCount());
        const angle = parseInt(rotation);
        for (const idx of indices) {
          const page = doc.getPage(idx);
          page.setRotation(degrees((page.getRotation().angle + angle) % 360));
        }
        const result = await savePdf(doc, outputPath);
        return toolResult(`Rotated ${indices.length} page(s) by ${rotation}deg: ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to rotate: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_delete_pages',
    'Remove specific pages from a PDF.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      pages: z.array(z.number()).min(1).describe('Page numbers to delete (1-indexed)'),
    },
    async ({ filePath, outputPath, pages }) => {
      try {
        const source = await loadPdf(filePath);
        const total = source.getPageCount();
        const deleteSet = new Set(pages.map((p) => p - 1));
        const keep = Array.from({ length: total }, (_, i) => i).filter((i) => !deleteSet.has(i));
        if (keep.length === 0) return toolError('Cannot delete all pages');

        const doc = await PDFDocument.create();
        const copied = await doc.copyPages(source, keep);
        copied.forEach((p) => doc.addPage(p));
        const result = await savePdf(doc, outputPath);
        return toolResult(`Deleted ${pages.length} page(s): ${result.path}\nRemaining: ${result.pages}`);
      } catch (error: unknown) {
        return toolError(`Failed to delete pages: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_extract_pages',
    'Extract specific pages into a new PDF.',
    {
      filePath: z.string().describe('Source PDF path'),
      outputPath: z.string().describe('Output path'),
      pages: z.array(z.number()).min(1).describe('Page numbers to extract (1-indexed)'),
    },
    async ({ filePath, outputPath, pages }) => {
      try {
        const source = await loadPdf(filePath);
        const total = source.getPageCount();
        const indices = pages.map((p) => p - 1).filter((p) => p >= 0 && p < total);
        if (indices.length === 0) return toolError(`No valid pages. PDF has ${total} page(s).`);

        const doc = await PDFDocument.create();
        const copied = await doc.copyPages(source, indices);
        copied.forEach((p) => doc.addPage(p));
        const result = await savePdf(doc, outputPath);
        return toolResult(`Extracted ${indices.length} page(s): ${result.path}\nSize: ${formatBytes(result.size)}`);
      } catch (error: unknown) {
        return toolError(`Failed to extract: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_reorder',
    'Reorder pages. Can also duplicate pages by repeating numbers in the order array.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      pageOrder: z.array(z.number()).min(1).describe('New page order (1-indexed). Example: [3, 1, 2] puts page 3 first.'),
    },
    async ({ filePath, outputPath, pageOrder }) => {
      try {
        const source = await loadPdf(filePath);
        const total = source.getPageCount();
        const indices = pageOrder.map((p) => p - 1).filter((p) => p >= 0 && p < total);
        if (indices.length === 0) return toolError(`No valid pages. PDF has ${total} page(s).`);

        const doc = await PDFDocument.create();
        const copied = await doc.copyPages(source, indices);
        copied.forEach((p) => doc.addPage(p));
        const result = await savePdf(doc, outputPath);
        return toolResult(`Reordered PDF: ${result.path}\nOrder: [${pageOrder.join(', ')}] | Pages: ${result.pages}`);
      } catch (error: unknown) {
        return toolError(`Failed to reorder: ${errMsg(error)}`);
      }
    }
  );

  // --- NEW TOOLS ---

  server.tool(
    'pdf_insert_pages',
    'Insert pages from one PDF into another at a specific position. Useful for adding cover pages, appendices, or inserting content mid-document.',
    {
      targetPath: z.string().describe('PDF to insert pages into'),
      sourcePath: z.string().describe('PDF to take pages from'),
      outputPath: z.string().describe('Output path'),
      insertAfter: z.number().describe('Insert after this page number (0 = insert at beginning, use page count for end)'),
      sourcePages: z.array(z.number()).optional().describe('Which pages to take from source (1-indexed). Omit for all source pages.'),
    },
    async ({ targetPath, sourcePath, outputPath, insertAfter, sourcePages }) => {
      try {
        const target = await loadPdf(targetPath);
        const source = await loadPdf(sourcePath);
        const targetTotal = target.getPageCount();
        const sourceTotal = source.getPageCount();

        const srcIndices = sourcePages
          ? sourcePages.map((p) => p - 1).filter((p) => p >= 0 && p < sourceTotal)
          : Array.from({ length: sourceTotal }, (_, i) => i);

        if (srcIndices.length === 0) return toolError('No valid source pages.');

        const doc = await PDFDocument.create();
        const pos = Math.max(0, Math.min(insertAfter, targetTotal));

        // Copy pages before insertion point
        if (pos > 0) {
          const before = await doc.copyPages(target, Array.from({ length: pos }, (_, i) => i));
          before.forEach((p) => doc.addPage(p));
        }

        // Copy inserted pages
        const inserted = await doc.copyPages(source, srcIndices);
        inserted.forEach((p) => doc.addPage(p));

        // Copy pages after insertion point
        if (pos < targetTotal) {
          const after = await doc.copyPages(target, Array.from({ length: targetTotal - pos }, (_, i) => i + pos));
          after.forEach((p) => doc.addPage(p));
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(`Inserted ${srcIndices.length} page(s) after page ${pos}: ${result.path}\nTotal pages: ${result.pages}`);
      } catch (error: unknown) {
        return toolError(`Failed to insert pages: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_reverse',
    'Reverse the page order of a PDF. Useful for fixing scan order or printing back-to-front.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
    },
    async ({ filePath, outputPath }) => {
      try {
        const source = await loadPdf(filePath);
        const total = source.getPageCount();
        const indices = Array.from({ length: total }, (_, i) => total - 1 - i);

        const doc = await PDFDocument.create();
        const copied = await doc.copyPages(source, indices);
        copied.forEach((p) => doc.addPage(p));
        const result = await savePdf(doc, outputPath);
        return toolResult(`Reversed ${total} pages: ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to reverse: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_blank_pages',
    'Insert blank pages into a PDF at specified positions. Useful for adding separator pages or ensuring chapters start on odd pages.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      afterPages: z.array(z.number()).describe('Insert a blank page after each of these page numbers (1-indexed). Use 0 to add at the beginning.'),
      pageSize: z.enum(['A4', 'Letter', 'Legal', 'MatchPrevious']).optional().default('MatchPrevious').describe('"MatchPrevious" matches the size of the preceding page (default)'),
    },
    async ({ filePath, outputPath, afterPages, pageSize }) => {
      try {
        const source = await loadPdf(filePath);
        const total = source.getPageCount();
        const insertSet = new Set(afterPages);

        const doc = await PDFDocument.create();

        // Insert at beginning if 0 is specified
        if (insertSet.has(0)) {
          const size = pageSize === 'MatchPrevious' ? getPageSize('A4') : getPageSize(pageSize);
          doc.addPage(size);
        }

        for (let i = 0; i < total; i++) {
          const [copied] = await doc.copyPages(source, [i]);
          doc.addPage(copied);

          if (insertSet.has(i + 1)) {
            let size: [number, number];
            if (pageSize === 'MatchPrevious') {
              const { width, height } = source.getPage(i).getSize();
              size = [width, height];
            } else {
              size = getPageSize(pageSize);
            }
            doc.addPage(size);
          }
        }

        const result = await savePdf(doc, outputPath);
        const blanksAdded = afterPages.length;
        return toolResult(`Added ${blanksAdded} blank page(s): ${result.path}\nTotal pages: ${result.pages}`);
      } catch (error: unknown) {
        return toolError(`Failed to add blank pages: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_crop',
    'Crop pages by setting the visible area (crop box). Trims margins or isolates a region. Coordinates are in points from bottom-left.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      x: z.number().describe('Left edge of crop area (points from left)'),
      y: z.number().describe('Bottom edge of crop area (points from bottom)'),
      width: z.number().describe('Width of crop area in points'),
      height: z.number().describe('Height of crop area in points'),
      pages: z.array(z.number()).optional().describe('Pages to crop (1-indexed). Omit for all pages.'),
    },
    async ({ filePath, outputPath, x, y, width, height, pages }) => {
      try {
        const doc = await loadPdf(filePath);
        const indices = resolvePageIndices(pages, doc.getPageCount());

        for (const idx of indices) {
          const page = doc.getPage(idx);
          page.setCropBox(x, y, width, height);
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(`Cropped ${indices.length} page(s) to ${width}x${height} pts: ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to crop: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_overlay_pdf',
    'Overlay one PDF on top of another. The overlay PDF is drawn on top of the base PDF pages. Perfect for adding letterheads, templates, or watermark PDFs.',
    {
      basePath: z.string().describe('Base PDF (background)'),
      overlayPath: z.string().describe('Overlay PDF (drawn on top)'),
      outputPath: z.string().describe('Output path'),
      overlayPage: z.number().optional().default(1).describe('Which page of the overlay PDF to use (1-indexed, default: 1)'),
      pages: z.array(z.number()).optional().describe('Which base pages to apply the overlay to (1-indexed). Omit for all pages.'),
    },
    async ({ basePath, overlayPath, outputPath, overlayPage, pages }) => {
      try {
        const base = await loadPdf(basePath);
        const overlay = await loadPdf(overlayPath);
        const totalBase = base.getPageCount();
        const overlayTotal = overlay.getPageCount();

        if (overlayPage < 1 || overlayPage > overlayTotal) {
          return toolError(`Overlay page ${overlayPage} out of range. Overlay has ${overlayTotal} page(s).`);
        }

        const indices = resolvePageIndices(pages, totalBase);

        // Embed the overlay page as a form XObject
        const [embeddedPage] = await base.embedPages([overlay.getPage(overlayPage - 1)]);

        for (const idx of indices) {
          const page = base.getPage(idx);
          const { width, height } = page.getSize();
          page.drawPage(embeddedPage, {
            x: 0,
            y: 0,
            width,
            height,
          });
        }

        const result = await savePdf(base, outputPath);
        return toolResult(`Overlay applied to ${indices.length} page(s): ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to overlay: ${errMsg(error)}`);
      }
    }
  );
}
