import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { rgb } from 'pdf-lib';
import { loadPdf, savePdf, parseColor, toolResult, toolError, errMsg } from '../utils.js';

export function registerAnnotateTools(server: McpServer) {
  server.tool(
    'pdf_redact',
    'VISUAL-ONLY redaction: draws opaque rectangles over regions on PDF pages. WARNING: This does NOT remove the underlying text/data from the PDF — it only covers it visually. The original content can still be extracted programmatically. Do NOT use this for true document sanitization of sensitive data (SSNs, passwords, etc). For true redaction, use a tool that rewrites the PDF content stream (e.g. Adobe Acrobat Pro, qpdf, or mutool).',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      regions: z.array(z.object({
        page: z.number().describe('Page number (1-indexed)'),
        x: z.number().describe('Left edge (points from left)'),
        y: z.number().describe('Bottom edge (points from bottom)'),
        width: z.number().describe('Width in points'),
        height: z.number().describe('Height in points'),
      })).min(1).describe('Regions to redact'),
      color: z.string().optional().default('black').describe('Redaction color (default: black)'),
    },
    async ({ filePath, outputPath, regions, color }) => {
      try {
        const doc = await loadPdf(filePath);
        const total = doc.getPageCount();
        const fillColor = parseColor(color);
        let count = 0;

        for (const r of regions) {
          if (r.page < 1 || r.page > total) continue;
          const page = doc.getPage(r.page - 1);
          page.drawRectangle({
            x: r.x, y: r.y, width: r.width, height: r.height,
            color: fillColor,
            opacity: 1,
          });
          count++;
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(`Redacted ${count} region(s): ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to redact: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_highlight',
    'Add translucent highlight boxes over regions on PDF pages — like using a highlighter pen. Great for marking important sections.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      highlights: z.array(z.object({
        page: z.number().describe('Page number (1-indexed)'),
        x: z.number().describe('Left edge (points from left)'),
        y: z.number().describe('Bottom edge (points from bottom)'),
        width: z.number().describe('Width in points'),
        height: z.number().describe('Height in points'),
        color: z.string().optional().default('yellow').describe('Highlight color (default: yellow)'),
      })).min(1).describe('Regions to highlight'),
      opacity: z.number().min(0).max(1).optional().default(0.35).describe('Highlight opacity (default: 0.35)'),
    },
    async ({ filePath, outputPath, highlights, opacity }) => {
      try {
        const doc = await loadPdf(filePath);
        const total = doc.getPageCount();
        let count = 0;

        for (const h of highlights) {
          if (h.page < 1 || h.page > total) continue;
          const page = doc.getPage(h.page - 1);
          page.drawRectangle({
            x: h.x, y: h.y, width: h.width, height: h.height,
            color: parseColor(h.color),
            opacity,
          });
          count++;
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(`Added ${count} highlight(s): ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to highlight: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_draw',
    'Draw shapes on PDF pages: rectangles (filled or outlined), lines, and circles/ellipses. Useful for annotations, diagrams, or marking up documents.',
    {
      filePath: z.string().describe('PDF file path'),
      outputPath: z.string().describe('Output path'),
      shapes: z.array(z.object({
        type: z.enum(['rectangle', 'line', 'ellipse']).describe('Shape type'),
        page: z.number().describe('Page number (1-indexed)'),
        x: z.number().describe('X position (left edge for rect/ellipse, start X for line)'),
        y: z.number().describe('Y position (bottom edge for rect/ellipse, start Y for line)'),
        width: z.number().optional().describe('Width (rect/ellipse) or end X for line'),
        height: z.number().optional().describe('Height (rect/ellipse) or end Y for line'),
        color: z.string().optional().default('black').describe('Fill/stroke color (default: black)'),
        borderColor: z.string().optional().describe('Border color for rectangles (if different from fill)'),
        borderWidth: z.number().optional().default(1).describe('Border/line thickness in points (default: 1)'),
        filled: z.boolean().optional().default(false).describe('Fill the shape (default: false, outline only)'),
        opacity: z.number().min(0).max(1).optional().default(1).describe('Opacity (default: 1)'),
      })).min(1).describe('Shapes to draw'),
    },
    async ({ filePath, outputPath, shapes }) => {
      try {
        const doc = await loadPdf(filePath);
        const total = doc.getPageCount();
        let count = 0;

        for (const s of shapes) {
          if (s.page < 1 || s.page > total) continue;
          const page = doc.getPage(s.page - 1);
          const shapeColor = parseColor(s.color);

          switch (s.type) {
            case 'rectangle': {
              const w = s.width || 100;
              const h = s.height || 50;
              page.drawRectangle({
                x: s.x, y: s.y, width: w, height: h,
                color: s.filled ? shapeColor : undefined,
                borderColor: s.borderColor ? parseColor(s.borderColor) : shapeColor,
                borderWidth: s.borderWidth,
                opacity: s.opacity,
              });
              break;
            }
            case 'line': {
              const endX = s.width ?? s.x + 100;
              const endY = s.height ?? s.y;
              page.drawLine({
                start: { x: s.x, y: s.y },
                end: { x: endX, y: endY },
                thickness: s.borderWidth,
                color: shapeColor,
                opacity: s.opacity,
              });
              break;
            }
            case 'ellipse': {
              const xScale = (s.width || 50) / 2;
              const yScale = (s.height || 50) / 2;
              page.drawEllipse({
                x: s.x + xScale,
                y: s.y + yScale,
                xScale,
                yScale,
                color: s.filled ? shapeColor : undefined,
                borderColor: s.borderColor ? parseColor(s.borderColor) : shapeColor,
                borderWidth: s.borderWidth,
                opacity: s.opacity,
              });
              break;
            }
          }
          count++;
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(`Drew ${count} shape(s): ${result.path}`);
      } catch (error: unknown) {
        return toolError(`Failed to draw: ${errMsg(error)}`);
      }
    }
  );
}
