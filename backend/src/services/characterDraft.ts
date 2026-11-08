/**
 * Character Draft Service
 * Handles collaborative character editing with version control,
 * conflict detection, lock management, and change history.
 */

import { Prisma, ChangeType, ConflictType, ConflictSeverity } from '@prisma/client';
import { prisma } from '../config/database';
import { GameSystem } from '../game-systems';
import { validateCharacterData } from '../validators/game-systems';
import { applyPatch, type JsonPatch } from '../utils/jsonPatch';
import { deepClone } from '../utils/objectUtils';
import type { ZodIssue } from 'zod';

// Re-export types
export { ChangeType, ConflictType, ConflictSeverity };

export interface DraftData {
  data: Prisma.JsonValue;
  version: number;
  lastEditedById: string;
  lastEditedBy: { id: string; displayName: string };
  updatedAt: Date;
}

export interface CharacterChangeRecord {
  id: string;
  characterId: string;
  fieldPath: string;
  oldValue: Prisma.JsonValue | null;
  newValue: Prisma.JsonValue | null;
  changeType: ChangeType;
  authorId: string;
  author: { id: string; displayName: string };
  resolvedById: string | null;
  resolvedBy: { id: string; displayName: string } | null;
  resolvedAt: Date | null;
  note: string | null;
  createdAt: Date;
}

export interface CharacterLockRecord {
  id: string;
  characterId: string;
  fieldPath: string;
  lockedById: string;
  lockedBy: { id: string; displayName: string };
  reason: string | null;
  createdAt: Date;
}

export interface CharacterConflictRecord {
  id: string;
  characterId: string;
  fieldPath: string;
  conflictType: ConflictType;
  description: string;
  severity: ConflictSeverity;
  detectedAt: Date;
  resolvedAt: Date | null;
  resolvedById: string | null;
  resolvedBy: { id: string; displayName: string } | null;
  resolution: string | null;
}

export interface CreateDraftResult {
  draft: DraftData;
  conflicts: CharacterConflictRecord[];
}

export interface ApplyPatchResult {
  draft: DraftData;
  changes: CharacterChangeRecord[];
  conflicts: CharacterConflictRecord[];
  locks: CharacterLockRecord[];
}

export interface LockFieldResult {
  lock: CharacterLockRecord;
  conflicts: CharacterConflictRecord[];
}

export interface UnlockFieldResult {
  success: boolean;
  conflicts: CharacterConflictRecord[];
}

export interface SuggestChangeResult {
  change: CharacterChangeRecord;
  conflicts: CharacterConflictRecord[];
}

export interface OverrideChangeResult {
  change: CharacterChangeRecord;
  conflicts: CharacterConflictRecord[];
}

export interface ResolveConflictResult {
  conflict: CharacterConflictRecord;
  change: CharacterChangeRecord | null;
  conflicts: CharacterConflictRecord[];
}

export interface GetHistoryResult {
  changes: CharacterChangeRecord[];
  total: number;
}

type DraftWithEditor = {
  data: Prisma.JsonValue;
  version: number;
  lastEditedById: string;
  lastEditedBy: { id: string; displayName: string };
  updatedAt: Date;
};

function toInputJson(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue | undefined;
}

/**
 * Create or get a character draft
 */
export async function getOrCreateDraft(
  characterId: string,
  userId: string
): Promise<DraftData> {
  const draft = await prisma.characterDraft.findUnique({
    where: { characterId },
    include: {
      lastEditedBy: { select: { id: true, displayName: true } },
    },
  });

  if (draft) {
    return {
      data: draft.data,
      version: draft.version,
      lastEditedById: draft.lastEditedById,
      lastEditedBy: draft.lastEditedBy,
      updatedAt: draft.updatedAt,
    };
  }

  // Create new draft from character data
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true },
  });
  if (!character) throw new Error(`Character ${characterId} not found`);

  const newDraft = await prisma.characterDraft.create({
    data: {
      characterId,
      data: toInputJson(character.data)!,
      lastEditedById: userId,
      version: 1,
    },
    include: {
      lastEditedBy: { select: { id: true, displayName: true } },
    },
  }) as unknown as DraftWithEditor;

  return {
    data: newDraft.data,
    version: newDraft.version,
    lastEditedById: newDraft.lastEditedById,
    lastEditedBy: newDraft.lastEditedBy,
    updatedAt: newDraft.updatedAt,
  };
}

