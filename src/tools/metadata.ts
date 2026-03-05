import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadPdf, savePdf, toolResult, toolError, errMsg } from '../utils.js';

export function registerMetadataTools(server: McpServer) {
  server.tool(
    'pdf_set_metadata',
    'Set or update PDF document metadata fields: title, author, subject, keywords, creator, and producer. Only specified fields are changed; others remain untouched.',
    {
      filePath: z.string().describe('Path to the PDF file'),
      outputPath: z.string().describe('Path where the modified PDF will be saved'),
      title: z.string().optional().describe('Document title'),
      author: z.string().optional().describe('Document author'),
      subject: z.string().optional().describe('Document subject/description'),
      keywords: z.array(z.string()).optional().describe('Document keywords as an array of strings'),
      creator: z.string().optional().describe('Creator application name'),
      producer: z.string().optional().describe('Producer application name'),
    },
    async ({ filePath, outputPath, title, author, subject, keywords, creator, producer }) => {
      try {
        const doc = await loadPdf(filePath);
        const changes: string[] = [];

        if (title !== undefined) { doc.setTitle(title); changes.push(`Title: "${title}"`); }
        if (author !== undefined) { doc.setAuthor(author); changes.push(`Author: "${author}"`); }
        if (subject !== undefined) { doc.setSubject(subject); changes.push(`Subject: "${subject}"`); }
        if (keywords !== undefined) { doc.setKeywords(keywords); changes.push(`Keywords: [${keywords.join(', ')}]`); }
        if (creator !== undefined) { doc.setCreator(creator); changes.push(`Creator: "${creator}"`); }
        if (producer !== undefined) { doc.setProducer(producer); changes.push(`Producer: "${producer}"`); }

        if (changes.length === 0) {
          return toolError('No metadata fields specified. Provide at least one of: title, author, subject, keywords, creator, producer.');
        }

        const result = await savePdf(doc, outputPath);
        return toolResult(
          `Metadata updated: ${result.path}\n${changes.map((c) => `  - ${c}`).join('\n')}`
        );
      } catch (error: unknown) {
        return toolError(`Failed to set metadata: ${errMsg(error)}`);
      }
    }
  );
}
