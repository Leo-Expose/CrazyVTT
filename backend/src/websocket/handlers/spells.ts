/**
 * WebSocket Handlers for Spell Casting and AoE Templates
 */

import { Server, Socket } from 'socket.io';
import { evaluateSpellAoE, type SpellCastResolutionInput } from '../../services/spellResolution';
import logger from '../../utils/logger';

const castWindows = new Map<string, { startedAt: number; count: number }>();
const SPELL_CAST_LIMIT = 30;
const SPELL_CAST_WINDOW_MS = 60_000;

function allowSpellCast(socketId: string): boolean {
  const now = Date.now();
  const current = castWindows.get(socketId);
  if (!current || now - current.startedAt >= SPELL_CAST_WINDOW_MS) {
    castWindows.set(socketId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= SPELL_CAST_LIMIT) return false;
  current.count += 1;
  return true;
}

export function registerSpellHandlers(io: Server, socket: Socket) {
  socket.on('disconnect', () => {
    castWindows.delete(socket.id);
  });

  // Player initiates a spell cast with an AoE template
  socket.on('spell:cast', (data: SpellCastResolutionInput) => {
    if (!allowSpellCast(socket.id)) {
      socket.emit('error', { message: 'Spell cast rate limit exceeded' });
      return;
    }
    try {
      const evaluation = evaluateSpellAoE(data);

      // Broadcast review prompt to DM and caster
      io.to(`campaign:${data.campaignId}`).emit('spell:review', {
        castId: data.castId,
        campaignId: data.campaignId,
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
      campaignId: string;
      spellName: string;
      results: Array<{
        tokenId: string;
        damage: number;
        conditions: string[];
        savePassed?: boolean;
      }>;
    }) => {
      try {
        // Broadcast final resolved results to the entire campaign
        io.to(`campaign:${data.campaignId}`).emit('spell:resolved', {
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