/**
 * Apply JSON Patch to draft with optimistic locking
 */
export async function applyPatchToDraft(
  characterId: string,
  patches: JsonPatch[],
  expectedVersion: number,
  userId: string,
  changeType: ChangeType = ChangeType.PLAYER_EDIT,
  note?: string
): Promise<ApplyPatchResult> {
  // Use a transaction with row-level locking
  return await prisma.$transaction(async (tx) => {
    // Lock the draft row
    const draft = await tx.characterDraft.findUnique({
      where: { characterId },
    });

    if (!draft) {
      throw new Error('Draft not found');
    }

    // Check version for optimistic locking
    if (draft.version !== expectedVersion) {
      throw new Error(`Version conflict: expected ${expectedVersion}, current is ${draft.version}`);
    }

    // Check for locks on fields being modified
    await tx.characterLock.findMany({
      where: {
        characterId,
        fieldPath: { in: patches.map((p) => p.path) },
      },
      include: { lockedBy: { select: { id: true, displayName: true } } },
    });

    // Apply patches to a copy of the data
    const currentData = deepClone(draft.data as object);
    let newData: object;

    try {
      newData = applyPatch(currentData, patches);
    } catch (error) {
      throw new Error(`Failed to apply patch: ${(error as Error).message}`, { cause: error });
    }

    // Detect conflicts
    const conflicts = await detectConflicts(
      tx,
      characterId,
      draft.data as object,
      newData,
      patches
    );

    // Record changes
    const changes: CharacterChangeRecord[] = [];
    for (const patch of patches) {
      const oldValue = getValueAtPath(draft.data as object, patch.path);
      const newValue = getValueAtPath(newData, patch.path);

      const change = await tx.characterChange.create({
        data: {
          characterId,
          fieldPath: patch.path,
          oldValue: toInputJson(oldValue as Prisma.JsonValue | null),
          newValue: toInputJson(newValue as Prisma.JsonValue | null),
          changeType,
          authorId: userId,
          note,
        },
        include: {
          author: { select: { id: true, displayName: true } },
          resolvedBy: { select: { id: true, displayName: true } },
        },
      }) as unknown as CharacterChangeRecord;

      changes.push({
        id: change.id,
        characterId: change.characterId,
        fieldPath: change.fieldPath,
        oldValue: change.oldValue,
        newValue: change.newValue,
        changeType: change.changeType,
        authorId: change.authorId,
        author: change.author,
        resolvedById: change.resolvedById,
        resolvedBy: change.resolvedBy,
        resolvedAt: change.resolvedAt,
        note: change.note,
        createdAt: change.createdAt,
      });
    }

    // Update draft with new data and increment version
    const updatedDraft = await tx.characterDraft.update({
      where: { characterId },
      data: {
        data: toInputJson(newData as Prisma.JsonValue),
        version: { increment: 1 },
        lastEditedById: userId,
      },
      include: {
        lastEditedBy: { select: { id: true, displayName: true } },
      },
    }) as unknown as DraftWithEditor;

    // Get current locks
    const locks = await tx.characterLock.findMany({
      where: { characterId },
      include: { lockedBy: { select: { id: true, displayName: true } } },
    });

    return {
      draft: {
        data: updatedDraft.data,
        version: updatedDraft.version,
        lastEditedById: updatedDraft.lastEditedById,
        lastEditedBy: updatedDraft.lastEditedBy,
        updatedAt: updatedDraft.updatedAt,
      },
      changes,
      conflicts,
      locks: locks.map((l) => ({
        id: l.id,
        characterId: l.characterId,
        fieldPath: l.fieldPath,
        lockedById: l.lockedById,
        lockedBy: l.lockedBy,
        reason: l.reason,
        createdAt: l.createdAt,
      })),
    };
  });
}

/**
 * Lock a field (DM only)
 */
