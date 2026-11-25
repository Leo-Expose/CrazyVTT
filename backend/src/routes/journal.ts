/**
 * Journal Routes
 * API endpoints for campaign journal entries, folders, and images
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { campaignMember, campaignDM } from '../middleware/compose';
import { AuthenticatedRequest } from '../middleware/rbac';
import { prisma } from '../config/database';
import {
  getJournalFolders,
  getJournalEntries,
  getJournalEntry,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  createJournalFolder,
  updateJournalFolder,
  deleteJournalFolder,
  addJournalImage,
  removeJournalImage,
  getJournalTree,
} from '../services/journal';
import { broadcastToCampaign } from '../websocket/utils';

const router = Router();

// UUID validation schema
const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

// All routes require authentication
router.use(requireAuth);

// Validation schemas
const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(100),
  parentId: uuidSchema.nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().default(0),
});

const updateFolderSchema = createFolderSchema.partial();

const createEntrySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string(), // HTML from TipTap
  visibility: z.enum(['PUBLIC', 'DM_ONLY', 'PLAYER_SPECIFIC']).default('PUBLIC'),
  allowedPlayerIds: z.array(uuidSchema).default([]),
  folderId: uuidSchema.nullable().optional(),
  tags: z.array(z.string()).default([]),
});

const updateEntrySchema = createEntrySchema.partial();

const createImageSchema = z.object({
  assetId: uuidSchema,
  caption: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

const entryQuerySchema = z.object({
  folderId: uuidSchema.nullable().optional(),
  visibility: z.enum(['PUBLIC', 'DM_ONLY', 'PLAYER_SPECIFIC']).optional(),
});

function handleZodError(error: unknown, res: Response): boolean {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', details: error.issues });
    return true;
  }
  return false;
}

// ============================================
// FOLDER ROUTES
// ============================================

/**
 * GET /api/campaigns/:campaignId/journal/folders
 * Get journal folder tree
 * Requires: Campaign membership (any role)
 */
router.get('/:campaignId/journal/folders', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const folders = await getJournalFolders(campaignId);
    return res.json({ folders });
  } catch (error) {
    console.error('Get journal folders error:', error);
    return res.status(500).json({ error: 'Failed to get folders' });
  }
});

/**
 * POST /api/campaigns/:campaignId/journal/folders
 * Create a journal folder
 * Requires: Campaign DM role
 */
