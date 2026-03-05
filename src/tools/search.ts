import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDocumentProxy } from 'unpdf';
import { loadPdfBuffer, toolResult, toolError, errMsg } from '../utils.js';

async function extractPages(filePath: string): Promise<string[]> {
  const buffer = await loadPdfBuffer(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item: any) => 'str' in item)
      .map((item: any) => item.str)
      .join(' ');
    pages.push(text);
  }
  return pages;
}

export function registerSearchTools(server: McpServer) {
  server.tool(
    'pdf_search',
    'Search for text in a PDF. Returns all matches with page numbers and surrounding context. Supports plain text and regex search.',
    {
      filePath: z.string().describe('PDF file path'),
      query: z.string().describe('Text or regex pattern to search for'),
      caseSensitive: z.boolean().optional().default(false).describe('Case-sensitive search (default: false)'),
      regex: z.boolean().optional().default(false).describe('Treat query as a regex pattern (default: false)'),
      contextChars: z.number().optional().default(60).describe('Characters of context around each match (default: 60)'),
    },
    async ({ filePath, query, caseSensitive, regex, contextChars }) => {
      try {
        const pages = await extractPages(filePath);
        const flags = caseSensitive ? 'g' : 'gi';
        let pattern: RegExp;
        try {
          pattern = regex
            ? new RegExp(query, flags)
            : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
        } catch (e: unknown) {
          return toolError(`Invalid regex: ${errMsg(e)}`);
        }

        const matches: string[] = [];
        for (let i = 0; i < pages.length; i++) {
          const text = pages[i];
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(text)) !== null) {
            const start = Math.max(0, match.index - contextChars);
            const end = Math.min(text.length, match.index + match[0].length + contextChars);
            const before = text.slice(start, match.index);
            const after = text.slice(match.index + match[0].length, end);
            matches.push(`Page ${i + 1}: ...${before}[${match[0]}]${after}...`);
            if (matches.length >= 200) break;
          }
          if (matches.length >= 200) break;
        }

        if (matches.length === 0) {
          return toolResult(`No matches found for "${query}" in ${pages.length} page(s).`);
        }

        return toolResult([
          `Found ${matches.length} match(es) across ${pages.length} page(s):`,
          '',
          ...matches,
        ].join('\n'));
      } catch (error: unknown) {
        return toolError(`Failed to search: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_compare',
    'Compare the text content of two PDFs page by page. Reports which pages are identical, which differ, and shows a summary of differences. Useful for verifying document versions.',
    {
      filePath1: z.string().describe('First PDF file path'),
      filePath2: z.string().describe('Second PDF file path'),
    },
    async ({ filePath1, filePath2 }) => {
      try {
        const [pages1, pages2] = await Promise.all([
          extractPages(filePath1),
          extractPages(filePath2),
        ]);

        const maxPages = Math.max(pages1.length, pages2.length);
        const lines: string[] = [
          `PDF 1: ${pages1.length} page(s)`,
          `PDF 2: ${pages2.length} page(s)`,
          '',
        ];

        let identical = 0;
        let different = 0;

        for (let i = 0; i < maxPages; i++) {
          const t1 = pages1[i] ?? '';
          const t2 = pages2[i] ?? '';

          if (i >= pages1.length) {
            lines.push(`Page ${i + 1}: only in PDF 2`);
            different++;
          } else if (i >= pages2.length) {
            lines.push(`Page ${i + 1}: only in PDF 1`);
            different++;
          } else if (t1 === t2) {
            identical++;
          } else {
            different++;
            const words1 = t1.split(/\s+/).filter(Boolean);
            const words2 = t2.split(/\s+/).filter(Boolean);
            const added = words2.filter((w) => !words1.includes(w)).length;
            const removed = words1.filter((w) => !words2.includes(w)).length;
            lines.push(`Page ${i + 1}: DIFFERENT (~${added} words added, ~${removed} removed)`);
          }
        }

        lines.push('');
        lines.push(`Summary: ${identical} identical, ${different} different out of ${maxPages} page(s)`);

        return toolResult(lines.join('\n'));
      } catch (error: unknown) {
        return toolError(`Failed to compare: ${errMsg(error)}`);
      }
    }
  );
}
