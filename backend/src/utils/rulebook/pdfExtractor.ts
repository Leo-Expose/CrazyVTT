import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs/promises';

/**
 * PDF Text Extractor
 * Extracts text per page from PDF files using pdf.js
 */

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  charCount: number;
}

export interface PDFExtractionResult {
  pages: ExtractedPage[];
  totalPages: number;
  totalChars: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
}

/**
 * Extract text from PDF file using pdf.js
 * @param filePath Path to the PDF file
 * @returns Extracted pages with text content
 */
export async function extractTextFromPDF(filePath: string): Promise<PDFExtractionResult> {
  const data = await fs.readFile(filePath);
  const uint8Array = new Uint8Array(data);

  // Load the PDF document
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  const metadata = await pdf.getMetadata();
  const info = metadata.info || {};

  const pages: ExtractedPage[] = [];
  let totalChars = 0;

  // Extract text from each page
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Combine text items into a single string
    const text = textContent.items
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const charCount = text.length;
    totalChars += charCount;

    pages.push({
      pageNumber: pageNum,
      text,
      charCount,
    });
  }

  return {
    pages,
    totalPages: pdf.numPages,
    totalChars,
    metadata: {
      title: info.Title,
      author: info.Author,
      subject: info.Subject,
      creator: info.Creator,
      producer: info.Producer,
      creationDate: info.CreationDate ? new Date(info.CreationDate) : undefined,
      modificationDate: info.ModDate ? new Date(info.ModDate) : undefined,
    },
  };
}

/**
 * Generate thumbnail for PDF first page
 * @param filePath Path to the PDF file
 * @param outputPath Path to save the thumbnail
 * @returns Path to the generated thumbnail
 */
export async function generatePDFThumbnail(
  filePath: string,
  outputPath: string
): Promise<string> {
  const data = await fs.readFile(filePath);
  const uint8Array = new Uint8Array(data);

  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 0.5 }); // Scale for thumbnail size

  // Create a canvas to render the page
  type PdfCanvas = {
    width: number;
    height: number;
    getContext(type: '2d'): object | null;
    toBuffer(type: 'image/png'): Buffer;
  };
  const canvas = (globalThis as typeof globalThis & {
    document?: { createElement(tag: 'canvas'): PdfCanvas };
  }).document?.createElement('canvas');
  if (!canvas) throw new Error('PDF thumbnails require a canvas-capable runtime');
  const context = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  if (context) {
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    await page.render(renderContext).promise;

    // Save as PNG
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(outputPath, buffer);
  }

  return outputPath;
}

/**
 * Extract text from specific page range
 * @param filePath Path to the PDF file
 * @param startPage Starting page number (1-indexed)
 * @param endPage Ending page number (1-indexed, inclusive)
 * @returns Extracted pages
 */
export async function extractTextFromPageRange(
  filePath: string,
  startPage: number,
  endPage: number
): Promise<ExtractedPage[]> {
  const data = await fs.readFile(filePath);
  const uint8Array = new Uint8Array(data);

  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  const pages: ExtractedPage[] = [];

  for (let pageNum = startPage; pageNum <= Math.min(endPage, pdf.numPages); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const text = textContent.items
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    pages.push({
      pageNumber: pageNum,
      text,
      charCount: text.length,
    });
  }

  return pages;
}

/**
 * Get PDF page count without full extraction
 * @param filePath Path to the PDF file
 * @returns Number of pages
 */
export async function getPDFPageCount(filePath: string): Promise<number> {
  const data = await fs.readFile(filePath);
  const uint8Array = new Uint8Array(data);

  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  return pdf.numPages;
}