router.post('/:campaignId/journal/folders', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const validated = createFolderSchema.parse(req.body);

    const folder = await createJournalFolder({
      ...validated,
      campaignId,
      createdById: req.session.userId!,
    });

    // Broadcast folder created
    broadcastToCampaign(campaignId, 'journal.folder.created', { folder });

    return res.status(201).json({ folder });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Create journal folder error:', error);
    return res.status(500).json({ error: 'Failed to create folder' });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/journal/folders/:folderId
 * Update a journal folder
 * Requires: Campaign DM role
 */
router.patch('/:campaignId/journal/folders/:folderId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { folderId } = req.params;
    const validated = updateFolderSchema.parse(req.body);

    const folder = await updateJournalFolder(folderId, validated);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Broadcast folder updated
    broadcastToCampaign(req.params.campaignId, 'journal.folder.updated', { folder });

    return res.json({ folder });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Update journal folder error:', error);
    return res.status(500).json({ error: 'Failed to update folder' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/journal/folders/:folderId
 * Delete a journal folder
 * Requires: Campaign DM role
 */
router.delete('/:campaignId/journal/folders/:folderId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { folderId } = req.params;
    const cascade = req.query.cascade === 'true';

    await deleteJournalFolder(folderId, cascade);

    // Broadcast folder deleted
    broadcastToCampaign(req.params.campaignId, 'journal.folder.deleted', { folderId });

    return res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Delete journal folder error:', error);
    if (error instanceof Error && error.message.includes('children or entries')) {
      return res.status(400).json({ error: 'Validation Error', message: error.message });
    }
    return res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// ============================================
// ENTRY ROUTES
// ============================================

/**
 * GET /api/campaigns/:campaignId/journal
 * List journal entries (filtered by visibility)
 * Requires: Campaign membership (any role)
 */
router.get('/:campaignId/journal', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const query = entryQuerySchema.parse(req.query);
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    const entries = await getJournalEntries(campaignId, {
      folderId: query.folderId ?? undefined,
      userId,
      userRole,
      visibility: query.visibility,
    });

    return res.json({ entries });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Get journal entries error:', error);
    return res.status(500).json({ error: 'Failed to get entries' });
  }
});

/**
 * GET /api/campaigns/:campaignId/journal/tree
 * Get full journal tree (folders + unassigned entries)
 * Requires: Campaign membership (any role)
 */
router.get('/:campaignId/journal/tree', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    const tree = await getJournalTree(campaignId, userId, userRole);
    return res.json(tree);
  } catch (error) {
    console.error('Get journal tree error:', error);
    return res.status(500).json({ error: 'Failed to get journal tree' });
  }
});

/**
 * POST /api/campaigns/:campaignId/journal
 * Create a journal entry
 * Requires: Campaign membership (any role - players can create own, DM can create any)
 */
router.post('/:campaignId/journal', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const validated = createEntrySchema.parse(req.body);
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Players can only create PUBLIC or PLAYER_SPECIFIC entries for themselves
    if (userRole !== 'DM') {
      if (validated.visibility === 'DM_ONLY') {
        return res.status(403).json({ error: 'Forbidden', message: 'Only DMs can create DM-only entries' });
      }
      if (validated.visibility === 'PLAYER_SPECIFIC') {
        // Players can only include themselves in allowedPlayerIds
        const allowedIds = validated.allowedPlayerIds ?? [];
        const hasOthers = allowedIds.some(id => id !== userId);
        if (hasOthers) {
          return res.status(403).json({ error: 'Forbidden', message: 'You can only share with yourself' });
        }
        if (!allowedIds.includes(userId)) {
          return res.status(403).json({ error: 'Forbidden', message: 'You must include yourself when sharing with specific players' });
        }
      }
    }

    const entry = await createJournalEntry({
      ...validated,
      campaignId,
      createdById: userId,
    });

    // Broadcast entry created
    broadcastToCampaign(campaignId, 'journal.created', { entry });

    return res.status(201).json({ entry });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Create journal entry error:', error);
    return res.status(500).json({ error: 'Failed to create entry' });
  }
});

/**
 * GET /api/campaigns/:campaignId/journal/:entryId
 * Get a single journal entry (404 if not visible)
 * Requires: Campaign membership (any role)
 */
