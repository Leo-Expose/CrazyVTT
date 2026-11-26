/**
 * Journal Service
 * Handles campaign journal entries, folders, and images with visibility controls.
 */

import { JournalEntry, JournalFolder, JournalImage, JournalVisibility, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/database';

// Validation schemas
const createFolderSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().default(0),
  createdById: z.string().uuid(),
});

const updateFolderSchema = createFolderSchema.partial().omit({ campaignId: true, createdById: true });

const createEntrySchema = z.object({
  campaignId: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string(), // HTML from TipTap
  visibility: z.enum(['PUBLIC', 'DM_ONLY', 'PLAYER_SPECIFIC']).default('PUBLIC'),
  allowedPlayerIds: z.array(z.string().uuid()).default([]),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).default([]),
  createdById: z.string().uuid(),
});

const updateEntrySchema = createEntrySchema.partial().omit({ campaignId: true, createdById: true });

const createImageSchema = z.object({
  entryId: z.string().uuid(),
  assetId: z.string().uuid(),
  caption: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export interface JournalEntryWithRelations extends JournalEntry {
  createdBy: { id: string; displayName: string } | null;
  updatedBy: { id: string; displayName: string } | null;
  folder: JournalFolder | null;
  images: (JournalImage & { asset: { id: string; filePath: string; thumbnailPath: string | null; mimeType: string } })[];
}

export interface JournalFolderWithChildren extends JournalFolder {
  children: JournalFolderWithChildren[];
  entryCount: number;
}

export interface JournalTree {
  folders: JournalFolderWithChildren[];
  unassignedEntries: JournalEntryWithRelations[];
}

/**
 * Get journal folder tree for a campaign
 */
export async function getJournalFolders(campaignId: string): Promise<JournalFolderWithChildren[]> {
  const folders = await prisma.journalFolder.findMany({
    where: { campaignId },
    orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Build tree
  const folderMap = new Map<string, JournalFolderWithChildren>();
  for (const folder of folders) {
    folderMap.set(folder.id, { ...folder, children: [], entryCount: 0 });
  }

  const roots: JournalFolderWithChildren[] = [];
  for (const folder of folders) {
    const node = folderMap.get(folder.id)!;
    if (folder.parentId) {
      const parent = folderMap.get(folder.parentId);
      if (parent) parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Count entries per folder
  const entryCounts = await prisma.journalEntry.groupBy({
    by: ['folderId'],
    where: { campaignId, folderId: { not: null } },
    _count: { id: true },
  });

  for (const { folderId, _count } of entryCounts) {
    if (folderId) {
      const folder = folderMap.get(folderId);
      if (folder) folder.entryCount = _count.id;
    }
  }

  return roots;
}

/**
 * Get journal entries for a campaign, filtered by visibility
 */
export async function getJournalEntries(
  campaignId: string,
  options: {
    folderId?: string | null;
    userId: string;
    userRole: 'DM' | 'PLAYER' | 'SPECTATOR';
    visibility?: JournalVisibility;
  }
): Promise<JournalEntryWithRelations[]> {
  const { folderId, userId, userRole, visibility } = options;

  // Build visibility filter
  const visibilityFilter: Prisma.JournalEntryWhereInput = {};
  if (visibility) {
    visibilityFilter.visibility = visibility;
  } else {
    // Default visibility logic based on role
    if (userRole === 'DM') {
      // DM sees everything
    } else {
      // Players see PUBLIC and PLAYER_SPECIFIC where they're listed
      visibilityFilter.OR = [
        { visibility: 'PUBLIC' },
        { visibility: 'PLAYER_SPECIFIC', allowedPlayerIds: { has: userId } },
      ];
    }
  }

  const entries = await prisma.journalEntry.findMany({
    where: {
      campaignId,
      folderId: folderId ?? undefined,
      ...visibilityFilter,
    },
    include: {
      createdBy: { select: { id: true, displayName: true } },
      updatedBy: { select: { id: true, displayName: true } },
      folder: true,
      images: {
        include: {
          asset: { select: { id: true, filePath: true, thumbnailPath: true, mimeType: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return entries as JournalEntryWithRelations[];
}

/**
 * Get a single journal entry with visibility check
 */
export async function getJournalEntry(
  entryId: string,
  userId: string,
  userRole: 'DM' | 'PLAYER' | 'SPECTATOR'
): Promise<JournalEntryWithRelations | null> {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    include: {
      createdBy: { select: { id: true, displayName: true } },
      updatedBy: { select: { id: true, displayName: true } },
      folder: true,
      images: {
        include: {
          asset: { select: { id: true, filePath: true, thumbnailPath: true, mimeType: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!entry) return null;

  // Visibility check
  if (entry.visibility === 'DM_ONLY' && userRole !== 'DM') return null;
  if (entry.visibility === 'PLAYER_SPECIFIC' && !entry.allowedPlayerIds.includes(userId) && userRole !== 'DM') return null;

  return entry as JournalEntryWithRelations;
}

/**
 * Create a journal entry
 */
export async function createJournalEntry(data: z.infer<typeof createEntrySchema>): Promise<JournalEntryWithRelations> {
  const validated = createEntrySchema.parse(data);

  // Verify folder belongs to campaign if specified
  if (validated.folderId) {
    const folder = await prisma.journalFolder.findUnique({ where: { id: validated.folderId } });
    if (!folder || folder.campaignId !== validated.campaignId) {
      throw new Error('Folder not found in this campaign');
    }
  }

  const entry = await prisma.journalEntry.create({
    data: {
      campaignId: validated.campaignId,
      title: validated.title,
      content: validated.content,
      visibility: validated.visibility as JournalVisibility,
      allowedPlayerIds: validated.allowedPlayerIds,
      folderId: validated.folderId,
      tags: validated.tags,
      createdById: validated.createdById,
    },
    include: {
      createdBy: { select: { id: true, displayName: true } },
      updatedBy: { select: { id: true, displayName: true } },
      folder: true,
      images: {
        include: {
          asset: { select: { id: true, filePath: true, thumbnailPath: true, mimeType: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  return entry as JournalEntryWithRelations;
}

/**
 * Update a journal entry (author or DM only)
 */
export async function updateJournalEntry(
  entryId: string,
  data: z.infer<typeof updateEntrySchema>,
  userId: string,
  userRole: 'DM' | 'PLAYER' | 'SPECTATOR'
): Promise<JournalEntryWithRelations | null> {
  const validated = updateEntrySchema.parse(data);

  // Check ownership/permission
  const entry = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    select: { createdById: true, campaignId: true, folderId: true },
  });

  if (!entry) return null;

  const isAuthor = entry.createdById === userId;
  const isDM = userRole === 'DM';

  if (!isAuthor && !isDM) return null;

  // Verify folder belongs to campaign if specified
  if (validated.folderId !== undefined && validated.folderId !== null) {
    const folder = await prisma.journalFolder.findUnique({ where: { id: validated.folderId } });
    if (!folder || folder.campaignId !== entry.campaignId) {
      throw new Error('Folder not found in this campaign');
    }
  }

  const updated = await prisma.journalEntry.update({
    where: { id: entryId },
    data: {
      ...(validated.title !== undefined && { title: validated.title }),
      ...(validated.content !== undefined && { content: validated.content }),
      ...(validated.visibility !== undefined && { visibility: validated.visibility as JournalVisibility }),
      ...(validated.allowedPlayerIds !== undefined && { allowedPlayerIds: validated.allowedPlayerIds }),
      ...(validated.folderId !== undefined && { folderId: validated.folderId }),
      ...(validated.tags !== undefined && { tags: validated.tags }),
      updatedById: userId,
    },
    include: {
      createdBy: { select: { id: true, displayName: true } },
      updatedBy: { select: { id: true, displayName: true } },
      folder: true,
      images: {
        include: {
          asset: { select: { id: true, filePath: true, thumbnailPath: true, mimeType: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  return updated as JournalEntryWithRelations;
}

/**
 * Delete a journal entry (author or DM only)
 */
export async function deleteJournalEntry(
  entryId: string,
  userId: string,
  userRole: 'DM' | 'PLAYER' | 'SPECTATOR'
): Promise<boolean> {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    select: { createdById: true },
  });

  if (!entry) return false;

  const isAuthor = entry.createdById === userId;
  const isDM = userRole === 'DM';

  if (!isAuthor && !isDM) return false;

  await prisma.journalEntry.delete({ where: { id: entryId } });
  return true;
}

/**
 * Create a journal folder (DM only)
 */
export async function createJournalFolder(data: z.infer<typeof createFolderSchema>): Promise<JournalFolder> {
  const validated = createFolderSchema.parse(data);

  if (validated.parentId) {
    const parent = await prisma.journalFolder.findUnique({ where: { id: validated.parentId } });
    if (!parent || parent.campaignId !== validated.campaignId) {
      throw new Error('Parent folder not found in this campaign');
    }
  }

  return prisma.journalFolder.create({
    data: {
      campaignId: validated.campaignId,
      name: validated.name,
      parentId: validated.parentId,
      color: validated.color,
      sortOrder: validated.sortOrder,
    },
  });
}

/**
 * Update a journal folder (DM only)
 */
export async function updateJournalFolder(
  folderId: string,
  data: z.infer<typeof updateFolderSchema>
): Promise<JournalFolder | null> {
  const validated = updateFolderSchema.parse(data);

  // Get the folder to check campaign
  const folder = await prisma.journalFolder.findUnique({ where: { id: folderId } });
  if (!folder) return null;

  if (validated.parentId) {
    const parent = await prisma.journalFolder.findUnique({ where: { id: validated.parentId } });
    if (!parent || parent.campaignId !== folder.campaignId) {
      throw new Error('Parent folder not found in this campaign');
    }
    // Prevent circular reference
    if (validated.parentId === folderId) {
      throw new Error('Folder cannot be its own parent');
    }
  }

  return prisma.journalFolder.update({
    where: { id: folderId },
    data: validated,
  });
}

/**
 * Delete a journal folder (DM only)
 */
export async function deleteJournalFolder(
  folderId: string,
  cascade: boolean = false
): Promise<boolean> {
  const folder = await prisma.journalFolder.findUnique({
    where: { id: folderId },
    include: { _count: { select: { children: true, entries: true } } },
  });

  if (!folder) return false;

  if (!cascade && (folder._count.children > 0 || folder._count.entries > 0)) {
    throw new Error('Folder has children or entries. Use cascade=true to delete anyway.');
  }

  await prisma.$transaction(async (tx) => {
    // Move entries to unassigned (null folder) if cascade, or they'll be deleted with the folder
    if (!cascade) {
      await tx.journalEntry.updateMany({
        where: { folderId },
        data: { folderId: null },
      });
    }

    // Delete children recursively
    await deleteFolderRecursive(tx, folderId);

    await tx.journalFolder.delete({ where: { id: folderId } });
  });

  return true;
}

async function deleteFolderRecursive(tx: Prisma.TransactionClient, folderId: string): Promise<void> {
  const children = await tx.journalFolder.findMany({ where: { parentId: folderId } });
  for (const child of children) {
    await deleteFolderRecursive(tx, child.id);
    await tx.journalFolder.delete({ where: { id: child.id } });
  }
}

/**
 * Add image to journal entry
 */
export async function addJournalImage(data: z.infer<typeof createImageSchema>): Promise<JournalImage> {
  const validated = createImageSchema.parse(data);

  // Verify entry exists
  const entry = await prisma.journalEntry.findUnique({ where: { id: validated.entryId } });
  if (!entry) throw new Error('Journal entry not found');

  // Verify asset exists
  const asset = await prisma.asset.findUnique({ where: { id: validated.assetId } });
  if (!asset) throw new Error('Asset not found');

  return prisma.journalImage.create({
    data: validated,
  });
}

/**
 * Remove image from journal entry
 */
export async function removeJournalImage(imageId: string): Promise<boolean> {
  const result = await prisma.journalImage.deleteMany({ where: { id: imageId } });
  return result.count > 0;
}

/**
 * Get journal tree (folders + unassigned entries) for a campaign
 */
export async function getJournalTree(
  campaignId: string,
  userId: string,
  userRole: 'DM' | 'PLAYER' | 'SPECTATOR'
): Promise<JournalTree> {
  const [folders, unassignedEntries] = await Promise.all([
    getJournalFolders(campaignId),
    getJournalEntries(campaignId, { folderId: null, userId, userRole }),
  ]);

  return { folders, unassignedEntries };
}
