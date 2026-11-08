// ============================================
// Character Draft Collaboration Handlers
// Real-time collaborative character editing with conflict resolution
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { withinCeiling, stateRequestAllowed } from '../shared';
import type { JsonPatch } from '../../utils/jsonPatch';
import {
  getOrCreateDraft,
  applyPatchToDraft,
  lockField,
  unlockField,
  suggestChange,
  overrideField,
  resolveConflict,
  getChangeHistory,
  getLocks,
  getConflicts,
  ChangeType,
} from '../../services/characterDraft';

interface JoinDraftData {
  characterId: string;
}

interface LeaveDraftData {
  characterId: string;
}

interface PatchDraftData {
  characterId: string;
  patches: JsonPatch[];
  version: number;
  note?: string;
}

interface LockFieldData {
  characterId: string;
  fieldPath: string;
  reason?: string;
}

interface UnlockFieldData {
  characterId: string;
  fieldPath: string;
}

interface SuggestChangeData {
  characterId: string;
  fieldPath: string;
  suggestedValue: unknown;
  note?: string;
}

interface OverrideFieldData {
  characterId: string;
  fieldPath: string;
  value: unknown;
  note?: string;
}

interface ResolveConflictData {
  characterId: string;
  conflictId: string;
  resolution: 'accept' | 'reject' | 'force';
  note?: string;
}

interface GetHistoryData {
  characterId: string;
  limit?: number;
  offset?: number;
}

interface DraftPresence {
  userId: string;
  displayName: string;
  fieldPath?: string; // Currently editing this field
  cursorPosition?: { x: number; y: number };
  lastActive: number;
}

const draftPresence = new Map<string, Map<string, DraftPresence>>(); // characterId -> userId -> presence
const PRESENCE_TIMEOUT = 30000; // 30 seconds
const PRESENCE_CLEANUP_INTERVAL = 10000; // 10 seconds

function getDraftRoom(characterId: string): string {
  return `character:draft:${characterId}`;
}

function getPresenceMap(characterId: string): Map<string, DraftPresence> {
  let map = draftPresence.get(characterId);
  if (!map) {
    map = new Map();
    draftPresence.set(characterId, map);
  }
  return map;
}

function broadcastPresenceUpdate(io: Server, characterId: string, _excludeSocketId?: string): void {
  const presenceMap = getPresenceMap(characterId);
  const presences = Array.from(presenceMap.entries())
    .filter(([_, p]) => Date.now() - p.lastActive < PRESENCE_TIMEOUT)
    .map(([_userId, p]) => p);

  io.to(getDraftRoom(characterId)).emit('character:draft:presence', {
    characterId,
    presences,
  });
}

function cleanupPresence(characterId: string): void {
  const presenceMap = draftPresence.get(characterId);
  if (!presenceMap) return;

  const now = Date.now();
  for (const [userId, presence] of presenceMap.entries()) {
    if (now - presence.lastActive > PRESENCE_TIMEOUT) {
      presenceMap.delete(userId);
    }
  }

  if (presenceMap.size === 0) {
    draftPresence.delete(characterId);
  }
}

setInterval(() => {
  for (const characterId of draftPresence.keys()) {
    cleanupPresence(characterId);
  }
}, PRESENCE_CLEANUP_INTERVAL).unref();

