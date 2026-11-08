import ePub from 'epubjs';

interface EpubNode {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: { forEach(callback: (node: EpubNode) => void): void };
}

/**
 * EPUB Text Extractor
 * Extracts text per chapter/section from EPUB files using epub.js
 */

export interface ExtractedEpubSection {
  index: number;
  href: string;
  title: string;
  text: string;
  charCount: number;
}

export interface EpubExtractionResult {
  sections: ExtractedEpubSection[];
  totalSections: number;
  totalChars: number;
  metadata: {
    title?: string;
    author?: string;
    language?: string;
    publisher?: string;
    description?: string;
    date?: string;
    identifier?: string;
  };
}

/**
 * Extract text from EPUB file using epub.js
 * @param filePath Path to the EPUB file
 * @returns Extracted sections with text content
 */
export async function extractTextFromEpub(filePath: string): Promise<EpubExtractionResult> {
  const book = ePub(filePath);

  // Wait for book to be ready
  await book.ready;

  const metadata = book.package.metadata || {};
  const sections: ExtractedEpubSection[] = [];
  let totalChars = 0;

  // Get the spine (reading order)
  const spine = book.spine;

  for (let i = 0; i < spine.length; i++) {
    const spineItem = spine.get(i);
    if (!spineItem) continue;

    try {
      const chapter = book.spine.get(i);
      if (!chapter) continue;

      // Load the chapter content
      await chapter.load();
      const document = chapter.document;

      if (!document) continue;

      // Extract text from the document
      const text = extractTextFromDocument(document);
      const cleanText = text.replace(/\s+/g, ' ').trim();

      if (cleanText.length > 0) {
        const charCount = cleanText.length;
        totalChars += charCount;

        sections.push({
          index: i,
          href: spineItem.href || '',
          title: spineItem.label || `Section ${i + 1}`,
          text: cleanText,
          charCount,
        });
      }
    } catch (error) {
      console.warn(`Failed to extract section ${i}:`, error);
    }
  }

  // Clean up
  book.destroy();

  return {
    sections,
    totalSections: sections.length,
    totalChars,
    metadata: {
      title: metadata.title,
      author: Array.isArray(metadata.creator) ? metadata.creator[0] : metadata.creator,
      language: metadata.language,
      publisher: metadata.publisher,
      description: metadata.description,
      date: metadata.date,
      identifier: metadata.identifier,
    },
  };
}

/**
 * Extract text content from an EPUB document
 * @param document The EPUB document object
 * @returns Extracted text content
 */
function extractTextFromDocument(document: EpubNode): string {
  const textNodes: string[] = [];

  function traverse(node: EpubNode): void {
    if (node.nodeType === 3) {
      const text = node.textContent?.trim();
      if (text) textNodes.push(text);
    } else if (node.nodeType === 1) {
      // Skip script, style, and other non-content elements
      const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'META', 'LINK'];
      if (!skipTags.includes(node.nodeName)) {
        node.childNodes.forEach(traverse);
      }
    }
  }

  traverse(document);
  return textNodes.join(' ');
}

/**
 * Generate thumbnail for EPUB cover
 * @param filePath Path to the EPUB file
 * @param outputPath Path to save the thumbnail
 * @returns Path to the generated thumbnail
 */
export async function generateEpubThumbnail(
  filePath: string,
  _outputPath: string
): Promise<string | null> {
  const book = ePub(filePath);

  try {
    await book.ready;

    // Get cover image
    const cover = book.package.metadata?.cover;
    if (cover) {
      void book.archive.createUrl(cover.href);
      // Note: In a real implementation, you'd fetch and save the cover image
      // For now, we'll return null as this requires additional setup
    }

    book.destroy();
    return null;
  } catch (error) {
    console.warn('Failed to generate EPUB thumbnail:', error);
    book.destroy();
    return null;
  }
}

/**
 * Extract text from specific section range
 * @param filePath Path to the EPUB file
 * @param startIndex Starting section index (0-indexed)
 * @param endIndex Ending section index (0-indexed, inclusive)
 * @returns Extracted sections
 */
export async function extractTextFromEpubSectionRange(
  filePath: string,
  startIndex: number,
  endIndex: number
): Promise<ExtractedEpubSection[]> {
  const book = ePub(filePath);
  await book.ready;

  const sections: ExtractedEpubSection[] = [];
  const spine = book.spine;

  for (let i = startIndex; i <= Math.min(endIndex, spine.length - 1); i++) {
    try {
      const chapter = book.spine.get(i);
      if (!chapter) continue;

      await chapter.load();
      const document = chapter.document;

      if (!document) continue;

      const text = extractTextFromDocument(document);
      const cleanText = text.replace(/\s+/g, ' ').trim();

      if (cleanText.length > 0) {
        const spineItem = spine.get(i);
        sections.push({
          index: i,
          href: spineItem?.href || '',
          title: spineItem?.label || `Section ${i + 1}`,
          text: cleanText,
          charCount: cleanText.length,
        });
      }
    } catch (error) {
      console.warn(`Failed to extract section ${i}:`, error);
    }
  }

  book.destroy();
  return sections;
}

/**
 * Get EPUB section count without full extraction
 * @param filePath Path to the EPUB file
 * @returns Number of sections in spine
 */
export async function getEpubSectionCount(filePath: string): Promise<number> {
  const book = ePub(filePath);
  await book.ready;
  const count = book.spine.length;
  book.destroy();
  return count;
}
