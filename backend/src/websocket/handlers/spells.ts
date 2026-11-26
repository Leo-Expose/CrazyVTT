/**
 * WebSocket Handlers for Spell Casting and AoE Templates
 */

import { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../auth';
import { withinCeiling } from '../shared';
import { evaluateSpellAoE, type SpellCastResolutionInput } from '../../services/spellResolution';
import logger from '../../utils/logger';

export function registerSpellHandlers(io: Server, socket: AuthenticatedSocket) {
  // Player or DM initiates a spell cast with an AoE template
  socket.on('spell:cast', (data: SpellCastResolutionInput) => {
    if (!socket.campaignId || !socket.userId) {
      socket.emit('error', { message: 'Not authenticated to a campaign' });
      return;
    }
    if (!withinCeiling(socket, 'spell:cast')) return;
    if (socket.role === 'SPECTATOR') {
      socket.emit('error', { message: 'Spectators cannot cast spells' });
      return;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !data.castId || !data.spellName || !data.origin || !Array.isArray(data.tokens)) {
      socket.emit('error', { message: 'Invalid spell cast payload' });
      return;
    }
    if (data.campaignId && data.campaignId !== socket.campaignId) {
      socket.emit('error', { message: 'Cannot cast spells in another campaign' });
      return;
    }
    try {
      const evaluation = evaluateSpellAoE({ ...data, campaignId: socket.campaignId });

      // Broadcast review prompt to campaign room
      io.to(socket.campaignId).emit('spell:review', {
        castId: data.castId,
        campaignId: socket.campaignId,
        spellName: data.spellName,
        casterTokenId: data.casterTokenId,
        casterName: data.casterName,
        targets: evaluation.targets,
        damage: data.damage,
        save: data.save,
      });

      logger.info(`[Spells] spell:cast processed: ${data.spellName} (${data.castId})`);
    } catch (err) {
      logger.error('[Spells] Error processing spell:cast', err);
      socket.emit('error', { message: 'Failed to process spell cast' });
    }
  });

  // DM reviews and resolves the spell cast
  socket.on(
    'spell:resolve',
    (data: {
      castId: string;
      campaignId?: string;
      spellName: string;
      results: Array<{
        tokenId: string;
        damage: number;
        conditions: string[];
        savePassed?: boolean;
      }>;
    }) => {
      if (!socket.campaignId || !socket.userId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'spell:resolve')) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can resolve spell casts' });
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || !data.castId || !data.spellName || !Array.isArray(data.results)) {
        socket.emit('error', { message: 'Invalid spell resolution payload' });
        return;
      }
      if (data.campaignId && data.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Cannot resolve spells in another campaign' });
        return;
      }
      try {
        // Broadcast final resolved results to the entire campaign
        io.to(socket.campaignId).emit('spell:resolved', {
          castId: data.castId,
          spellName: data.spellName,
          results: data.results,
        });

        logger.info(`[Spells] spell:resolve applied: ${data.spellName} (${data.castId})`);
      } catch (err) {
        logger.error('[Spells] Error resolving spell', err);
        socket.emit('error', { message: 'Failed to resolve spell' });
      }
    }
  );
}
