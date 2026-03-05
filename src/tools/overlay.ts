import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { StandardFonts, rgb, degrees as pdfDegrees } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { loadPdf, savePdf, resolvePageIndices, parseColor, formatBytes, toRadians, embedImage, toolResult, toolError, errMsg } from '../utils.js';

export function registerOverlayTools(server: McpServer) {
  server.tool(
    'pdf_watermark',
    'Add a diagonal text watermark across PDF pages. The text is properly centered regardless of rotation angle.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      text: z.string().describe('Watermark text (e.g. "CONFIDENTIAL", "DRAFT")'),
      opacity: z.number().min(0).max(1).optional().default(0.15).describe('Opacity 0-1 (default: 0.15)'),
      fontSize: z.number().optional().default(60).describe('Font size in points (default: 60)'),
      color: z.string().optional().default('#888888').describe('Color — hex (#f00), short hex (#ff0000), or name (red, navy, etc). Default: #888888'),
      rotation: z.number().optional().default(45).describe('Rotation in degrees (default: 45)'),
      pages: z.array(z.number()).optional().describe('Pages to watermark (1-indexed). Omit for all.'),
    },
    async ({ filePath, outputPath, text, opacity, fontSize, color, rotation, pages }) => {
      try {
        const doc = await loadPdf(filePath);
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const indices = resolvePageIndices(pages, doc.getPageCount());
        const textColor = parseColor(color);
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const rad = toRadians(rotation);

        for (const idx of indices) {
          const page = doc.getPage(idx);
          const { width, height } = page.getSize();

          // Center the rotated text on the page:
          // After rotation, the text bounding box shifts. Compensate so the
          // visual center of the text string lands at the page center.
          const cx = width / 2;
          const cy = height / 2;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const x = cx - (textWidth / 2) * cos + (fontSize / 2) * sin;
          const y = cy - (textWidth / 2) * sin - (fontSize / 2) * cos;

          page.drawText(text, {
            x, y,
            size: fontSize,
            font,
            color: textColor,
            opacity,
            rotate: pdfDegrees(rotation),
          });
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(`Watermark "${text}" added to ${indices.length} page(s): ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to add watermark: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_page_numbers',
    'Add page numbers to every page. Supports various positions, custom prefix/suffix, and starting number.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      position: z.enum([
        'bottom-center', 'bottom-left', 'bottom-right',
        'top-center', 'top-left', 'top-right',
      ]).optional().default('bottom-center').describe('Position (default: bottom-center)'),
      startNumber: z.number().optional().default(1).describe('Starting number (default: 1)'),
      prefix: z.string().optional().default('').describe('Prefix text (e.g. "Page ")'),
      suffix: z.string().optional().default('').describe('Suffix text (e.g. " of 50")'),
      fontSize: z.number().optional().default(10).describe('Font size (default: 10)'),
      margin: z.number().optional().default(30).describe('Edge distance in points (default: 30)'),
      color: z.string().optional().default('#4d4d4d').describe('Color (default: dark gray)'),
    },
    async ({ filePath, outputPath, position, startNumber, prefix, suffix, fontSize, margin, color }) => {
      try {
        const doc = await loadPdf(filePath);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const totalPages = doc.getPageCount();
        const textColor = parseColor(color);

        for (let i = 0; i < totalPages; i++) {
          const page = doc.getPage(i);
          const { width, height } = page.getSize();
          const text = `${prefix}${startNumber + i}${suffix}`;
          const tw = font.widthOfTextAtSize(text, fontSize);

          const y = position.startsWith('bottom') ? margin : height - margin;
          const x = position.endsWith('center') ? (width - tw) / 2
                  : position.endsWith('left') ? margin
                  : width - margin - tw;

          page.drawText(text, { x, y, size: fontSize, font, color: textColor });
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(`Page numbers (${startNumber}-${startNumber + totalPages - 1}) added: ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to add page numbers: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_add_text',
    'Add text at a specific position on a PDF page. Supports multi-line text (use \\n). Coordinates are in points from bottom-left.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      text: z.string().describe('Text to add. Use \\n for multiple lines.'),
      page: z.number().describe('Page number (1-indexed)'),
      x: z.number().describe('X from left edge (points)'),
      y: z.number().describe('Y from bottom edge (points). For multi-line, this is the top line position.'),
      fontSize: z.number().optional().default(12).describe('Font size (default: 12)'),
      color: z.string().optional().default('#000000').describe('Color (default: black)'),
      font: z.enum(['Helvetica', 'HelveticaBold', 'TimesRoman', 'TimesRomanBold', 'Courier', 'CourierBold']).optional().default('Helvetica').describe('Font (default: Helvetica)'),
      lineSpacing: z.number().optional().default(1.4).describe('Line spacing multiplier for multi-line text (default: 1.4)'),
    },
    async ({ filePath, outputPath, text, page: pageNum, x, y, fontSize, color, font: fontName, lineSpacing }) => {
      try {
        const doc = await loadPdf(filePath);
        const total = doc.getPageCount();
        if (pageNum < 1 || pageNum > total) return toolError(`Page ${pageNum} out of range (1-${total}).`);

        const fontKey = fontName as keyof typeof StandardFonts;
        const font = await doc.embedFont(StandardFonts[fontKey]);
        const pdfPage = doc.getPage(pageNum - 1);
        const textColor = parseColor(color);

        const lines = text.split('\n');
        const lh = fontSize * lineSpacing;
        let currentY = y;

        for (const line of lines) {
          if (line) {
            pdfPage.drawText(line, { x, y: currentY, size: fontSize, font, color: textColor });
          }
          currentY -= lh;
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(`Text added to page ${pageNum}: ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to add text: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_add_image',
    'Add an image (PNG/JPG) at a position on a page. Aspect ratio is preserved when only width or height is given.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      imagePath: z.string().describe('Image file (PNG or JPG)'),
      page: z.number().describe('Page number (1-indexed)'),
      x: z.number().describe('X from left edge (points)'),
      y: z.number().describe('Y from bottom edge (points)'),
      width: z.number().optional().describe('Width in points (scales proportionally if height omitted)'),
      height: z.number().optional().describe('Height in points (scales proportionally if width omitted)'),
      opacity: z.number().min(0).max(1).optional().default(1).describe('Opacity 0-1 (default: 1)'),
    },
    async ({ filePath, outputPath, imagePath, page: pageNum, x, y, width, height, opacity }) => {
      try {
        const doc = await loadPdf(filePath);
        const total = doc.getPageCount();
        if (pageNum < 1 || pageNum > total) return toolError(`Page ${pageNum} out of range (1-${total}).`);

        const image = await embedImage(doc, imagePath);
        let dw: number, dh: number;
        if (width && height) { dw = width; dh = height; }
        else if (width) { dw = width; dh = (image.height / image.width) * width; }
        else if (height) { dh = height; dw = (image.width / image.height) * height; }
        else { dw = image.width; dh = image.height; }

        doc.getPage(pageNum - 1).drawImage(image, { x, y, width: dw, height: dh, opacity });
        const result = await savePdf(doc, outputPath);
        return toolResult(`Image added to page ${pageNum} (${dw.toFixed(0)}x${dh.toFixed(0)} pts): ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to add image: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_header_footer',
    'Add headers and/or footers with dynamic placeholders: {page} for current page, {pages} for total.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      header: z.string().optional().describe('Header text. Use {page} and {pages} placeholders.'),
      footer: z.string().optional().describe('Footer text. Use {page} and {pages} placeholders.'),
      fontSize: z.number().optional().default(9).describe('Font size (default: 9)'),
      margin: z.number().optional().default(30).describe('Edge distance (default: 30)'),
      align: z.enum(['left', 'center', 'right']).optional().default('center').describe('Alignment (default: center)'),
      color: z.string().optional().default('#4d4d4d').describe('Color (default: dark gray)'),
    },
    async ({ filePath, outputPath, header, footer, fontSize, margin, align, color }) => {
      try {
        if (!header && !footer) return toolError('Specify at least one of header or footer.');

        const doc = await loadPdf(filePath);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const totalPages = doc.getPageCount();
        const textColor = parseColor(color);

        for (let i = 0; i < totalPages; i++) {
          const page = doc.getPage(i);
          const { width, height } = page.getSize();
          const render = (t: string) => t.replace(/{page}/g, String(i + 1)).replace(/{pages}/g, String(totalPages));

          const drawAligned = (text: string, yPos: number) => {
            const tw = font.widthOfTextAtSize(text, fontSize);
            const x = align === 'left' ? margin : align === 'right' ? width - margin - tw : (width - tw) / 2;
            page.drawText(text, { x, y: yPos, size: fontSize, font, color: textColor });
          };

          if (header) drawAligned(render(header), height - margin);
          if (footer) drawAligned(render(footer), margin);
        }

        const result = await savePdf(doc, outputPath);
        const parts = [header ? 'header' : '', footer ? 'footer' : ''].filter(Boolean).join(' and ');
        return toolResult(`Added ${parts} to ${totalPages} page(s): ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to add header/footer: ${errMsg(error)}`);
      }
    }
  );

  // --- NEW TOOLS ---

  server.tool(
    'pdf_stamp',
    'Apply a styled business stamp (like a rubber stamp) to PDF pages. Pre-configured styles for common stamps, or create custom ones. Draws a bordered rectangle with text inside, slightly rotated for authenticity.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      type: z.enum([
        'APPROVED', 'REJECTED', 'CONFIDENTIAL', 'DRAFT', 'FINAL',
        'COPY', 'VOID', 'ORIGINAL', 'REVISED', 'FOR REVIEW', 'CUSTOM',
      ]).describe('Stamp type. Use CUSTOM with customText for your own stamp.'),
      customText: z.string().optional().describe('Custom stamp text (only used when type is CUSTOM)'),
      position: z.enum(['top-right', 'top-left', 'bottom-right', 'bottom-left', 'center']).optional().default('top-right').describe('Stamp position (default: top-right)'),
      pages: z.array(z.number()).optional().describe('Pages to stamp (1-indexed). Omit for all.'),
      opacity: z.number().min(0).max(1).optional().default(0.75).describe('Opacity (default: 0.75)'),
      rotation: z.number().optional().default(-15).describe('Rotation in degrees for rubber-stamp look (default: -15)'),
    },
    async ({ filePath, outputPath, type, customText, position, pages, opacity, rotation }) => {
      try {
        const STAMP_COLORS: Record<string, string> = {
          APPROVED: '#228B22', REJECTED: '#DC143C', CONFIDENTIAL: '#DC143C',
          DRAFT: '#808080', FINAL: '#1E90FF', COPY: '#808080',
          VOID: '#DC143C', ORIGINAL: '#1E90FF', REVISED: '#FF8C00',
          'FOR REVIEW': '#800080', CUSTOM: '#333333',
        };

        const text = type === 'CUSTOM' ? (customText || 'CUSTOM') : type;
        const stampColor = parseColor(STAMP_COLORS[type]);

        const doc = await loadPdf(filePath);
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const indices = resolvePageIndices(pages, doc.getPageCount());

        const fontSize = 24;
        const padding = 10;
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const boxWidth = textWidth + padding * 2;
        const boxHeight = fontSize + padding * 2;
        const borderWidth = 3;

        for (const idx of indices) {
          const page = doc.getPage(idx);
          const { width, height } = page.getSize();

          let x: number, y: number;
          const m = 40; // margin from edge
          switch (position) {
            case 'top-left':    x = m; y = height - m - boxHeight; break;
            case 'top-right':   x = width - m - boxWidth; y = height - m - boxHeight; break;
            case 'bottom-left': x = m; y = m; break;
            case 'bottom-right': x = width - m - boxWidth; y = m; break;
            case 'center':      x = (width - boxWidth) / 2; y = (height - boxHeight) / 2; break;
          }

          // Draw border rectangle
          page.drawRectangle({
            x, y, width: boxWidth, height: boxHeight,
            borderColor: stampColor, borderWidth,
            color: rgb(1, 1, 1), opacity: opacity * 0.3,
            rotate: pdfDegrees(rotation),
          });

          // Draw text
          page.drawText(text, {
            x: x + padding,
            y: y + padding,
            size: fontSize,
            font,
            color: stampColor,
            opacity,
            rotate: pdfDegrees(rotation),
          });
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(`"${text}" stamp applied to ${indices.length} page(s): ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to stamp: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_sign',
    'Add a signature image to a PDF with smart positioning. Simplified alternative to pdf_add_image for signing documents.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      imagePath: z.string().describe('Path to signature image (PNG or JPG)'),
      page: z.number().optional().describe('Page to sign (1-indexed). Default: last page.'),
      position: z.enum(['bottom-right', 'bottom-left', 'bottom-center']).optional().default('bottom-right').describe('Signature position (default: bottom-right)'),
      width: z.number().optional().default(150).describe('Signature width in points (default: 150). Height scales proportionally.'),
      margin: z.number().optional().default(50).describe('Distance from page edge (default: 50)'),
    },
    async ({ filePath, outputPath, imagePath, page: pageNum, position, width, margin }) => {
      try {
        const doc = await loadPdf(filePath);
        const total = doc.getPageCount();
        const targetPage = pageNum ? Math.min(pageNum, total) : total;

        const image = await embedImage(doc, imagePath);
        const dh = (image.height / image.width) * width;

        const pdfPage = doc.getPage(targetPage - 1);
        const { width: pw } = pdfPage.getSize();

        let x: number;
        if (position === 'bottom-left') x = margin;
        else if (position === 'bottom-center') x = (pw - width) / 2;
        else x = pw - margin - width;

        pdfPage.drawImage(image, { x, y: margin, width, height: dh });

        const result = await savePdf(doc, outputPath);
        return toolResult(`Signature added to page ${targetPage} (${position}): ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to sign: ${errMsg(error)}`);
      }
    }
  );
}
