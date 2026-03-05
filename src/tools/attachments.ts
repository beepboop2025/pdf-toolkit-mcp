import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { loadPdf, savePdf, formatBytes, toolResult, toolError, errMsg } from '../utils.js';

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function registerAttachmentTools(server: McpServer) {
  server.tool(
    'pdf_attach',
    'Embed one or more files as attachments inside a PDF. Attached files travel with the PDF and can be extracted by PDF readers. Useful for bundling source data, receipts, supporting documents, etc.',
    {
      filePath: z.string().describe('PDF file to attach files to'),
      outputPath: z.string().describe('Output path'),
      attachments: z.array(z.object({
        path: z.string().describe('Path to the file to attach'),
        description: z.string().optional().describe('Description of the attachment'),
      })).min(1).describe('Files to attach'),
    },
    async ({ filePath, outputPath, attachments }) => {
      try {
        const doc = await loadPdf(filePath);
        const attached: string[] = [];
        const errors: string[] = [];

        for (const att of attachments) {
          try {
            const absPath = path.resolve(att.path);
            const fileBytes = await fs.readFile(absPath);
            const fileName = path.basename(absPath);
            const ext = path.extname(absPath).toLowerCase();
            const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

            await doc.attach(fileBytes, fileName, {
              mimeType,
              description: att.description || fileName,
              creationDate: new Date(),
              modificationDate: new Date(),
            });

            attached.push(`${fileName} (${formatBytes(fileBytes.length)})`);
          } catch (e: unknown) {
            errors.push(`${path.basename(att.path)}: ${errMsg(e)}`);
          }
        }

        if (attached.length === 0) {
          return toolError(`No files could be attached.\n${errors.join('\n')}`);
        }

        const result = await savePdf(doc, outputPath);
        const lines = [
          `Attached ${attached.length} file(s): ${result.path}`,
          ...attached.map((a) => `  - ${a}`),
        ];
        if (errors.length > 0) {
          lines.push(`Errors:`);
          lines.push(...errors.map((e) => `  - ${e}`));
        }

        return toolResult(lines.join('\n'));
      } catch (error: unknown) {
        return toolError(`Failed to attach: ${errMsg(error)}`);
      }
    }
  );
}
