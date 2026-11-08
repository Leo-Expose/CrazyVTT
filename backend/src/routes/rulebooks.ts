import { Router, Response } from 'express';
import type { Prisma } from '@prisma/client';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated, campaignDM } from '../middleware/compose';
import { prisma } from '../config/database';
import { UploadRequest, uploadGeneric, handleUploadError } from '../middleware/upload';
import { validateFileType, validateFileSize } from '../middleware/fileValidation';
import { ensureDirectory, getUploadsDirectory } from '../utils/fileUtils';
import {
  RulebookUploadMetadataSchema,
  CreateRulebookActivationSchema,
  ProcessRulebookSchema,
  RulebookListQuerySchema,
  RulebookChunkListQuerySchema,
} from '../validators/rulebooks';
import { processRulebook, getProcessingStatus } from '../services/rulebookProcessor';
import { generateThumbnail } from '../utils/thumbnails';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger';

const router = Router();

/**
 * Rate limiter for rulebook uploads
 */
const rulebookUploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 uploads per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const session = (req as AuthenticatedRequest).session;
    return session?.userId ? `user:${session.userId}` : (req.ip ? ipKeyGenerator(req.ip) : 'anonymous');
  },
  message: {
    error: 'Too Many Requests',
    message: 'Rulebook upload rate limit reached. Please slow down.',
  },
});

/**
 * POST /api/rulebooks/upload
 * Upload a rulebook PDF/EPUB file
 * Requires: Authentication, DM role in campaign
 * Body: multipart/form-data with file and metadata (title, sourceId, edition, campaignId)
 */
router.post(
  '/upload',
  authenticated,
  rulebookUploadLimiter,
  uploadGeneric.single('file'),
  handleUploadError,
  validateFileType,
  validateFileSize,
  async (req: UploadRequest, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'Validation Error', message: 'No file uploaded' });
      }

      // Parse and validate metadata
      const metadataResult = RulebookUploadMetadataSchema.safeParse(req.body);
      if (!metadataResult.success) {
        // Clean up uploaded file
        await fs.unlink(file.path).catch(() => {});
        return res.status(400).json({ error: 'Validation Error', message: metadataResult.error.issues[0]?.message });
      }

      const { title, sourceId, edition, campaignId } = metadataResult.data;

      // Verify user is DM of the campaign
      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
        select: { role: true },
      });

      if (!membership || membership.role !== 'DM') {
        await fs.unlink(file.path).catch(() => {});
        return res.status(403).json({ error: 'Forbidden', message: 'Only DMs can upload rulebooks to this campaign' });
      }

      // Validate file type
      const fileExt = path.extname(file.originalname).toLowerCase();
      if (!['.pdf', '.epub'].includes(fileExt)) {
        await fs.unlink(file.path).catch(() => {});
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Only PDF and EPUB files are allowed for rulebooks',
        });
      }

      // Check file size (max 500MB for rulebooks)
      const maxSize = 500 * 1024 * 1024; // 500MB
      if (file.size > maxSize) {
        await fs.unlink(file.path).catch(() => {});
        return res.status(400).json({
          error: 'File Too Large',
          message: 'Rulebook files must be smaller than 500MB',
        });
      }

      // Move file to rulebooks directory
      const uploadsDir = getUploadsDirectory();
      const rulebookDir = path.join(uploadsDir, 'rulebooks', campaignId);
      await ensureDirectory(rulebookDir);

      const targetPath = path.join(rulebookDir, path.basename(file.path));
      await fs.rename(file.path, targetPath);

      // Generate thumbnail
      let thumbnailPath: string | null = null;
      try {
        thumbnailPath = await generateThumbnail(targetPath);
      } catch (error) {
        logger.warn('Failed to generate rulebook thumbnail', { error });
      }

      // Create rulebook record
      const rulebook = await prisma.rulebook.create({
        data: {
          campaignId,
          title,
          sourceId,
          edition,
          filePath: targetPath,
          thumbnailPath,
          status: 'PENDING',
          uploadedById: userId,
        },
        include: {
          uploadedBy: { select: { id: true, displayName: true } },
        },
      });

      logger.info('Rulebook uploaded', { rulebookId: rulebook.id, campaignId, title });

      return res.status(201).json(rulebook);
    } catch (error) {
      logger.error('Rulebook upload failed', { error });
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to upload rulebook' });
    }
  }
);

/**
 * GET /api/rulebooks
 * List rulebooks with optional filtering
 */
