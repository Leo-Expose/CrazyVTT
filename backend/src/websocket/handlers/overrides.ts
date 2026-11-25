/**
 * WebSocket Handlers for Universal DM Overrides
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { withinCeiling, stateRequestAllowed } from '../shared';
import {
  overrideService,
  type RecordOverrideInput,
  type RevertOverrideInput,
} from '../../services/overrideService';
import { OverrideVisibility, type OverrideTargetType } from '@prisma/client';
import logger from '../../utils/logger';

export function registerOverrideHandlers(io: Server, socket: AuthenticatedSocket) {
  // DM issues an override
  socket.on('override:issue', async (data: RecordOverrideInput) => {
    try {
      if (!socket.campaignId || !socket.userId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'override:issue')) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can issue game mechanics overrides.' });
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        socket.emit('error', { message: 'Invalid override payload.' });
        return;
      }
      if (data.campaignId && data.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Cannot issue override for another campaign.' });
        return;
      }

      const override = await overrideService.recordOverride({
        ...data,
        campaignId: socket.campaignId,
        overriddenById: socket.userId,
      });

      // Fan out based on visibility (sockets join room by campaignId)
      if (override.visibility === OverrideVisibility.TABLE || override.visibility === OverrideVisibility.DM_AND_PLAYERS) {
        io.to(socket.campaignId).emit('override:applied', override);
      } else {
        // DM ONLY: emit to sender only
        socket.emit('override:applied', override);
      }

      logger.info(`[Override] Override issued for ${data.targetType} on ${data.targetId}`, {
        overrideId: override.id,
      });
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('[Override] Failed to issue override', { message: error.message });
      socket.emit('error', { message: error.message || 'Failed to issue override.' });
    }
  });

  // DM reverts an override
  socket.on('override:revert', async (data: RevertOverrideInput) => {
    try {
      if (!socket.campaignId || !socket.userId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'override:revert')) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can revert overrides.' });
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || !data.overrideId) {
        socket.emit('error', { message: 'overrideId is required.' });
        return;
      }

      const reverted = await overrideService.revertOverride({
        ...data,
        campaignId: socket.campaignId,
        revertedById: socket.userId,
      });

      // Broadcast revert
      if (reverted.visibility === OverrideVisibility.DM_ONLY) {
        socket.emit('override:reverted', reverted);
      } else {
        io.to(socket.campaignId).emit('override:reverted', reverted);
      }

      logger.info(`[Override] Override reverted: ${reverted.id}`);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('[Override] Failed to revert override', { message: error.message });
      socket.emit('error', { message: error.message || 'Failed to revert override.' });
    }
  });

  // Request override history for target
  socket.on(
    'override:history',
    async (data: { campaignId?: string; targetType: OverrideTargetType; targetId: string }) => {
      try {
        if (!socket.campaignId || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated to a campaign' });
          return;
        }
        if (!stateRequestAllowed(socket, 'override:history')) return;
        if (!data || typeof data !== 'object' || Array.isArray(data) || !data.targetType || !data.targetId) {
          socket.emit('error', { message: 'targetType and targetId are required.' });
          return;
        }
        if (data.campaignId && data.campaignId !== socket.campaignId) {
          socket.emit('error', { message: 'Cannot access override history for another campaign.' });
          return;
        }

        const rawHistory = await overrideService.getOverrideHistory(
          socket.campaignId,
          data.targetType,
          data.targetId
        );
        const history = socket.role === 'DM'
          ? rawHistory
          : rawHistory.filter((entry) => entry.visibility !== OverrideVisibility.DM_ONLY);

        socket.emit('override:history:response', {
          targetId: data.targetId,
          targetType: data.targetType,
          history,
        });
      } catch (err: unknown) {
        const error = err as Error;
        logger.error('[Override] Failed to fetch override history', { message: error.message });
        socket.emit('error', { message: 'Failed to fetch override history.' });
      }
    }
  );
}
