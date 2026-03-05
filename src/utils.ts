import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

const NAMED_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#00ff00',
  blue: '#0000ff', yellow: '#ffff00', orange: '#ff8800', purple: '#800080',
  pink: '#ff69b4', gray: '#808080', grey: '#808080', cyan: '#00ffff',
  magenta: '#ff00ff', brown: '#8b4513', navy: '#000080', teal: '#008080',
  maroon: '#800000', olive: '#808000', lime: '#00ff00', aqua: '#00ffff',
  coral: '#ff7f50', salmon: '#fa8072', gold: '#ffd700', silver: '#c0c0c0',
  indigo: '#4b0082', violet: '#ee82ee', crimson: '#dc143c', tomato: '#ff6347',
};

export async function loadPdf(filePath: string, password?: string): Promise<PDFDocument> {
  const absPath = path.resolve(filePath);
  const buffer = await fs.readFile(absPath);
  return PDFDocument.load(buffer, {
    ignoreEncryption: false,
    ...(password ? { password } : {}),
  });
}

export async function loadPdfBuffer(filePath: string): Promise<Buffer> {
  return fs.readFile(path.resolve(filePath));
}

export async function savePdf(
  doc: PDFDocument,
  outputPath: string
): Promise<{ path: string; size: number; pages: number }> {
  const absPath = path.resolve(outputPath);
  await ensureDir(path.dirname(absPath));
  const bytes = await doc.save();
  await fs.writeFile(absPath, bytes);
  return {
    path: absPath,
    size: bytes.length,
    pages: doc.getPageCount(),
  };
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export function resolvePageIndices(
  pages: number[] | undefined,
  totalPages: number
): number[] {
  if (!pages || pages.length === 0) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  return pages
    .map((p) => p - 1)
    .filter((p) => p >= 0 && p < totalPages);
}

export function parseColor(input?: string) {
  if (!input) return rgb(0, 0, 0);

  // Named color lookup
  let hex = NAMED_COLORS[input.toLowerCase()] || input;
  hex = hex.replace('#', '');

  // Expand 3-char hex to 6-char: "f00" -> "ff0000"
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return rgb(
    Number.isFinite(r) ? r : 0,
    Number.isFinite(g) ? g : 0,
    Number.isFinite(b) ? b : 0,
  );
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toolResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true as const };
}

export async function embedImage(doc: PDFDocument, imagePath: string) {
  const imgBytes = await fs.readFile(path.resolve(imagePath));
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === '.png') return doc.embedPng(imgBytes);
  if (ext === '.jpg' || ext === '.jpeg') return doc.embedJpg(imgBytes);
  throw new Error(`Unsupported image format: ${ext}. Use PNG or JPG.`);
}

export function getPageSize(name: string): [number, number] {
  const sizes: Record<string, [number, number]> = {
    A4: [595.28, 841.89],
    Letter: [612, 792],
    Legal: [612, 1008],
    A3: [841.89, 1190.55],
    A5: [419.53, 595.28],
    Tabloid: [792, 1224],
  };
  return sizes[name] || sizes.A4;
}