router.get('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session!.userId!;
    const queryResult = RulebookListQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({ error: 'Validation Error', message: queryResult.error.issues[0]?.message });
    }

    const { campaignId, status, page, limit } = queryResult.data;

    // Build where clause
    const where: Prisma.RulebookWhereInput = {};

    if (campaignId) {
      // Verify user is member of campaign
      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
      });
      if (!membership) {
        return res.status(403).json({ error: 'Forbidden', message: 'Not a member of this campaign' });
      }
      where.campaignId = campaignId;
    } else {
      // Only show rulebooks from campaigns user is a member of
      const memberships = await prisma.campaignMembership.findMany({
        where: { userId },
        select: { campaignId: true },
      });
      where.campaignId = { in: memberships.map(m => m.campaignId) };
    }

    if (status) {
      where.status = status;
    }

    const [rulebooks, total] = await Promise.all([
      prisma.rulebook.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, displayName: true } },
          campaign: { select: { id: true, name: true } },
          _count: { select: { chunks: true, activations: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.rulebook.count({ where }),
    ]);

    return res.json({
      data: rulebooks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Failed to list rulebooks', { error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list rulebooks' });
  }
});

/**
 * GET /api/rulebooks/:id
 * Get a single rulebook with details
 */
router.get('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session!.userId!;
    const { id } = req.params;

    const rulebook = await prisma.rulebook.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, displayName: true } },
        campaign: { select: { id: true, name: true } },
        chunks: {
          orderBy: { pageStart: 'asc' },
          take: 100, // Limit chunks in main response
        },
        activations: {
          include: { activatedBy: { select: { id: true, displayName: true } } },
        },
      },
    });

    if (!rulebook) {
      return res.status(404).json({ error: 'Not Found', message: 'Rulebook not found' });
    }

    // Verify user is member of campaign
    const membership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId: rulebook.campaignId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not a member of this campaign' });
    }

    return res.json(rulebook);
  } catch (error) {
    logger.error('Failed to get rulebook', { error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get rulebook' });
  }
});

/**
 * GET /api/rulebooks/:id/chunks
 * Get rulebook chunks with pagination
 */
router.get('/:id/chunks', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session!.userId!;
    const queryResult = RulebookChunkListQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({ error: 'Validation Error', message: queryResult.error.issues[0]?.message });
    }

    const { rulebookId, contentType, page, limit } = queryResult.data;

    // Verify rulebook exists and user has access
    const rulebook = await prisma.rulebook.findUnique({
      where: { id: rulebookId },
      select: { campaignId: true },
    });

    if (!rulebook) {
      return res.status(404).json({ error: 'Not Found', message: 'Rulebook not found' });
    }

    const membership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId: rulebook.campaignId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not a member of this campaign' });
    }

    const where: Prisma.RulebookChunkWhereInput = { rulebookId };
    if (contentType) where.contentType = contentType;

    const [chunks, total] = await Promise.all([
      prisma.rulebookChunk.findMany({
        where,
        orderBy: { pageStart: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.rulebookChunk.count({ where }),
    ]);

    return res.json({
      data: chunks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Failed to get rulebook chunks', { error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get chunks' });
  }
});

/**
 * POST /api/rulebooks/:id/process
 * Start processing a rulebook (extract text, chunk, LLM extraction)
 */
router.post('/:id/process', authenticated, campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const processResult = ProcessRulebookSchema.safeParse({ rulebookId: id });
    if (!processResult.success) {
      return res.status(400).json({ error: 'Validation Error', message: processResult.error.issues[0]?.message });
    }

    const rulebook = await prisma.rulebook.findUnique({
      where: { id },
      select: { id: true, campaignId: true, status: true },
    });

    if (!rulebook) {
      return res.status(404).json({ error: 'Not Found', message: 'Rulebook not found' });
    }

    if (rulebook.status === 'PROCESSING') {
      return res.status(409).json({ error: 'Conflict', message: 'Rulebook is already being processed' });
    }

    // Start processing in background
    processRulebook(id).catch((error) => {
      logger.error('Background rulebook processing failed', { rulebookId: id, error });
    });

    return res.json({ message: 'Processing started', rulebookId: id });
  } catch (error) {
    logger.error('Failed to start rulebook processing', { error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to start processing' });
  }
});

/**
 * GET /api/rulebooks/:id/processing-status
 * Get processing status for a rulebook
 */
router.get('/:id/processing-status', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session!.userId!;
    const { id } = req.params;

    const rulebook = await prisma.rulebook.findUnique({
      where: { id },
      select: { campaignId: true },
    });

    if (!rulebook) {
      return res.status(404).json({ error: 'Not Found', message: 'Rulebook not found' });
    }

    const membership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId: rulebook.campaignId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not a member of this campaign' });
    }

    const status = await getProcessingStatus(id);
    if (!status) {
      return res.status(404).json({ error: 'Not Found', message: 'Rulebook not found' });
    }

    return res.json(status);
  } catch (error) {
    logger.error('Failed to get processing status', { error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get status' });
  }
});

