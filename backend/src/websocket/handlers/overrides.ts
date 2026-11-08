/**
 * WebSocket Handlers for Universal DM Overrides
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
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
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can issue game mechanics overrides.' });
        return;
      }

      const override = await overrideService.recordOverride({
        ...data,
        overriddenById: socket.userId!,
      });

      // Fan out based on visibility
      if (override.visibility === OverrideVisibility.TABLE) {
        io.to(`campaign:${data.campaignId}`).emit('override:applied', override);
      } else if (override.visibility === OverrideVisibility.DM_AND_PLAYERS) {
        io.to(`campaign:${data.campaignId}`).emit('override:applied', override);
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
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can revert overrides.' });
        return;
      }

      const reverted = await overrideService.revertOverride({
        ...data,
        revertedById: socket.userId!,
      });

      // Broadcast revert
      if (reverted.visibility === OverrideVisibility.DM_ONLY) {
        socket.emit('override:reverted', reverted);
      } else {
        io.to(`campaign:${reverted.campaignId}`).emit('override:reverted', reverted);
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
    async (data: { campaignId: string; targetType: OverrideTargetType; targetId: string }) => {
      try {
        const history = await overrideService.getOverrideHistory(
          data.campaignId,
          data.targetType,
          data.targetId
        );
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
