import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { loadPdf, loadPdfBuffer, savePdf, formatBytes, toolResult, toolError, errMsg } from '../utils.js';

export function registerOptimizeTools(server: McpServer) {
  server.tool(
    'pdf_flatten',
    'Flatten a PDF — converts all form fields and annotations into static page content. Fields become non-editable. Useful for finalizing documents before distribution.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
    },
    async ({ filePath, outputPath }) => {
      try {
        const doc = await loadPdf(filePath);
        const form = doc.getForm();
        const fieldCount = form.getFields().length;
        form.flatten();

        const result = await savePdf(doc, outputPath);
        return toolResult(`Flattened ${fieldCount} form field(s): ${result.path}\nSize: ${formatBytes(result.size)}`);
      } catch (error: unknown) {
        return toolError(`Failed to flatten: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_compress',
    'Attempt to reduce PDF file size by rebuilding the document structure. Copies all pages to a fresh PDF (dropping orphaned objects), and optionally strips metadata. Results vary — works best on PDFs with accumulated edits or orphaned data.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      stripMetadata: z.boolean().optional().default(false).describe('Remove title, author, subject, keywords (default: false)'),
      flattenForms: z.boolean().optional().default(false).describe('Flatten form fields to reduce size (default: false)'),
    },
    async ({ filePath, outputPath, stripMetadata, flattenForms }) => {
      try {
        const absPath = path.resolve(filePath);
        const originalSize = (await fs.stat(absPath)).size;
        const source = await loadPdf(filePath);

        // Build a clean document with only the pages (drops orphaned objects)
        const doc = await PDFDocument.create();

        // Copy all pages
        const totalPages = source.getPageCount();
        const indices = Array.from({ length: totalPages }, (_, i) => i);
        const pages = await doc.copyPages(source, indices);
        pages.forEach((p) => doc.addPage(p));

        // Carry over metadata (unless stripping)
        if (!stripMetadata) {
          const title = source.getTitle();
          const author = source.getAuthor();
          const subject = source.getSubject();
          const creator = source.getCreator();
          if (title) doc.setTitle(title);
          if (author) doc.setAuthor(author);
          if (subject) doc.setSubject(subject);
          if (creator) doc.setCreator(creator);
        }

        if (flattenForms) {
          try { doc.getForm().flatten(); } catch { /* no forms */ }
        }

        const result = await savePdf(doc, outputPath);
        const saved = originalSize - result.size;
        const pct = originalSize > 0 ? ((saved / originalSize) * 100).toFixed(1) : '0';

        const status = saved > 0
          ? `Compressed: ${formatBytes(originalSize)} -> ${formatBytes(result.size)} (saved ${formatBytes(saved)}, ${pct}%)`
          : `No size reduction achieved (${formatBytes(originalSize)} -> ${formatBytes(result.size)}). PDF may already be optimized.`;

        return toolResult(`${status}\nOutput: ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to compress: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_validate',
    'Validate a PDF file — checks if it can be parsed, reports page count, metadata, form fields, and any structural issues. Useful as a health check before processing.',
    {
      filePath: z.string().describe('PDF file path'),
    },
    async ({ filePath }) => {
      try {
        const absPath = path.resolve(filePath);
        const stats = await fs.stat(absPath);
        const issues: string[] = [];
        const info: string[] = [];

        info.push(`File: ${path.basename(filePath)}`);
        info.push(`Size: ${formatBytes(stats.size)}`);

        if (stats.size === 0) {
          return toolError('File is empty (0 bytes).');
        }

        // Check PDF header magic bytes
        const buffer = await loadPdfBuffer(filePath);
        const header = buffer.slice(0, 5).toString('ascii');
        if (!header.startsWith('%PDF-')) {
          issues.push('Missing PDF header (%PDF-). File may not be a valid PDF.');
        } else {
          const version = buffer.slice(5, 8).toString('ascii').trim();
          info.push(`PDF header version: ${header}${version}`);
        }

        // Try to parse
        let doc: PDFDocument;
        try {
          doc = await PDFDocument.load(buffer, {
            ignoreEncryption: true,
          });
        } catch (loadErr: unknown) {
          issues.push(`Parse error: ${errMsg(loadErr)}`);
          return toolResult([
            ...info,
            '',
            `Issues (${issues.length}):`,
            ...issues.map((i) => `  - ${i}`),
            '',
            'RESULT: INVALID - PDF could not be parsed.',
          ].join('\n'));
        }

        const pageCount = doc.getPageCount();
        info.push(`Pages: ${pageCount}`);

        if (pageCount === 0) {
          issues.push('PDF has 0 pages.');
        }

        // Check metadata
        const title = doc.getTitle();
        const author = doc.getAuthor();
        info.push(`Title: ${title || '(none)'}`);
        info.push(`Author: ${author || '(none)'}`);

        // Check forms
        try {
          const fields = doc.getForm().getFields();
          info.push(`Form fields: ${fields.length}`);
        } catch {
          info.push('Form fields: (unable to read)');
        }

        // Check pages for issues
        for (let i = 0; i < pageCount; i++) {
          try {
            const page = doc.getPage(i);
            const { width, height } = page.getSize();
            if (width <= 0 || height <= 0) {
              issues.push(`Page ${i + 1} has invalid dimensions: ${width} x ${height}`);
            }
          } catch (pageErr: unknown) {
            issues.push(`Page ${i + 1} error: ${errMsg(pageErr)}`);
          }
        }

        const valid = issues.length === 0;
        const result = [
          ...info,
          '',
          issues.length > 0 ? `Issues (${issues.length}):` : null,
          ...issues.map((i) => `  - ${i}`),
          '',
          valid ? 'RESULT: VALID - PDF parsed successfully with no issues.' : 'RESULT: WARNING - PDF parsed but has issues (see above).',
        ].filter((line) => line !== null).join('\n');

        return toolResult(result);
      } catch (error: unknown) {
        return toolError(`Failed to validate: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_repair',
    'Attempt to repair a damaged or malformed PDF by loading it with lenient parsing, copying all recoverable pages to a clean document, and re-saving. May fix issues like corrupted cross-reference tables or orphaned objects.',
    {
      filePath: z.string().describe('Path to the damaged PDF'),
      outputPath: z.string().describe('Path for the repaired PDF'),
    },
    async ({ filePath, outputPath }) => {
      try {
        const buffer = await loadPdfBuffer(filePath);
        const originalSize = buffer.length;

        // Try loading with lenient options
        let source: PDFDocument;
        try {
          source = await PDFDocument.load(buffer, {
            ignoreEncryption: true,
            updateMetadata: false,
          });
        } catch (firstTry: unknown) {
          // If standard load fails, try with throwOnInvalidObject: false
          // (pdf-lib may still reject severely damaged files)
          return toolError(`PDF is too damaged to repair: ${errMsg(firstTry)}`);
        }

        const sourcePages = source.getPageCount();
        if (sourcePages === 0) {
          return toolError('PDF has no recoverable pages.');
        }

        // Copy all pages to a fresh document
        const doc = await PDFDocument.create();
        let recovered = 0;
        const errors: string[] = [];

        for (let i = 0; i < sourcePages; i++) {
          try {
            const [page] = await doc.copyPages(source, [i]);
            doc.addPage(page);
            recovered++;
          } catch (pageErr: unknown) {
            errors.push(`Page ${i + 1}: ${errMsg(pageErr)}`);
          }
        }

        if (recovered === 0) {
          return toolError('Could not recover any pages from the PDF.');
        }

        // Preserve metadata
        try {
          const title = source.getTitle();
          const author = source.getAuthor();
          if (title) doc.setTitle(title);
          if (author) doc.setAuthor(author);
        } catch { /* metadata may be damaged */ }

        const result = await savePdf(doc, outputPath);
        const lines = [
          `Repair complete: ${result.path}`,
          `Recovered: ${recovered}/${sourcePages} page(s)`,
          `Size: ${formatBytes(originalSize)} -> ${formatBytes(result.size)}`,
        ];
        if (errors.length > 0) {
          lines.push(`Unrecoverable pages:`);
          lines.push(...errors.map((e) => `  - ${e}`));
        }

        return toolResult(lines.join('\n'));
      } catch (error: unknown) {
        return toolError(`Failed to repair: ${errMsg(error)}`);
      }
    }
  );
}