export async function lockField(
  characterId: string,
  fieldPath: string,
  userId: string,
  reason?: string
): Promise<LockFieldResult> {
  return await prisma.$transaction(async (tx) => {
    // Check if already locked
    const existingLock = await tx.characterLock.findUnique({
      where: { characterId_fieldPath: { characterId, fieldPath } },
      include: { lockedBy: { select: { id: true, displayName: true } } },
    });

    if (existingLock) {
      throw new Error(`Field ${fieldPath} is already locked by ${existingLock.lockedBy.displayName}`);
    }

    const lock = await tx.characterLock.create({
      data: {
        characterId,
        fieldPath,
        lockedById: userId,
        reason,
      },
      include: { lockedBy: { select: { id: true, displayName: true } } },
    });

    // Record the lock action
    await tx.characterChange.create({
      data: {
        characterId,
        fieldPath,
        oldValue: Prisma.JsonNull,
        newValue: { locked: true, reason },
        changeType: ChangeType.DM_LOCK,
        authorId: userId,
        note: reason,
      },
    });

    // Check for conflicts after locking
    const draft = await tx.characterDraft.findUnique({ where: { characterId } });
    const conflicts = draft ? await detectConflicts(tx, characterId, draft.data as object, draft.data as object, []) : [];

    return {
      lock: {
        id: lock.id,
        characterId: lock.characterId,
        fieldPath: lock.fieldPath,
        lockedById: lock.lockedById,
        lockedBy: lock.lockedBy,
        reason: lock.reason,
        createdAt: lock.createdAt,
      },
      conflicts,
    };
  });
}

/**
 * Unlock a field (DM only)
 */
export async function unlockField(
  characterId: string,
  fieldPath: string,
  userId: string
): Promise<UnlockFieldResult> {
  return await prisma.$transaction(async (tx) => {
    const lock = await tx.characterLock.findUnique({
      where: { characterId_fieldPath: { characterId, fieldPath } },
    });

    if (!lock) {
      throw new Error(`Field ${fieldPath} is not locked`);
    }

    // Only the locker or a DM can unlock (permission checked at handler level)
    await tx.characterLock.delete({
      where: { characterId_fieldPath: { characterId, fieldPath } },
    });

    // Record the unlock action
    await tx.characterChange.create({
      data: {
        characterId,
        fieldPath,
        oldValue: { locked: true },
        newValue: { locked: false },
        changeType: ChangeType.DM_UNLOCK,
        authorId: userId,
      },
    });

    // Check for conflicts after unlocking
    const draft = await tx.characterDraft.findUnique({ where: { characterId } });
    const conflicts = draft ? await detectConflicts(tx, characterId, draft.data as object, draft.data as object, []) : [];

    return { success: true, conflicts };
  });
}

/**
 * DM suggests a change
 */
export async function suggestChange(
  characterId: string,
  fieldPath: string,
  suggestedValue: Prisma.JsonValue,
  userId: string,
  note?: string
): Promise<SuggestChangeResult> {
  return await prisma.$transaction(async (tx) => {
    const draft = await tx.characterDraft.findUnique({ where: { characterId } });
    if (!draft) throw new Error('Draft not found');

    const oldValue = getValueAtPath(draft.data as object, fieldPath);

    const change = await tx.characterChange.create({
      data: {
        characterId,
        fieldPath,
        oldValue: toInputJson(oldValue as Prisma.JsonValue | null),
        newValue: toInputJson(suggestedValue),
        changeType: ChangeType.DM_SUGGESTION,
        authorId: userId,
        note,
      },
      include: {
        author: { select: { id: true, displayName: true } },
        resolvedBy: { select: { id: true, displayName: true } },
      },
    }) as unknown as CharacterChangeRecord;

    // Check for conflicts
    const conflicts = await detectConflicts(
      tx,
      characterId,
      draft.data as object,
      draft.data as object,
      []
    );

    return {
      change: {
        id: change.id,
        characterId: change.characterId,
        fieldPath: change.fieldPath,
        oldValue: change.oldValue,
        newValue: change.newValue,
        changeType: change.changeType,
        authorId: change.authorId,
        author: change.author,
        resolvedById: change.resolvedById,
        resolvedBy: change.resolvedBy,
        resolvedAt: change.resolvedAt,
        note: change.note,
        createdAt: change.createdAt,
      },
      conflicts,
    };
  });
}

/**
 * DM overrides a field value
 */
