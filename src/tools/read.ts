import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractText, getMeta } from 'unpdf';
import { loadPdf, loadPdfBuffer, formatBytes, toolResult, toolError, errMsg } from '../utils.js';
import fs from 'fs/promises';
import path from 'path';

export function registerReadTools(server: McpServer) {
  server.tool(
    'pdf_read_text',
    'Extract text content from a PDF file. Can extract from all pages or specific pages. Works with text-based PDFs (not scanned images).',
    {
      filePath: z.string().describe('Absolute or relative path to the PDF file'),
      pages: z.array(z.number()).optional().describe('Specific page numbers to extract (1-indexed). If omitted, extracts all pages.'),
    },
    async ({ filePath, pages }) => {
      try {
        const buffer = await loadPdfBuffer(filePath);
        const pdf = new Uint8Array(buffer);

        // Extract per-page to support filtering
        const data = await extractText(pdf, { mergePages: false });
        const allPages = data.text as string[];
        const totalPages = data.totalPages;

        let selectedText: string;
        if (pages && pages.length > 0) {
          const validPages = pages.filter((p) => p >= 1 && p <= totalPages);
          if (validPages.length === 0) {
            return toolError(`No valid pages. PDF has ${totalPages} page(s).`);
          }
          selectedText = validPages
            .map((p) => `--- Page ${p} ---\n${allPages[p - 1] || '(empty)'}`)
            .join('\n\n');
        } else {
          selectedText = allPages
            .map((text, i) => `--- Page ${i + 1} ---\n${text || '(empty)'}`)
            .join('\n\n');
        }

        const header = `Text from: ${path.basename(filePath)} | Total pages: ${totalPages}`;
        return toolResult(`${header}\n\n${selectedText}`);
      } catch (error: unknown) {
        return toolError(`Failed to read PDF: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_info',
    'Get detailed information about a PDF: page count, file size, metadata (title, author, dates), form field count, and page dimensions in points and inches.',
    {
      filePath: z.string().describe('Absolute or relative path to the PDF file'),
      password: z.string().optional().describe('Password if the PDF is encrypted'),
    },
    async ({ filePath, password }) => {
      try {
        const absPath = path.resolve(filePath);
        const stats = await fs.stat(absPath);
        const doc = await loadPdf(filePath, password);
        const pages = doc.getPages();
        const form = doc.getForm();
        const fields = form.getFields();

        const pageInfo = pages.map((page, i) => {
          const { width, height } = page.getSize();
          const rot = page.getRotation().angle;
          let dims = `${width.toFixed(0)} x ${height.toFixed(0)} pts (${(width / 72).toFixed(1)}" x ${(height / 72).toFixed(1)}")`;
          if (rot !== 0) dims += ` [rotated ${rot}deg]`;
          return `  Page ${i + 1}: ${dims}`;
        });

        // Get PDF version via unpdf
        let pdfVersion = '';
        try {
          const buffer = await loadPdfBuffer(filePath);
          const meta = await getMeta(new Uint8Array(buffer));
          if (meta.info) {
            const info = meta.info as Record<string, unknown>;
            if (info.PDFFormatVersion) pdfVersion = String(info.PDFFormatVersion);
          }
        } catch { /* best-effort */ }

        const info = [
          `PDF Info: ${path.basename(filePath)}`,
          ``,
          `File size: ${formatBytes(stats.size)}`,
          `Pages: ${pages.length}`,
          pdfVersion ? `PDF version: ${pdfVersion}` : null,
          `Title: ${doc.getTitle() || '(none)'}`,
          `Author: ${doc.getAuthor() || '(none)'}`,
          `Subject: ${doc.getSubject() || '(none)'}`,
          `Creator: ${doc.getCreator() || '(none)'}`,
          `Producer: ${doc.getProducer() || '(none)'}`,
          `Creation date: ${doc.getCreationDate()?.toISOString() || '(none)'}`,
          `Modification date: ${doc.getModificationDate()?.toISOString() || '(none)'}`,
          `Form fields: ${fields.length}`,
          ``,
          `Page dimensions:`,
          ...pageInfo,
        ].filter((line) => line !== null).join('\n');

        return toolResult(info);
      } catch (error: unknown) {
        return toolError(`Failed to get PDF info: ${errMsg(error)}`);
      }
    }
  );
}
