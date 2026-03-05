import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { savePdf, formatBytes, toolResult, toolError, errMsg, getPageSize, embedImage } from '../utils.js';

const FONT_MAP: Record<string, Record<string, string>> = {
  Helvetica: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  TimesRoman: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
  Courier: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
};

export function registerCreateTools(server: McpServer) {
  server.tool(
    'pdf_create',
    'Create a new PDF from text. Supports auto word-wrapping, pagination, bold/italic, configurable fonts, margins, page sizes. Lines starting with "# " render as bold headings.',
    {
      outputPath: z.string().describe('Path where the PDF will be saved'),
      content: z.string().describe('Text content. Use \\n for line breaks. Lines starting with "# " become bold headings. Text auto-wraps and paginates.'),
      title: z.string().optional().describe('Document title (metadata)'),
      author: z.string().optional().describe('Document author (metadata)'),
      fontSize: z.number().optional().default(12).describe('Font size in points (default: 12)'),
      margin: z.number().optional().default(50).describe('Page margin in points (default: 50)'),
      lineSpacing: z.number().optional().default(1.4).describe('Line spacing multiplier (default: 1.4)'),
      pageSize: z.enum(['A4', 'Letter', 'Legal', 'A3', 'A5']).optional().default('A4').describe('Page size (default: A4)'),
      font: z.enum(['Helvetica', 'TimesRoman', 'Courier']).optional().default('Helvetica').describe('Font family (default: Helvetica)'),
    },
    async ({ outputPath, content, title, author, fontSize, margin, lineSpacing, pageSize, font: fontName }) => {
      try {
        const doc = await PDFDocument.create();
        const regularFont = await doc.embedFont(FONT_MAP[fontName].regular);
        const boldFont = await doc.embedFont(FONT_MAP[fontName].bold);

        if (title) doc.setTitle(title);
        if (author) doc.setAuthor(author);

        const size = getPageSize(pageSize);
        const pageWidth = size[0];
        const pageHeight = size[1];
        const usableWidth = pageWidth - margin * 2;
        const lineHeight = fontSize * lineSpacing;
        const headingSize = fontSize * 1.3;
        const headingHeight = headingSize * lineSpacing;

        const paragraphs = content.split('\n');

        // Process into renderable lines
        type Line = { text: string; font: typeof regularFont; size: number; height: number };
        const lines: Line[] = [];

        for (const para of paragraphs) {
          if (para.trim() === '') {
            lines.push({ text: '', font: regularFont, size: fontSize, height: lineHeight });
            continue;
          }

          const isHeading = para.startsWith('# ');
          const rawText = isHeading ? para.slice(2) : para;
          const font = isHeading ? boldFont : regularFont;
          const sz = isHeading ? headingSize : fontSize;
          const lh = isHeading ? headingHeight : lineHeight;

          // Word wrap
          const words = rawText.split(/\s+/);
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (font.widthOfTextAtSize(testLine, sz) > usableWidth && currentLine) {
              lines.push({ text: currentLine, font, size: sz, height: lh });
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push({ text: currentLine, font, size: sz, height: lh });
        }

        // Paginate and render
        let page = doc.addPage(size);
        let y = pageHeight - margin;

        for (const line of lines) {
          if (y < margin + line.height) {
            page = doc.addPage(size);
            y = pageHeight - margin;
          }
          if (line.text) {
            page.drawText(line.text, {
              x: margin,
              y: y - line.size,
              size: line.size,
              font: line.font,
              color: rgb(0, 0, 0),
            });
          }
          y -= line.height;
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(
          `PDF created: ${result.path}\nPages: ${result.pages} | Size: ${formatBytes(result.size)}`
        );
      } catch (error: unknown) {
        return toolError(`Failed to create PDF: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_images_to_pdf',
    'Convert one or more images (PNG/JPG) into a PDF. Each image becomes a page, scaled to fit while maintaining aspect ratio.',
    {
      imagePaths: z.array(z.string()).min(1).describe('Array of image file paths (PNG or JPG)'),
      outputPath: z.string().describe('Path where the PDF will be saved'),
      pageSize: z.enum(['A4', 'Letter', 'Legal', 'FitImage']).optional().default('A4').describe('"FitImage" sizes each page to match the image (default: A4)'),
      margin: z.number().optional().default(0).describe('Margin around image in points (default: 0)'),
    },
    async ({ imagePaths, outputPath, pageSize, margin }) => {
      try {
        const doc = await PDFDocument.create();

        for (const imgPath of imagePaths) {
          const image = await embedImage(doc, imgPath);
          const imgWidth = image.width;
          const imgHeight = image.height;

          let pw: number, ph: number;
          if (pageSize === 'FitImage') {
            pw = imgWidth + margin * 2;
            ph = imgHeight + margin * 2;
          } else {
            const sz = getPageSize(pageSize);
            pw = sz[0];
            ph = sz[1];
          }

          const page = doc.addPage([pw, ph]);
          const usableW = pw - margin * 2;
          const usableH = ph - margin * 2;
          const scale = Math.min(usableW / imgWidth, usableH / imgHeight);
          const scaledW = imgWidth * scale;
          const scaledH = imgHeight * scale;
          const x = margin + (usableW - scaledW) / 2;
          const y = margin + (usableH - scaledH) / 2;

          page.drawImage(image, { x, y, width: scaledW, height: scaledH });
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(
          `PDF created from ${imagePaths.length} image(s): ${result.path}\nPages: ${result.pages} | Size: ${formatBytes(result.size)}`
        );
      } catch (error: unknown) {
        return toolError(`Failed to create PDF from images: ${errMsg(error)}`);
      }
    }
  );
}