export async function overrideField(
  characterId: string,
  fieldPath: string,
  value: Prisma.JsonValue,
  userId: string,
  note?: string
): Promise<OverrideChangeResult> {
  return await prisma.$transaction(async (tx) => {
    const draft = await tx.characterDraft.findUnique({ where: { characterId } });
    if (!draft) throw new Error('Draft not found');

    const oldValue = getValueAtPath(draft.data as object, fieldPath);

    // Apply the override to draft data
    const newData = deepClone(draft.data as object);
    setValueAtPath(newData, fieldPath, value);

    // Validate the new data against game system schema
    const character = await tx.character.findUnique({ where: { id: characterId } });
    if (character?.gameSystem) {
      const validation = validateCharacterData(character.gameSystem, newData);
      if (!validation.success) {
        throw new Error(`Override would create invalid character data: ${validation.errors.issues.map(i => i.message).join(', ')}`);
      }
    }

    const change = await tx.characterChange.create({
      data: {
        characterId,
        fieldPath,
        oldValue: toInputJson(oldValue as Prisma.JsonValue | null),
        newValue: toInputJson(value),
        changeType: ChangeType.DM_OVERRIDE,
        authorId: userId,
        note,
      },
      include: {
        author: { select: { id: true, displayName: true } },
        resolvedBy: { select: { id: true, displayName: true } },
      },
    }) as unknown as CharacterChangeRecord;

    // Update draft
    await tx.characterDraft.update({
      where: { characterId },
      data: {
        data: toInputJson(newData as Prisma.JsonValue),
        version: { increment: 1 },
        lastEditedById: userId,
      },
    });

    // Check for conflicts
    const conflicts = await detectConflicts(tx, characterId, draft.data as object, newData, []);

    return {
      change: {
        id: change.id,
        characterId: change.characterId,
        fieldPath: change.fieldPath,
        oldValue: change.oldValue,
        newValue: change.newValue,
        changeType: change.changeType,
        authorId: change.authorId,
        author: change.author,
        resolvedById: change.resolvedById,
        resolvedBy: change.resolvedBy,
        resolvedAt: change.resolvedAt,
        note: change.note,
        createdAt: change.createdAt,
      },
      conflicts,
    };
  });
}

/**
 * Resolve a conflict (player accepts/rejects/forces)
 */
