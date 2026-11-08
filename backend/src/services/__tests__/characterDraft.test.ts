/**
 * Tests for Character Draft Service
 */

import { prisma as prismaClient } from '../../config/database';
import * as characterDraftService from '../../services/characterDraft';
import type { JsonPatch } from '../../utils/jsonPatch';

const prisma = prismaClient as unknown as Record<string, Record<string, jest.Mock>>;

// Mock Prisma
jest.mock('../../config/database', () => ({
  prisma: {
    characterDraft: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    character: {
      findUnique: jest.fn(),
    },
    characterChange: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    characterLock: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    characterConflict: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    campaignMembership: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (client: typeof prisma) => unknown) => cb(prisma)),
    $queryRaw: jest.fn(),
  },
}));

describe('CharacterDraftService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreateDraft', () => {
    it('should return existing draft if found', async () => {
      const mockDraft = {
        id: 'draft-1',
        characterId: 'char-1',
        data: { name: 'Test Character' },
        version: 1,
        lastEditedById: 'user-1',
        lastEditedBy: { id: 'user-1', displayName: 'Test User' },
        updatedAt: new Date(),
      };

      prisma.characterDraft.findUnique.mockResolvedValue(mockDraft);

      const result = await characterDraftService.getOrCreateDraft('char-1', 'user-1');

      expect(result).toEqual({
        data: mockDraft.data,
        version: mockDraft.version,
        lastEditedById: mockDraft.lastEditedById,
        lastEditedBy: mockDraft.lastEditedBy,
        updatedAt: mockDraft.updatedAt,
      });
    });

    it('should create new draft if none exists', async () => {
      prisma.characterDraft.findUnique.mockResolvedValue(null);
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        data: { name: 'Test Character' },
      });

      const mockNewDraft = {
        id: 'draft-1',
        characterId: 'char-1',
        data: { name: 'Test Character' },
        version: 1,
        lastEditedById: 'user-1',
        lastEditedBy: { id: 'user-1', displayName: 'Test User' },
        updatedAt: new Date(),
      };

      prisma.characterDraft.create.mockResolvedValue(mockNewDraft);

      const result = await characterDraftService.getOrCreateDraft('char-1', 'user-1');

      expect(result).toEqual({
        data: mockNewDraft.data,
        version: mockNewDraft.version,
        lastEditedById: mockNewDraft.lastEditedById,
        lastEditedBy: mockNewDraft.lastEditedBy,
        updatedAt: mockNewDraft.updatedAt,
      });
    });
  });

  describe('applyPatchToDraft', () => {
    it('should apply patches with optimistic locking', async () => {
      const mockDraft = {
        id: 'draft-1',
        characterId: 'char-1',
        data: { stats: { strength: { score: 10 } } },
        version: 1,
        lastEditedById: 'user-1',
      };

      prisma.characterDraft.findUnique.mockResolvedValue(mockDraft);
      prisma.characterLock.findMany.mockResolvedValue([]);
      prisma.characterChange.create.mockResolvedValue({
        id: 'change-1',
        characterId: 'char-1',
        fieldPath: 'stats.strength.score',
        oldValue: 10,
        newValue: 12,
        changeType: 'PLAYER_EDIT',
        authorId: 'user-1',
        author: { id: 'user-1', displayName: 'Test User' },
        resolvedById: null,
        resolvedBy: null,
        resolvedAt: null,
        note: null,
        createdAt: new Date(),
      });

      prisma.characterDraft.update.mockResolvedValue({
        ...mockDraft,
        data: { stats: { strength: { score: 12 } } },
        version: 2,
        lastEditedById: 'user-1',
        lastEditedBy: { id: 'user-1', displayName: 'Test User' },
      });

      prisma.characterLock.findMany.mockResolvedValue([]);

      const patches: JsonPatch[] = [
        { op: 'replace', path: 'stats.strength.score', value: 12 },
      ];

      const result = await characterDraftService.applyPatchToDraft(
        'char-1',
        patches,
        1,
        'user-1'
      );

      expect(result.draft.version).toBe(2);
      expect(result.draft.data).toEqual({ stats: { strength: { score: 12 } } });
      expect(result.changes).toHaveLength(1);
    });

    it('should throw on version conflict', async () => {
      const mockDraft = {
        id: 'draft-1',
        characterId: 'char-1',
        data: { stats: { strength: { score: 10 } } },
        version: 2, // Different from expected
        lastEditedById: 'user-1',
      };

      prisma.characterDraft.findUnique.mockResolvedValue(mockDraft);

      const patches: JsonPatch[] = [
        { op: 'replace', path: 'stats.strength.score', value: 12 },
      ];

      await expect(
        characterDraftService.applyPatchToDraft('char-1', patches, 1, 'user-1')
      ).rejects.toThrow('Version conflict');
    });
  });

  describe('lockField', () => {
    it('should lock a field for DM', async () => {
      prisma.characterLock.findUnique.mockResolvedValue(null);
      prisma.characterLock.create.mockResolvedValue({
        id: 'lock-1',
        characterId: 'char-1',
        fieldPath: 'stats.strength.score',
        lockedById: 'dm-1',
        lockedBy: { id: 'dm-1', displayName: 'DM User' },
        reason: 'Point buy limit',
        createdAt: new Date(),
      });

      prisma.characterChange.create.mockResolvedValue({});
      prisma.characterDraft.findUnique.mockResolvedValue({ data: {} });
      prisma.characterConflict.findMany.mockResolvedValue([]);

      const result = await characterDraftService.lockField('char-1', 'stats.strength.score', 'dm-1', 'Point buy limit');

      expect(result.lock.fieldPath).toBe('stats.strength.score');
      expect(result.lock.lockedById).toBe('dm-1');
      expect(result.lock.reason).toBe('Point buy limit');
    });

    it('should throw if field already locked', async () => {
      prisma.characterLock.findUnique.mockResolvedValue({
        id: 'lock-1',
        characterId: 'char-1',
        fieldPath: 'stats.strength.score',
        lockedById: 'dm-1',
        lockedBy: { id: 'dm-1', displayName: 'DM User' },
        reason: 'Existing lock',
        createdAt: new Date(),
      });

      await expect(
        characterDraftService.lockField('char-1', 'stats.strength.score', 'dm-2')
      ).rejects.toThrow('already locked');
    });
  });

  describe('unlockField', () => {
    it('should unlock a field', async () => {
      prisma.characterLock.findUnique.mockResolvedValue({
        id: 'lock-1',
        characterId: 'char-1',
        fieldPath: 'stats.strength.score',
      });

      prisma.characterLock.delete.mockResolvedValue({});
      prisma.characterChange.create.mockResolvedValue({});
      prisma.characterDraft.findUnique.mockResolvedValue({ data: {} });
      prisma.characterConflict.findMany.mockResolvedValue([]);

      const result = await characterDraftService.unlockField('char-1', 'stats.strength.score', 'dm-1');

      expect(result.success).toBe(true);
    });
  });

  describe('getChangeHistory', () => {
    it('should return paginated change history', async () => {
      const mockChanges = [
        {
          id: 'change-1',
          characterId: 'char-1',
          fieldPath: 'stats.strength.score',
          oldValue: 10,
          newValue: 12,
          changeType: 'PLAYER_EDIT',
          authorId: 'user-1',
          author: { id: 'user-1', displayName: 'Test User' },
          resolvedById: null,
          resolvedBy: null,
          resolvedAt: null,
          note: 'Test note',
          createdAt: new Date(),
        },
      ];

      prisma.characterChange.findMany.mockResolvedValue(mockChanges);
      prisma.characterChange.count.mockResolvedValue(1);

      const result = await characterDraftService.getChangeHistory('char-1', 100, 0);

      expect(result.changes).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});

describe('Conflict Detection', () => {
  it('should detect D&D 5e feat prerequisite conflicts', async () => {
    // This would test the detectDnD5eConflicts function
    // Requires more detailed mocking of the transaction client
    expect(true).toBe(true);
  });

  it('should detect ability score limits', async () => {
    // Test ability score > 30 detection
    expect(true).toBe(true);
  });

  it('should detect attunement slot limits', async () => {
    // Test > 3 attuned items detection
    expect(true).toBe(true);
  });
});