router.get('/:campaignId/journal/:entryId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entryId } = req.params;
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    const entry = await getJournalEntry(entryId, userId, userRole);
    if (!entry) {
      return res.status(404).json({ error: 'Not Found', message: 'Entry not found' });
    }

    // Verify entry belongs to this campaign
    if (entry.campaignId !== req.params.campaignId) {
      return res.status(404).json({ error: 'Not Found', message: 'Entry not found' });
    }

    return res.json({ entry });
  } catch (error) {
    console.error('Get journal entry error:', error);
    return res.status(500).json({ error: 'Failed to get entry' });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/journal/:entryId
 * Update a journal entry
 * Requires: Campaign membership, and authorship (or DM)
 */
router.patch('/:campaignId/journal/:entryId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entryId } = req.params;
    const validated = updateEntrySchema.parse(req.body);
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Players can only update their own entries, and cannot change visibility to DM_ONLY
    if (userRole !== 'DM') {
      const entry = await prisma.journalEntry.findUnique({
        where: { id: entryId },
        select: { createdById: true, visibility: true },
      });

      if (!entry || entry.createdById !== userId) {
        return res.status(403).json({ error: 'Forbidden', message: 'You can only edit your own entries' });
      }

      if (validated.visibility === 'DM_ONLY') {
        return res.status(403).json({ error: 'Forbidden', message: 'Only DMs can create DM-only entries' });
      }

      if (validated.visibility === 'PLAYER_SPECIFIC') {
        const allowedIds = validated.allowedPlayerIds ?? [];
        const hasOthers = allowedIds.some(id => id !== userId);
        if (hasOthers) {
          return res.status(403).json({ error: 'Forbidden', message: 'You can only share with yourself' });
        }
        if (!allowedIds.includes(userId)) {
          return res.status(403).json({ error: 'Forbidden', message: 'You must include yourself when sharing with specific players' });
        }
      }
    }

    const entry = await updateJournalEntry(entryId, validated, userId, userRole);
    if (!entry) {
      return res.status(404).json({ error: 'Not Found', message: 'Entry not found' });
    }

    // Broadcast entry updated
    broadcastToCampaign(req.params.campaignId, 'journal.updated', { entry });

    return res.json({ entry });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Update journal entry error:', error);
    return res.status(500).json({ error: 'Failed to update entry' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/journal/:entryId
 * Delete a journal entry
 * Requires: Campaign membership, and authorship (or DM)
 */
router.delete('/:campaignId/journal/:entryId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entryId } = req.params;
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Check ownership
    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: { createdById: true, campaignId: true },
    });

    if (!entry || entry.campaignId !== req.params.campaignId) {
      return res.status(404).json({ error: 'Not Found', message: 'Entry not found' });
    }

    const isAuthor = entry.createdById === userId;
    const isDM = userRole === 'DM';

    if (!isAuthor && !isDM) {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only delete your own entries' });
    }

    await deleteJournalEntry(entryId, userId, userRole);

    // Broadcast entry deleted
    broadcastToCampaign(req.params.campaignId, 'journal.deleted', { entryId });

    return res.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    console.error('Delete journal entry error:', error);
    return res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// ============================================
// IMAGE ROUTES
// ============================================

/**
 * POST /api/campaigns/:campaignId/journal/:entryId/images
 * Add image to journal entry
 * Requires: Campaign membership, and authorship (or DM)
 */
router.post('/:campaignId/journal/:entryId/images', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, entryId } = req.params;
    const validated = createImageSchema.parse(req.body);
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Check entry ownership
    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: { createdById: true, campaignId: true },
    });

    if (!entry || entry.campaignId !== campaignId) {
      return res.status(404).json({ error: 'Not Found', message: 'Entry not found' });
    }

    const isAuthor = entry.createdById === userId;
    const isDM = userRole === 'DM';

    if (!isAuthor && !isDM) {
      return res.status(403).json({ error: 'Forbidden', message: 'Only the author or DM can add images' });
    }

    const image = await addJournalImage({ ...validated, entryId });

    // Broadcast image added (could send full entry or just image)
    broadcastToCampaign(campaignId, 'journal.image.added', { entryId, image });

    return res.status(201).json({ image });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Add journal image error:', error);
    return res.status(500).json({ error: 'Failed to add image' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/journal/:entryId/images/:imageId
 * Remove image from journal entry
 * Requires: Campaign membership, and authorship (or DM)
 */
router.delete('/:campaignId/journal/:entryId/images/:imageId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, entryId, imageId } = req.params;
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Check entry ownership
    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: { createdById: true, campaignId: true },
    });

    if (!entry || entry.campaignId !== campaignId) {
      return res.status(404).json({ error: 'Not Found', message: 'Entry not found' });
    }

    const isAuthor = entry.createdById === userId;
    const isDM = userRole === 'DM';

    if (!isAuthor && !isDM) {
      return res.status(403).json({ error: 'Forbidden', message: 'Only the author or DM can remove images' });
    }

    await removeJournalImage(imageId);

    // Broadcast image removed
    broadcastToCampaign(campaignId, 'journal.image.removed', { entryId, imageId });

    return res.json({ message: 'Image removed successfully' });
  } catch (error) {
    console.error('Remove journal image error:', error);
    return res.status(500).json({ error: 'Failed to remove image' });
  }
});

export default router;