/**
 * POST /api/rulebooks/:id/activate
 * Activate rulebook content for a campaign
 */
router.post('/:id/activate', authenticated, campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session!.userId!;
    const { id } = req.params;
    const activationResult = CreateRulebookActivationSchema.safeParse({ ...req.body, rulebookId: id });
    if (!activationResult.success) {
      return res.status(400).json({ error: 'Validation Error', message: activationResult.error.issues[0]?.message });
    }

    const { rulebookId, contentType, sourceIds } = activationResult.data;

    // Verify rulebook exists and user is DM
    const rulebook = await prisma.rulebook.findUnique({
      where: { id: rulebookId },
      select: { campaignId: true },
    });

    if (!rulebook) {
      return res.status(404).json({ error: 'Not Found', message: 'Rulebook not found' });
    }

    // Check if activation already exists
    const existing = await prisma.rulebookActivation.findFirst({
      where: { campaignId: rulebook.campaignId, rulebookId, contentType: contentType ?? null },
    });

    let activation;
    if (existing) {
      // Update existing
      activation = await prisma.rulebookActivation.update({
        where: { id: existing.id },
        data: {
          sourceIds,
          activatedById: userId,
          activatedAt: new Date(),
        },
        include: {
          activatedBy: { select: { id: true, displayName: true } },
          rulebook: true,
        },
      });
    } else {
      // Create new
      activation = await prisma.rulebookActivation.create({
        data: {
          campaignId: rulebook.campaignId,
          rulebookId,
          contentType,
          sourceIds,
          activatedById: userId,
        },
        include: {
          activatedBy: { select: { id: true, displayName: true } },
          rulebook: true,
        },
      });
    }

    return res.json(activation);
  } catch (error) {
    logger.error('Failed to activate rulebook', { error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to activate rulebook' });
  }
});

/**
 * GET /api/rulebooks/:id/activations
 * Get all activations for a rulebook in a campaign
 */
router.get('/:id/activations', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session!.userId!;
    const { id } = req.params;

    const rulebook = await prisma.rulebook.findUnique({
      where: { id },
      select: { campaignId: true },
    });

    if (!rulebook) {
      return res.status(404).json({ error: 'Not Found', message: 'Rulebook not found' });
    }

    const membership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId: rulebook.campaignId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not a member of this campaign' });
    }

    const activations = await prisma.rulebookActivation.findMany({
      where: { rulebookId: id },
      include: { activatedBy: { select: { id: true, displayName: true } } },
      orderBy: { activatedAt: 'desc' },
    });

    return res.json(activations);
  } catch (error) {
    logger.error('Failed to get activations', { error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get activations' });
  }
});

/**
 * DELETE /api/rulebooks/:id/activations/:activationId
 * Deactivate rulebook content
 */
router.delete('/:id/activations/:activationId', authenticated, campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, activationId } = req.params;

    const activation = await prisma.rulebookActivation.findUnique({
      where: { id: activationId },
      select: { rulebookId: true, campaignId: true },
    });

    if (!activation || activation.rulebookId !== id) {
      return res.status(404).json({ error: 'Not Found', message: 'Activation not found' });
    }

    await prisma.rulebookActivation.delete({ where: { id: activationId } });

    return res.json({ message: 'Activation removed' });
  } catch (error) {
    logger.error('Failed to deactivate rulebook', { error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to deactivate' });
  }
});

/**
 * DELETE /api/rulebooks/:id
 * Delete a rulebook (DM only)
 */
router.delete('/:id', authenticated, campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const rulebook = await prisma.rulebook.findUnique({
      where: { id },
      select: { campaignId: true, filePath: true, thumbnailPath: true },
    });

    if (!rulebook) {
      return res.status(404).json({ error: 'Not Found', message: 'Rulebook not found' });
    }

    // Delete file
    await fs.unlink(rulebook.filePath).catch(() => {});
    if (rulebook.thumbnailPath) {
      await fs.unlink(rulebook.thumbnailPath).catch(() => {});
    }

    // Delete rulebook (cascades to chunks and activations)
    await prisma.rulebook.delete({ where: { id } });

    return res.json({ message: 'Rulebook deleted' });
  } catch (error) {
    logger.error('Failed to delete rulebook', { error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete rulebook' });
  }
});

export default router;
