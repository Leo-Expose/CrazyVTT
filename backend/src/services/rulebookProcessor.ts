import { prisma } from '../config/database';
import { Prisma, RulebookStatus } from '@prisma/client';
import type { PDFExtractionResult } from '../utils/rulebook/pdfExtractor.js';
import type { EpubExtractionResult } from '../utils/rulebook/epubExtractor.js';
import { extractWithLLM, chunkByContentType } from '../utils/rulebook/llmExtractor';
import { ensureDirectory, getUploadsDirectory } from '../utils/fileUtils';
import path from 'path';
import logger from '../utils/logger';

/**
 * Rulebook Processor Service
 * Orchestrates the full rulebook processing pipeline:
 * 1. Extract text from PDF/EPUB
 * 2. Chunk by content type
 * 3. Extract structured data via LLM
 * 4. Store chunks in database
 * 5. Update rulebook status
 */

export interface ProcessingProgress {
  rulebookId: string;
  status: RulebookStatus;
  processedPages: number;
  totalPages: number;
  currentStep: string;
  error?: string;
}

/**
 * Process a rulebook file (PDF or EPUB)
 * @param rulebookId ID of the rulebook to process
 * @param onProgress Optional callback for progress updates
 */
export async function processRulebook(
  rulebookId: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<void> {
  const rulebook = await prisma.rulebook.findUnique({
    where: { id: rulebookId },
  });

  if (!rulebook) {
    throw new Error(`Rulebook ${rulebookId} not found`);
  }

  // Update status to PROCESSING
  await updateRulebookStatus(rulebookId, RulebookStatus.PROCESSING);
  onProgress?.({
    rulebookId,
    status: RulebookStatus.PROCESSING,
    processedPages: 0,
    totalPages: rulebook.totalPages ?? 0,
    currentStep: 'Starting extraction',
  });

  try {
    // Step 1: Extract text from file
    onProgress?.({
      rulebookId,
      status: RulebookStatus.PROCESSING,
      processedPages: 0,
      totalPages: rulebook.totalPages ?? 0,
      currentStep: 'Extracting text from file',
    });

    let extractionResult: PDFExtractionResult | EpubExtractionResult;
    const fileExt = path.extname(rulebook.filePath).toLowerCase();

    if (fileExt === '.pdf') {
      const { extractTextFromPDF } = await import('../utils/rulebook/pdfExtractor.js');
      extractionResult = await extractTextFromPDF(rulebook.filePath);
    } else if (fileExt === '.epub') {
      const { extractTextFromEpub } = await import('../utils/rulebook/epubExtractor.js');
      extractionResult = await extractTextFromEpub(rulebook.filePath);
    } else {
      throw new Error(`Unsupported file type: ${fileExt}`);
    }

    const totalPages = 'numPages' in extractionResult
      ? (extractionResult as PDFExtractionResult).totalPages
      : (extractionResult as EpubExtractionResult).sections.length;

    // Update total pages if not set
    if (!rulebook.totalPages) {
      await prisma.rulebook.update({
        where: { id: rulebookId },
        data: { totalPages },
      });
    }

    // Step 2: Prepare pages for chunking
    const pages = 'pages' in extractionResult
      ? (extractionResult as PDFExtractionResult).pages
      : (extractionResult as EpubExtractionResult).sections.map((s: EpubExtractionResult['sections'][number]) => ({
          pageNumber: s.index + 1,
          text: s.text,
        }));

    // Step 3: Chunk by content type
    onProgress?.({
      rulebookId,
      status: RulebookStatus.PROCESSING,
      processedPages: 0,
      totalPages,
      currentStep: 'Chunking content by type',
    });

    const chunks = chunkByContentType(pages);

    // Step 4: Process each chunk
    let processedPages = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      onProgress?.({
        rulebookId,
        status: RulebookStatus.PROCESSING,
        processedPages,
        totalPages,
        currentStep: `Processing chunk ${i + 1}/${chunks.length} (${chunk.chunkType})`,
      });

      // Extract structured data via LLM
      const extraction = await extractWithLLM(
        chunk.chunkType,
        chunk.text,
        chunk.pageStart,
        chunk.pageEnd
      );

      // Create chunk record
      await prisma.rulebookChunk.create({
        data: {
          rulebookId,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          contentType: chunk.chunkType,
          rawText: chunk.text,
          structured: extraction?.structured == null
            ? Prisma.JsonNull
            : JSON.parse(JSON.stringify(extraction.structured)) as Prisma.InputJsonValue,
          confidence: extraction?.confidence ?? 0.0,
        },
      });

      processedPages = chunk.pageEnd;

      // Update progress
      await prisma.rulebook.update({
        where: { id: rulebookId },
        data: { processedPages },
      });

      onProgress?.({
        rulebookId,
        status: RulebookStatus.PROCESSING,
        processedPages,
        totalPages,
        currentStep: `Processed chunk ${i + 1}/${chunks.length}`,
      });
    }

    // Step 5: Generate thumbnail if not exists
    if (!rulebook.thumbnailPath) {
      onProgress?.({
        rulebookId,
        status: RulebookStatus.PROCESSING,
        processedPages,
        totalPages,
        currentStep: 'Generating thumbnail',
      });

      const thumbnailPath = await generateRulebookThumbnail(rulebook);
      if (thumbnailPath) {
        await prisma.rulebook.update({
          where: { id: rulebookId },
          data: { thumbnailPath },
        });
      }
    }

    // Mark as completed
    await updateRulebookStatus(rulebookId, RulebookStatus.COMPLETED);
    onProgress?.({
      rulebookId,
      status: RulebookStatus.COMPLETED,
      processedPages: totalPages,
      totalPages,
      currentStep: 'Processing complete',
    });

    logger.info('Rulebook processing completed', { rulebookId });
  } catch (error) {
    logger.error('Rulebook processing failed', { rulebookId, error });
    await updateRulebookStatus(rulebookId, RulebookStatus.FAILED, error instanceof Error ? error.message : 'Unknown error');
    onProgress?.({
      rulebookId,
      status: RulebookStatus.FAILED,
      processedPages: 0,
      totalPages: rulebook.totalPages ?? 0,
      currentStep: 'Processing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Update rulebook status
 */
async function updateRulebookStatus(
  rulebookId: string,
  status: RulebookStatus,
  _error?: string
): Promise<void> {
  await prisma.rulebook.update({
    where: { id: rulebookId },
    data: {
      status,
      // Could add error field to schema if needed
    },
  });
}

/**
 * Generate thumbnail for rulebook
 */
async function generateRulebookThumbnail(rulebook: { filePath: string; id: string }): Promise<string | null> {
  try {
    const uploadsDir = getUploadsDirectory();
    const thumbnailDir = path.join(uploadsDir, 'rulebooks', 'thumbnails');
    await ensureDirectory(thumbnailDir);

    const thumbnailPath = path.join(thumbnailDir, `${rulebook.id}.png`);
    const fileExt = path.extname(rulebook.filePath).toLowerCase();

    if (fileExt === '.pdf') {
      // Actually use the thumbnail generator from utils/thumbnails.ts
      // For now, we'll use a placeholder
      return await generatePDFThumbnail(rulebook.filePath, thumbnailPath);
    } else if (fileExt === '.epub') {
      return await generateEpubThumbnail(rulebook.filePath, thumbnailPath);
    }

    return null;
  } catch (error) {
    logger.warn('Failed to generate rulebook thumbnail', { rulebookId: rulebook.id, error });
    return null;
  }
}

/**
 * Generate PDF thumbnail using pdf-lib and sharp
 */
async function generatePDFThumbnail(filePath: string, outputPath: string): Promise<string> {
  // Use the existing thumbnail utility
  const { generateThumbnail } = await import('../utils/thumbnails.js');
  await generateThumbnail(filePath);
  return outputPath;
}

/**
 * Generate EPUB thumbnail (stub)
 */
async function generateEpubThumbnail(_filePath: string, _outputPath: string): Promise<string | null> {
  // TODO: Implement EPUB cover extraction
  return null;
}

/**
 * Get processing status for a rulebook
 */
export async function getProcessingStatus(rulebookId: string): Promise<ProcessingProgress | null> {
  const rulebook = await prisma.rulebook.findUnique({
    where: { id: rulebookId },
    select: {
      id: true,
      status: true,
      totalPages: true,
      processedPages: true,
    },
  });

  if (!rulebook) return null;

  return {
    rulebookId: rulebook.id,
    status: rulebook.status,
    processedPages: rulebook.processedPages,
    totalPages: rulebook.totalPages ?? 0,
    currentStep: getStatusMessage(rulebook.status, rulebook.processedPages, rulebook.totalPages ?? 0),
  };
}

function getStatusMessage(status: RulebookStatus, processed: number, total: number): string {
  switch (status) {
    case 'PENDING':
      return 'Waiting to start';
    case 'PROCESSING':
      return `Processing... ${processed}/${total} pages`;
    case 'COMPLETED':
      return 'Processing complete';
    case 'FAILED':
      return 'Processing failed';
    case 'PARTIAL':
      return `Partially processed (${processed}/${total} pages)`;
    default:
      return 'Unknown status';
  }
}

/**
 * Re-process a failed or partial rulebook
 */
export async function reprocessRulebook(
  rulebookId: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<void> {
  // Delete existing chunks
  await prisma.rulebookChunk.deleteMany({
    where: { rulebookId },
  });

  // Reset processed pages
  await prisma.rulebook.update({
    where: { id: rulebookId },
    data: { processedPages: 0, status: RulebookStatus.PENDING },
  });

  // Re-process
  await processRulebook(rulebookId, onProgress);
}
