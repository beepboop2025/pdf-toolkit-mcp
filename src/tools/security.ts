import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadPdf, savePdf, formatBytes, toolResult, toolError, errMsg } from '../utils.js';

export function registerSecurityTools(server: McpServer) {
  server.tool(
    'pdf_decrypt',
    'Remove password protection from an encrypted PDF. Requires the correct password. Saves an unencrypted copy that can be opened without a password.',
    {
      filePath: z.string().describe('Path to the encrypted PDF file'),
      password: z.string().describe('Password to unlock the PDF'),
      outputPath: z.string().describe('Path where the decrypted (unprotected) PDF will be saved'),
    },
    async ({ filePath, password, outputPath }) => {
      try {
        const doc = await loadPdf(filePath, password);
        const result = await savePdf(doc, outputPath);
        return toolResult(
          `Decrypted PDF saved: ${result.path}\nPages: ${result.pages} | Size: ${formatBytes(result.size)}`
        );
      } catch (error: unknown) {
        const msg = errMsg(error);
        if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypt')) {
          return toolError('Incorrect password or the PDF is not encrypted.');
        }
        return toolError(`Failed to decrypt: ${msg}`);
      }
    }
  );
}