export function registerCharacterDraftHandlers(io: Server, socket: AuthenticatedSocket): void {
  const userId = socket.userId!;
  const displayName = socket.userId ?? 'Unknown';

  /**
   * CHARACTER:DRAFT:JOIN - User joins a character draft editing session
   */
  socket.on('character:draft:join', async (data: JoinDraftData) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!withinCeiling(socket, 'character:draft:join')) return;

      const { characterId } = data;
      if (!characterId) {
        socket.emit('error', { message: 'characterId is required' });
        return;
      }

      // Verify character exists and user has access
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: { campaign: { select: { id: true } } },
      });

      if (!character) {
        socket.emit('error', { message: 'Character not found' });
        return;
      }

      if (character.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Character is not in this campaign' });
        return;
      }

      // Check if user can view this character (owner, DM, or campaign member)
      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: socket.campaignId } },
      });

      if (!membership) {
        socket.emit('error', { message: 'You are not a member of this campaign' });
        return;
      }

      // Owner, DM, or player can view
      const canView = character.userId === userId || membership.role === 'DM' || membership.role === 'PLAYER';
      if (!canView) {
        socket.emit('error', { message: 'You do not have permission to view this character' });
        return;
      }

      // Join the draft room
      socket.join(getDraftRoom(characterId));

      // Initialize presence
      const presenceMap = getPresenceMap(characterId);
      presenceMap.set(userId, {
        userId,
        displayName,
        lastActive: Date.now(),
      });

      // Get or create draft
      const draft = await getOrCreateDraft(characterId, userId);

      // Get locks and conflicts
      const [locks, conflicts] = await Promise.all([
        getLocks(characterId),
        getConflicts(characterId),
      ]);

      // Send current state to joining user
      socket.emit('character:draft:state', {
        characterId,
        draft,
        locks,
        conflicts,
        version: draft.version,
      });

      // Broadcast presence update to others
      broadcastPresenceUpdate(io, characterId);

      logger.debug('character:draft:join', { characterId, userId });
    } catch (error) {
      logger.error('character:draft:join failed', { err: error, userId });
      socket.emit('error', { message: 'Failed to join character draft' });
    }
  });

  /**
   * CHARACTER:DRAFT:LEAVE - User leaves a character draft editing session
   */
  socket.on('character:draft:leave', async (data: LeaveDraftData) => {
    try {
      const { characterId } = data;
      if (!characterId) return;

      socket.leave(getDraftRoom(characterId));

      // Remove presence
      const presenceMap = getPresenceMap(characterId);
      presenceMap.delete(userId);

      // Broadcast presence update
      broadcastPresenceUpdate(io, characterId);

      logger.debug('character:draft:leave', { characterId, userId });
    } catch (error) {
      logger.error('character:draft:leave failed', { err: error, userId });
    }
  });

  // Clean up presence on disconnect
  socket.on('disconnect', () => {
    for (const [characterId, presenceMap] of draftPresence.entries()) {
      if (presenceMap.has(userId)) {
        presenceMap.delete(userId);
        broadcastPresenceUpdate(io, characterId);
      }
    }
  });

  /**
   * CHARACTER:DRAFT:PATCH - Apply JSON Patch to draft (real-time sync)
   */
  socket.on('character:draft:patch', async (data: PatchDraftData) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!withinCeiling(socket, 'character:draft:patch')) return;

      const { characterId, patches, version, note } = data;
      if (!characterId || !Array.isArray(patches) || typeof version !== 'number') {
        socket.emit('error', { message: 'Invalid patch data' });
        return;
      }

      // Verify character is in this campaign
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { campaignId: true, userId: true, gameSystem: true },
      });

      if (!character || character.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Character not found in this campaign' });
        return;
      }

      // Check permissions: owner or DM can edit
      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: socket.campaignId } },
      });

      const isOwner = character.userId === userId;
      const isDM = membership?.role === 'DM';
      const canEdit = isOwner || isDM;

      if (!canEdit) {
        socket.emit('error', { message: 'You do not have permission to edit this character' });
        return;
      }

      // Apply patch
      const changeType = isDM ? ChangeType.DM_OVERRIDE : ChangeType.PLAYER_EDIT;
      const result = await applyPatchToDraft(characterId, patches, version, userId, changeType, note);

      // Broadcast to all in draft room
      io.to(getDraftRoom(characterId)).emit('character:draft:patched', {
        characterId,
        patches,
        version: result.draft.version,
        changes: result.changes,
        conflicts: result.conflicts,
        locks: result.locks,
        authorId: userId,
        authorName: displayName,
      });

      // Update presence
      const presenceMap = getPresenceMap(characterId);
      const presence = presenceMap.get(userId);
      if (presence) {
        presence.lastActive = Date.now();
        if (patches.length > 0) {
          presence.fieldPath = patches[0].path;
        }
      }
      broadcastPresenceUpdate(io, characterId);

      logger.debug('character:draft:patch', { characterId, userId, patchesCount: patches.length });
    } catch (error) {
      logger.error('character:draft:patch failed', { err: error, userId });
      const message = error instanceof Error ? error.message : 'Failed to apply patch';
      socket.emit('error', { message });
    }
  });

  /**
   * CHARACTER:DRAFT:LOCK - DM locks a field
   */
  socket.on('character:draft:lock', async (data: LockFieldData) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!withinCeiling(socket, 'character:draft:lock')) return;

      const { characterId, fieldPath, reason } = data;
      if (!characterId || !fieldPath) {
        socket.emit('error', { message: 'characterId and fieldPath are required' });
        return;
      }

      // Verify character and DM permission
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { campaignId: true },
      });

      if (!character || character.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Character not found in this campaign' });
        return;
      }

      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: socket.campaignId } },
      });

      if (membership?.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can lock fields' });
        return;
      }

      const result = await lockField(characterId, fieldPath, userId, reason);

      // Broadcast to all in draft room
      io.to(getDraftRoom(characterId)).emit('character:draft:locked', {
        characterId,
        lock: result.lock,
        conflicts: result.conflicts,
        lockedBy: userId,
        lockedByName: displayName,
      });

      logger.debug('character:draft:lock', { characterId, fieldPath, userId });
    } catch (error) {
      logger.error('character:draft:lock failed', { err: error, userId });
      const message = error instanceof Error ? error.message : 'Failed to lock field';
      socket.emit('error', { message });
    }
  });

  /**
   * CHARACTER:DRAFT:UNLOCK - DM unlocks a field
   */
  socket.on('character:draft:unlock', async (data: UnlockFieldData) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!withinCeiling(socket, 'character:draft:unlock')) return;

      const { characterId, fieldPath } = data;
      if (!characterId || !fieldPath) {
        socket.emit('error', { message: 'characterId and fieldPath are required' });
        return;
      }

      // Verify character and DM permission
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { campaignId: true },
      });

      if (!character || character.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Character not found in this campaign' });
        return;
      }

      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: socket.campaignId } },
      });

      if (membership?.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can unlock fields' });
        return;
      }

      const result = await unlockField(characterId, fieldPath, userId);

      // Broadcast to all in draft room
      io.to(getDraftRoom(characterId)).emit('character:draft:unlocked', {
        characterId,
        fieldPath,
        conflicts: result.conflicts,
        unlockedBy: userId,
        unlockedByName: displayName,
      });

      logger.debug('character:draft:unlock', { characterId, fieldPath, userId });
    } catch (error) {
      logger.error('character:draft:unlock failed', { err: error, userId });
      const message = error instanceof Error ? error.message : 'Failed to unlock field';
      socket.emit('error', { message });
    }
  });

  /**
   * CHARACTER:DRAFT:SUGGEST - DM suggests a change
   */
  socket.on('character:draft:suggest', async (data: SuggestChangeData) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!withinCeiling(socket, 'character:draft:suggest')) return;

      const { characterId, fieldPath, suggestedValue, note } = data;
      if (!characterId || !fieldPath) {
        socket.emit('error', { message: 'characterId and fieldPath are required' });
        return;
      }

      // Verify character and DM permission
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { campaignId: true },
      });

      if (!character || character.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Character not found in this campaign' });
        return;
      }

      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: socket.campaignId } },
      });

      if (membership?.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can suggest changes' });
        return;
      }

      const result = await suggestChange(characterId, fieldPath, suggestedValue as Prisma.JsonValue, userId, note);

      // Broadcast to all in draft room
      io.to(getDraftRoom(characterId)).emit('character:draft:suggested', {
        characterId,
        change: result.change,
        conflicts: result.conflicts,
        suggestedBy: userId,
        suggestedByName: displayName,
      });

      logger.debug('character:draft:suggest', { characterId, fieldPath, userId });
    } catch (error) {
      logger.error('character:draft:suggest failed', { err: error, userId });
      const message = error instanceof Error ? error.message : 'Failed to suggest change';
      socket.emit('error', { message });
    }
  });

  /**
   * CHARACTER:DRAFT:OVERRIDE - DM forces a change
   */
  socket.on('character:draft:override', async (data: OverrideFieldData) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!withinCeiling(socket, 'character:draft:override')) return;

      const { characterId, fieldPath, value, note } = data;
      if (!characterId || !fieldPath) {
        socket.emit('error', { message: 'characterId and fieldPath are required' });
        return;
      }

      // Verify character and DM permission
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { campaignId: true },
      });

      if (!character || character.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Character not found in this campaign' });
        return;
      }

      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: socket.campaignId } },
      });

      if (membership?.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can override fields' });
        return;
      }

      const result = await overrideField(characterId, fieldPath, value as Prisma.JsonValue, userId, note);

      // Broadcast to all in draft room
      io.to(getDraftRoom(characterId)).emit('character:draft:overridden', {
        characterId,
        change: result.change,
        conflicts: result.conflicts,
        overriddenBy: userId,
        overriddenByName: displayName,
      });

      logger.debug('character:draft:override', { characterId, fieldPath, userId });
    } catch (error) {
      logger.error('character:draft:override failed', { err: error, userId });
      const message = error instanceof Error ? error.message : 'Failed to override field';
      socket.emit('error', { message });
    }
  });

  /**
   * CHARACTER:DRAFT:RESOLVE - Player resolves a conflict
   */
  socket.on('character:draft:resolve', async (data: ResolveConflictData) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!withinCeiling(socket, 'character:draft:resolve')) return;

      const { characterId, conflictId, resolution, note } = data;
      if (!characterId || !conflictId || !resolution) {
        socket.emit('error', { message: 'characterId, conflictId, and resolution are required' });
        return;
      }

      // Verify character
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { campaignId: true, userId: true },
      });

      if (!character || character.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Character not found in this campaign' });
        return;
      }

      // Only character owner or DM can resolve conflicts
      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: socket.campaignId } },
      });

      const isOwner = character.userId === userId;
      const isDM = membership?.role === 'DM';

      if (!isOwner && !isDM) {
        socket.emit('error', { message: 'Only the character owner or DM can resolve conflicts' });
        return;
      }

      const result = await resolveConflict(characterId, conflictId, resolution, userId, note);

      // Broadcast to all in draft room
      io.to(getDraftRoom(characterId)).emit('character:draft:resolved', {
        characterId,
        conflict: result.conflict,
        change: result.change,
        conflicts: result.conflicts,
        resolvedBy: userId,
        resolvedByName: displayName,
        resolution,
      });

      logger.debug('character:draft:resolve', { characterId, conflictId, resolution, userId });
    } catch (error) {
      logger.error('character:draft:resolve failed', { err: error, userId });
      const message = error instanceof Error ? error.message : 'Failed to resolve conflict';
      socket.emit('error', { message });
    }
  });

  /**
   * CHARACTER:DRAFT:HISTORY - Get change history
   */
  socket.on('character:draft:history', async (data: GetHistoryData) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!stateRequestAllowed(socket, 'character:draft:history')) return;

      const { characterId, limit = 100, offset = 0 } = data;
      if (!characterId) {
        socket.emit('error', { message: 'characterId is required' });
        return;
      }

      // Verify character
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { campaignId: true },
      });

      if (!character || character.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Character not found in this campaign' });
        return;
      }

      // Check permission to view history
      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: socket.campaignId } },
      });

      if (!membership) {
        socket.emit('error', { message: 'You are not a member of this campaign' });
        return;
      }

      const result = await getChangeHistory(characterId, limit, offset);

      socket.emit('character:draft:history', {
        characterId,
        changes: result.changes,
        total: result.total,
        limit,
        offset,
      });
    } catch (error) {
      logger.error('character:draft:history failed', { err: error, userId });
      socket.emit('error', { message: 'Failed to get history' });
    }
  });

  /**
   * CHARACTER:DRAFT:CURSOR - Update cursor position for presence
   */
  socket.on('character:draft:cursor', (data: { characterId: string; fieldPath?: string; position?: { x: number; y: number } }) => {
    const { characterId, fieldPath, position } = data;
    if (!characterId) return;

    const presenceMap = getPresenceMap(characterId);
    const presence = presenceMap.get(userId);
    if (presence) {
      presence.lastActive = Date.now();
      if (fieldPath) presence.fieldPath = fieldPath;
      if (position) presence.cursorPosition = position;
    }

    // Broadcast cursor update to others in room (throttled)
    socket.to(getDraftRoom(characterId)).emit('character:draft:cursor', {
      characterId,
      userId,
      userName: displayName,
      fieldPath,
      position,
    });
  });
}

// Re-export for use in events.ts
export { registerCharacterDraftHandlers as default };