export async function resolveConflict(
  characterId: string,
  conflictId: string,
  resolution: 'accept' | 'reject' | 'force',
  userId: string,
  note?: string
): Promise<ResolveConflictResult> {
  return await prisma.$transaction(async (tx) => {
    const conflict = await tx.characterConflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict || conflict.characterId !== characterId) {
      throw new Error('Conflict not found');
    }

    if (conflict.resolvedAt) {
      throw new Error('Conflict already resolved');
    }

    let change: CharacterChangeRecord | null = null;

    if (resolution === 'accept' || resolution === 'force') {
      // Apply the suggested/conflicting value
      const draft = await tx.characterDraft.findUnique({ where: { characterId } });
      if (!draft) throw new Error('Draft not found');

      // Find the suggestion change that caused this conflict
      const suggestionChange = await tx.characterChange.findFirst({
        where: {
          characterId,
          fieldPath: conflict.fieldPath,
          changeType: ChangeType.DM_SUGGESTION,
          createdAt: { lte: conflict.detectedAt },
        },
        orderBy: { createdAt: 'desc' },
      });

      const valueToApply = resolution === 'force'
        ? suggestionChange?.newValue ?? getValueAtPath(draft.data as object, conflict.fieldPath)
        : suggestionChange?.newValue;

      if (valueToApply !== undefined) {
        const newData = deepClone(draft.data as object);
        setValueAtPath(newData, conflict.fieldPath, valueToApply);

        change = await tx.characterChange.create({
          data: {
            characterId,
            fieldPath: conflict.fieldPath,
            oldValue: toInputJson(getValueAtPath(draft.data as object, conflict.fieldPath) as Prisma.JsonValue | null),
            newValue: toInputJson(valueToApply as Prisma.JsonValue),
            changeType: ChangeType.CONFLICT_RESOLVED,
            authorId: userId,
            resolvedById: userId,
            resolvedAt: new Date(),
            note: note ?? `Conflict ${resolution}ed`,
          },
          include: {
            author: { select: { id: true, displayName: true } },
            resolvedBy: { select: { id: true, displayName: true } },
          },
        }) as unknown as CharacterChangeRecord;

        await tx.characterDraft.update({
          where: { characterId },
          data: {
            data: toInputJson(newData as Prisma.JsonValue),
            version: { increment: 1 },
            lastEditedById: userId,
          },
        });
      }
    }

    // Mark conflict as resolved
    const resolvedConflict = await tx.characterConflict.update({
      where: { id: conflictId },
      data: {
        resolvedAt: new Date(),
        resolvedById: userId,
        resolution: resolution === 'accept' ? 'Player accepted' : resolution === 'reject' ? 'Player rejected' : 'Player forced',
      },
      include: {
        resolvedBy: { select: { id: true, displayName: true } },
      },
    });

    // Check for remaining conflicts
    const draft = await tx.characterDraft.findUnique({ where: { characterId } });
    const conflicts = draft ? await detectConflicts(tx, characterId, draft.data as object, draft.data as object, []) : [];

    return {
      conflict: {
        id: resolvedConflict.id,
        characterId: resolvedConflict.characterId,
        fieldPath: resolvedConflict.fieldPath,
        conflictType: resolvedConflict.conflictType,
        description: resolvedConflict.description,
        severity: resolvedConflict.severity,
        detectedAt: resolvedConflict.detectedAt,
        resolvedAt: resolvedConflict.resolvedAt,
        resolvedById: resolvedConflict.resolvedById,
        resolvedBy: resolvedConflict.resolvedBy,
        resolution: resolvedConflict.resolution,
      },
      change: change ? {
        id: change.id,
        characterId: change.characterId,
        fieldPath: change.fieldPath,
        oldValue: change.oldValue,
        newValue: change.newValue,
        changeType: change.changeType,
        authorId: change.authorId,
        author: change.author,
        resolvedById: change.resolvedById,
        resolvedBy: change.resolvedBy,
        resolvedAt: change.resolvedAt,
        note: change.note,
        createdAt: change.createdAt,
      } : null,
      conflicts,
    };
  });
}

/**
 * Get change history for a character
 */
export async function getChangeHistory(
  characterId: string,
  limit = 100,
  offset = 0
): Promise<GetHistoryResult> {
  const [changes, total] = await Promise.all([
    prisma.characterChange.findMany({
      where: { characterId },
      include: {
        author: { select: { id: true, displayName: true } },
        resolvedBy: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.characterChange.count({ where: { characterId } }),
  ]);

  return {
    changes: changes.map((c) => ({
      id: c.id,
      characterId: c.characterId,
      fieldPath: c.fieldPath,
      oldValue: c.oldValue,
      newValue: c.newValue,
      changeType: c.changeType,
      authorId: c.authorId,
      author: c.author,
      resolvedById: c.resolvedById,
      resolvedBy: c.resolvedBy,
      resolvedAt: c.resolvedAt,
      note: c.note,
      createdAt: c.createdAt,
    })),
    total,
  };
}

/**
 * Get all locks for a character
 */
export async function getLocks(characterId: string): Promise<CharacterLockRecord[]> {
  const locks = await prisma.characterLock.findMany({
    where: { characterId },
    include: { lockedBy: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return locks.map((l) => ({
    id: l.id,
    characterId: l.characterId,
    fieldPath: l.fieldPath,
    lockedById: l.lockedById,
    lockedBy: l.lockedBy,
    reason: l.reason,
    createdAt: l.createdAt,
  }));
}

/**
 * Get all conflicts for a character
 */
export async function getConflicts(characterId: string, includeResolved = false): Promise<CharacterConflictRecord[]> {
  const conflicts = await prisma.characterConflict.findMany({
    where: {
      characterId,
      ...(includeResolved ? {} : { resolvedAt: null }),
    },
    include: {
      resolvedBy: { select: { id: true, displayName: true } },
    },
    orderBy: { detectedAt: 'desc' },
  });

  return conflicts.map((c) => ({
    id: c.id,
    characterId: c.characterId,
    fieldPath: c.fieldPath,
    conflictType: c.conflictType,
    description: c.description,
    severity: c.severity,
    detectedAt: c.detectedAt,
    resolvedAt: c.resolvedAt,
    resolvedById: c.resolvedById,
    resolvedBy: c.resolvedBy,
    resolution: c.resolution,
  }));
}

/**
 * Delete a draft (when character is deleted or unassigned)
 */
export async function deleteDraft(characterId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.characterLock.deleteMany({ where: { characterId } });
    await tx.characterConflict.deleteMany({ where: { characterId } });
    await tx.characterDraft.delete({ where: { characterId } });
  });
}

// ============================================
// Internal Helper Functions
// ============================================

/**
 * Detect conflicts by validating character data against game system rules
 */
async function detectConflicts(
  tx: Prisma.TransactionClient,
  characterId: string,
  oldData: object,
  newData: object,
  _patches: JsonPatch[]
): Promise<CharacterConflictRecord[]> {
  const character = await tx.character.findUnique({ where: { id: characterId } });
  if (!character?.gameSystem) return [];

  // Validate new data against schema
  const validation = validateCharacterData(character.gameSystem, newData);
  const conflicts: CharacterConflictRecord[] = [];

  if (!validation.success) {
    for (const issue of validation.errors.issues) {
      const fieldPath = issue.path.join('.');
      const conflictType = mapZodIssueToConflictType(issue);
      const severity = mapZodIssueToSeverity(issue);

      // Check if conflict already exists
      const existing = await tx.characterConflict.findFirst({
        where: {
          characterId,
          fieldPath,
          conflictType,
          resolvedAt: null,
        },
      });

      if (!existing) {
        const conflict = await tx.characterConflict.create({
          data: {
            characterId,
            fieldPath,
            conflictType,
            description: issue.message,
            severity,
          },
          include: { resolvedBy: { select: { id: true, displayName: true } } },
        });

        conflicts.push({
          id: conflict.id,
          characterId: conflict.characterId,
          fieldPath: conflict.fieldPath,
          conflictType: conflict.conflictType,
          description: conflict.description,
          severity: conflict.severity,
          detectedAt: conflict.detectedAt,
          resolvedAt: conflict.resolvedAt,
          resolvedById: conflict.resolvedById,
          resolvedBy: conflict.resolvedBy,
          resolution: conflict.resolution,
        });
      }
    }
  }

  // Check for specific game system rule violations
  const systemConflicts = await detectSystemSpecificConflicts(
    tx,
    characterId,
    character.gameSystem,
    oldData,
    newData
  );
  conflicts.push(...systemConflicts);

  return conflicts;
}

/**
 * Detect system-specific conflicts (prerequisites, limits, etc.)
 */
async function detectSystemSpecificConflicts(
  tx: Prisma.TransactionClient,
  characterId: string,
  gameSystem: GameSystem,
  _oldData: object,
  newData: object
): Promise<CharacterConflictRecord[]> {
  const conflicts: CharacterConflictRecord[] = [];

  // D&D 5e specific checks
  if (gameSystem === 'DND_5E') {
    conflicts.push(...await detectDnD5eConflicts(tx, characterId, newData));
  }

  // Pathfinder 2e specific checks
  if (gameSystem === 'PATHFINDER_2E') {
    conflicts.push(...await detectPf2eConflicts(tx, characterId, newData));
  }

  return conflicts;
}

/**
 * D&D 5e conflict detection
 */
async function detectDnD5eConflicts(
  tx: Prisma.TransactionClient,
  characterId: string,
  data: object
): Promise<CharacterConflictRecord[]> {
  const conflicts: CharacterConflictRecord[] = [];
  const d = asRecord(data);

  // Check feat prerequisites
  if (d.feats && Array.isArray(d.feats)) {
    for (const feat of asRecords(d.feats)) {
      if (feat.prerequisites && typeof feat.prerequisites === 'string') {
        const prereqs = parsePrerequisites(feat.prerequisites);
        for (const prereq of prereqs) {
          const value = getValueAtPath(data, prereq.path);
          if (!meetsPrerequisite(value, prereq)) {
            const existing = await tx.characterConflict.findFirst({
              where: { characterId, fieldPath: `feats[${d.feats.indexOf(feat)}]`, conflictType: ConflictType.MISSING_PREREQUISITE, resolvedAt: null },
            });
            if (!existing) {
              const conflict = await tx.characterConflict.create({
                data: {
                  characterId,
                  fieldPath: `feats[${d.feats.indexOf(feat)}]`,
                  conflictType: ConflictType.MISSING_PREREQUISITE,
                  description: `Feat "${feat.name}" requires ${prereq.description}`,
                  severity: ConflictSeverity.WARNING,
                },
                include: { resolvedBy: { select: { id: true, displayName: true } } },
              });
              conflicts.push(mapConflict(conflict));
            }
          }
        }
      }
    }
  }

  // Check spell slots don't exceed limits
  if (isRecord(d.spellSlots)) {
    for (const [level, slots] of Object.entries(d.spellSlots)) {
      if (isRecord(slots)) {
        if (typeof slots.total === 'number' && slots.total > 20) {
          const existing = await tx.characterConflict.findFirst({
            where: { characterId, fieldPath: `spellSlots.${level}.total`, conflictType: ConflictType.EXCEEDS_LIMIT, resolvedAt: null },
          });
          if (!existing) {
            const conflict = await tx.characterConflict.create({
              data: {
                characterId,
                fieldPath: `spellSlots.${level}.total`,
                conflictType: ConflictType.EXCEEDS_LIMIT,
                description: `Spell slots for level ${level} cannot exceed 20`,
                severity: ConflictSeverity.ERROR,
              },
              include: { resolvedBy: { select: { id: true, displayName: true } } },
            });
            conflicts.push(mapConflict(conflict));
          }
        }
      }
    }
  }

  // Check ability scores don't exceed 30 (without magical effects)
  if (isRecord(d.stats)) {
    for (const [ability, value] of Object.entries(d.stats)) {
      if (isRecord(value)) {
        if (typeof value.score === 'number' && value.score > 30) {
          const existing = await tx.characterConflict.findFirst({
            where: { characterId, fieldPath: `stats.${ability}.score`, conflictType: ConflictType.EXCEEDS_LIMIT, resolvedAt: null },
          });
          if (!existing) {
            const conflict = await tx.characterConflict.create({
              data: {
                characterId,
                fieldPath: `stats.${ability}.score`,
                conflictType: ConflictType.EXCEEDS_LIMIT,
                description: `${ability} score cannot exceed 30 without magical effects`,
                severity: ConflictSeverity.WARNING,
              },
              include: { resolvedBy: { select: { id: true, displayName: true } } },
            });
            conflicts.push(mapConflict(conflict));
          }
        }
      }
    }
  }

  // Check attunement slots (max 3)
  if (d.inventory && Array.isArray(d.inventory)) {
    const attunedItems = asRecords(d.inventory).filter((item) => item.attuned === true).length;
    if (attunedItems > 3) {
      const existing = await tx.characterConflict.findFirst({
        where: { characterId, fieldPath: 'inventory', conflictType: ConflictType.EXCEEDS_LIMIT, resolvedAt: null },
      });
      if (!existing) {
        const conflict = await tx.characterConflict.create({
          data: {
            characterId,
            fieldPath: 'inventory',
            conflictType: ConflictType.EXCEEDS_LIMIT,
            description: `Character has ${attunedItems} attuned items (maximum is 3)`,
            severity: ConflictSeverity.ERROR,
          },
          include: { resolvedBy: { select: { id: true, displayName: true } } },
        });
        conflicts.push(mapConflict(conflict));
      }
    }
  }

  return conflicts;
}

/**
 * Pathfinder 2e conflict detection
 */
async function detectPf2eConflicts(
  tx: Prisma.TransactionClient,
  characterId: string,
  data: object
): Promise<CharacterConflictRecord[]> {
  const conflicts: CharacterConflictRecord[] = [];
  const d = asRecord(data);

  // Check proficiency ranks are valid for level
  // (simplified - full implementation would need level)
  if (d.skills && Array.isArray(d.skills)) {
    const skills = asRecords(d.skills);
    for (const [index, skill] of skills.entries()) {
      if (typeof skill.proficiency === 'string' && !['untrained', 'trained', 'expert', 'master', 'legendary'].includes(skill.proficiency)) {
        const existing = await tx.characterConflict.findFirst({
          where: { characterId, fieldPath: `skills[${index}].proficiency`, conflictType: ConflictType.INVALID_VALUE, resolvedAt: null },
        });
        if (!existing) {
          const conflict = await tx.characterConflict.create({
            data: {
              characterId,
              fieldPath: `skills[${index}].proficiency`,
              conflictType: ConflictType.INVALID_VALUE,
              description: `Invalid proficiency rank: ${skill.proficiency}`,
              severity: ConflictSeverity.ERROR,
            },
            include: { resolvedBy: { select: { id: true, displayName: true } } },
          });
          conflicts.push(mapConflict(conflict));
        }
      }
    }
  }

  return conflicts;
}

type Prerequisite = { path: string; operator: '>='; value: number; description: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: object): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function parsePrerequisites(prereqString: string): Prerequisite[] {
  // Simple prerequisite parser - in reality this would be more complex
  // Format: "Strength 13" or "Dexterity 15, Constitution 13"
  const prereqs: Prerequisite[] = [];
  const parts = prereqString.split(',').map(p => p.trim());

  for (const part of parts) {
    const match = part.match(/^(\w+)\s+(\d+)$/);
    if (match) {
      const ability = match[1].toLowerCase();
      const value = parseInt(match[2], 10);
      prereqs.push({
        path: `stats.${ability}.score`,
        operator: '>=',
        value,
        description: `${match[1]} ${value}`,
      });
    }
  }
  return prereqs;
}

function meetsPrerequisite(value: unknown, prereq: Prerequisite): boolean {
  if (typeof value !== 'number') return false;
  switch (prereq.operator) {
    case '>=': return value >= prereq.value;
    default: return false;
  }
}

function mapZodIssueToConflictType(issue: ZodIssue): ConflictType {
  if (issue.code === 'too_big' || issue.code === 'too_small') return ConflictType.EXCEEDS_LIMIT;
  if (issue.code === 'invalid_type') return ConflictType.INVALID_VALUE;
  if (issue.code === 'custom' && issue.message.includes('prerequisite')) return ConflictType.MISSING_PREREQUISITE;
  return ConflictType.RULE_VIOLATION;
}

function mapZodIssueToSeverity(issue: ZodIssue): ConflictSeverity {
  if (issue.code === 'too_big' || issue.code === 'too_small') return ConflictSeverity.ERROR;
  if (issue.code === 'invalid_type') return ConflictSeverity.ERROR;
  return ConflictSeverity.WARNING;
}

function mapConflict(c: Prisma.CharacterConflictGetPayload<{ include: { resolvedBy: { select: { id: true; displayName: true } } } }>): CharacterConflictRecord {
  return {
    id: c.id,
    characterId: c.characterId,
    fieldPath: c.fieldPath,
    conflictType: c.conflictType,
    description: c.description,
    severity: c.severity,
    detectedAt: c.detectedAt,
    resolvedAt: c.resolvedAt,
    resolvedById: c.resolvedById,
    resolvedBy: c.resolvedBy,
    resolution: c.resolution,
  };
}

function getValueAtPath(obj: object, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    // Handle array indices like "feats[2]"
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const prop = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      const array = isRecord(current) ? current[prop] : undefined;
      current = Array.isArray(array) ? array[index] : undefined;
    } else {
      current = isRecord(current) ? current[key] : undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

function setValueAtPath(obj: object, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const prop = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      if (!Array.isArray(current[prop])) current[prop] = [];
      const array = current[prop] as unknown[];
      if (!isRecord(array[index])) array[index] = {};
      current = array[index] as Record<string, unknown>;
    } else {
      if (!isRecord(current[key])) current[key] = {};
      current = current[key] as Record<string, unknown>;
    }
  }
  const lastKey = keys[keys.length - 1];
  const arrayMatch = lastKey.match(/^(\w+)\[(\d+)\]$/);
  if (arrayMatch) {
    const prop = arrayMatch[1];
    const index = parseInt(arrayMatch[2], 10);
    if (!Array.isArray(current[prop])) current[prop] = [];
    (current[prop] as unknown[])[index] = value;
  } else {
    current[lastKey] = value;
  }
}
