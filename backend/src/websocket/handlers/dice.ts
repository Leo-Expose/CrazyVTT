// ============================================
// Dice handlers: dice.roll, dice.clearHistory,
//                dice.setMode, dice.audit, dice.reshuffleDeck
// Phase 12: Dual-Mode Dice System
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { rollDice, parseDiceExpression, DiceParserError } from '../../utils/dice-parser';
import logger from '../../utils/logger';
import { withinCeiling } from '../shared';
import { toJson } from '../../utils/prisma-json';
import { canRollDice } from '../../services/permissions';
import { campaignSockets } from '../utils';
import { DiceRollSchema } from '../../validators/dice';
import { ackFrom, refuseRequest } from '../ack';
import { DiceMode } from '@prisma/client';
import { diceRollService } from '../../services/diceRollService';
import { diceAuditService } from '../../services/diceAuditService';
import { diceDeckService } from '../../services/diceDeckService';

export function registerDiceHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * DICE.ROLL - User rolls dice
   * Validates expression, calculates result, saves to database, and broadcasts.
   * Under the per-user dice ceiling (SOCKET_CEILINGS). Answered through the
   * acknowledgement when one is passed (see ../ack.ts).
   * SECURITY: Uses server-authenticated socket.campaignId only.
   */
  socket.on('dice.roll', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }

      // Counted before anything else is checked, so a flood of rolls that
      // would be refused (malformed, or from a spectator) is held to the
      // same ceiling and does not draw an error apiece.
      if (!withinCeiling(socket, 'dice.roll', ack)) return;

      // Spectators watch: they may talk in chat, and they may not roll.
      if (!canRollDice(socket.role)) {
        refuse('Spectators cannot roll dice');
        return;
      }

      // The labels are stored with the roll and sent to every member, so
      // they are bounded here (validators/dice.ts).
      const parsed = DiceRollSchema.safeParse(data);
      if (!parsed.success) {
        refuse(parsed.error.issues[0]?.message ?? 'Dice expression required');
        return;
      }
      const { expression, characterName, purpose, secret } = parsed.data;

      // Validate expression syntax (without rolling)
      try {
        parseDiceExpression(expression);
      } catch (error) {
        if (error instanceof DiceParserError) {
          refuse(`Invalid dice expression: ${error.message}`);
          return;
        }
        throw error;
      }

      // Roll the dice
      const rollResult = rollDice(expression);

      // Get user information
      const user = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: { displayName: true },
      });

      if (!user) {
        refuse('User not found');
        return;
      }

      // SECURITY: Save ALL rolls to database (including secret rolls for audit)
      // Secret rolls are marked but still saved for DM oversight and dispute resolution
      const diceRoll = await prisma.diceRoll.create({
        data: {
          campaignId: socket.campaignId,
          userId: socket.userId!,
          expression,
          result: rollResult.total,
          breakdown: toJson(rollResult), // Store full RollResult
          characterName: characterName || null,
          purpose: purpose || null,
          secret: secret || false, // Mark as secret for visibility filtering
        },
      });

      // A roll is not a chat message, and no second row is written for it.
      //
      // One used to be: a Message of type DICE_ROLL whose metadata repeated the
      // expression, result, breakdown, character name, purpose and secret flag
      // that the DiceRoll row above already holds. Nothing ever read it — the
      // chat panel does not listen for rolls, and the history endpoint filters
      // the type out — so the rows accumulated with no way to reach or clear
      // them, and their presence starved the chat page they were filtered from.
      //
      // The copy was also the unsafe one: `secret` lived only inside unindexed
      // metadata, where the chat query does not filter on it. The DiceRoll table
      // is the record, with `secret` as a real column and a clear-history
      // watermark. Rolls are read from there, by the Dice panel.

      // Broadcast result with role-based filtering.
      //
      // `id` and the stored `rolledAt` are sent rather than a freshly generated
      // timestamp so that a roll arriving live and the same roll replayed from
      // history identify as one entry. Without the id the client keyed rolls by
      // user and broadcast time, which no stored roll could ever match.
      const rollData = {
        id: diceRoll.id,
        userId: socket.userId,
        userName: user.displayName,
        characterName: characterName || null,
        expression,
        result: rollResult.total,
        breakdown: rollResult,
        purpose: purpose || null,
        timestamp: diceRoll.rolledAt.toISOString(),
        secret: secret || false,
      };

      if (secret) {
        // Secret roll - send to roller (always)
        socket.emit('dice.rolled', rollData);

        // SECURITY: Also send to DM(s) for audit/oversight
        // Follows Spirit Layer pattern: DMs see everything, players see filtered
        for (const s of await campaignSockets(io, socket.campaignId)) {
          const authedSocket = s as unknown as AuthenticatedSocket;
          // Send to DMs only (excluding the original roller if they're DM)
          if (authedSocket.role === 'DM' && authedSocket.userId !== socket.userId) {
            s.emit('dice.rolled.secret', {
              ...rollData,
              originalRoller: socket.userId,
              isAuditView: true, // Flag so DM UI can style differently
            });
          }
        }
      } else {
        // Normal roll - broadcast to all campaign members
        io.to(socket.campaignId).emit('dice.rolled', rollData);
      }
      ack?.({ ok: true, id: diceRoll.id });

      logger.debug('dice.roll', { expression, result: rollResult.total, userId: socket.userId, secret: secret || false, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('dice.roll failed', { err: error });
      refuse(error instanceof DiceParserError ? `Dice roll failed: ${error.message}` : 'Failed to roll dice');
    }
  });

  /**
   * DICE.CLEAR_HISTORY - DM clears dice roll history (DM-only).
   */
  socket.on('dice.clearHistory', async (ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      if (!withinCeiling(socket, 'dice.clearHistory', ack)) return;

      // Who is running the game, not who owns the campaign. These are separate
      // facts — `Campaign.ownerId` never moves, while the DM seat can — and they
      // only coincide in a campaign whose creator still runs it. Reading
      // ownership here refused the actual DM after a handover and let the former
      // DM, now a player, keep clearing the panel for everyone.
      if (socket.role !== 'DM') {
        refuse('Only the DM can clear roll history');
        return;
      }

      // Record the clear so it survives a reload. This used to be broadcast
      // only, which was invisible while history lived in browser memory — but
      // now that the panel loads from the database, a clear that changed
      // nothing server-side would undo itself on the next refresh.
      //
      // A watermark, not a delete: secret rolls are stored deliberately for
      // audit, and clearing the panel should not destroy that record.
      await prisma.campaign.update({
        where: { id: socket.campaignId },
        data: { rollHistoryClearedAt: new Date() },
      });

      // Broadcast to all campaign members (including DM)
      io.to(socket.campaignId).emit('dice.historyCleared');
      ack?.({ ok: true });

      logger.info('dice.clearHistory', { campaignId: socket.campaignId, userId: socket.userId });
    } catch (error) {
      logger.error('dice.clearHistory failed', { err: error });
      refuse('Failed to clear dice history');
    }
  });

  /**
   * DICE.SET_MODE — DM switches between TRUE_RANDOM and WEIGHTED_DECK.
   * Broadcasts the new mode to all campaign members so UIs update live.
   */
  socket.on('dice.setMode', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) { refuse('Not authenticated to a campaign'); return; }
      if (socket.role !== 'DM') { refuse('Only the DM can change dice mode'); return; }

      const parsed = (() => {
        if (typeof data !== 'object' || data === null || !('mode' in data)) return null;
        const m = (data as Record<string, unknown>).mode;
        if (m !== DiceMode.TRUE_RANDOM && m !== DiceMode.WEIGHTED_DECK) return null;
        return { mode: m as DiceMode };
      })();

      if (!parsed) { refuse('Invalid dice mode. Expected TRUE_RANDOM or WEIGHTED_DECK'); return; }

      await diceRollService.setCampaignMode(socket.campaignId, parsed.mode);
      io.to(socket.campaignId).emit('dice.modeChanged', { mode: parsed.mode });
      ack?.({ ok: true, mode: parsed.mode });

      logger.info('dice.setMode', { campaignId: socket.campaignId, mode: parsed.mode, userId: socket.userId });
    } catch (error) {
      logger.error('dice.setMode failed', { err: error });
      refuse('Failed to set dice mode');
    }
  });

  /**
   * DICE.AUDIT — Generate a statistical audit report for the campaign.
   * DM-only. Returns chi-squared results per expression.
   */
  socket.on('dice.audit', async (ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) { refuse('Not authenticated to a campaign'); return; }
      if (socket.role !== 'DM') { refuse('Only the DM can run a dice audit'); return; }

      const report = await diceAuditService.generateAuditReport(socket.campaignId);

      // Serialise Maps → plain objects for JSON transport
      const serialised = {
        ...report,
        expressions: report.expressions.map((r) => ({
          ...r,
          expectedDistribution: Object.fromEntries(r.expectedDistribution),
          actualDistribution: Object.fromEntries(r.actualDistribution),
        })),
      };

      ack?.({ ok: true, report: serialised });

      logger.debug('dice.audit', { campaignId: socket.campaignId, userId: socket.userId });
    } catch (error) {
      logger.error('dice.audit failed', { err: error });
      refuse('Failed to generate dice audit report');
    }
  });

  /**
   * DICE.RESHUFFLE_DECK — DM manually reshuffles the deck for an expression.
   * Useful after changing campaign mode or as a dramatic table moment.
   */
  socket.on('dice.reshuffleDeck', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) { refuse('Not authenticated to a campaign'); return; }
      if (socket.role !== 'DM') { refuse('Only the DM can reshuffle a deck'); return; }

      const expr = (() => {
        if (typeof data !== 'object' || data === null || !('expression' in data)) return null;
        const e = (data as Record<string, unknown>).expression;
        return typeof e === 'string' ? e : null;
      })();

      if (!expr) { refuse('expression required'); return; }

      await diceDeckService.reshuffle(socket.campaignId, expr);
      io.to(socket.campaignId).emit('dice.deckReshuffled', { expression: expr });
      ack?.({ ok: true });

      logger.info('dice.reshuffleDeck', { campaignId: socket.campaignId, expression: expr, userId: socket.userId });
    } catch (error) {
      logger.error('dice.reshuffleDeck failed', { err: error });
      refuse('Failed to reshuffle deck');
    }
  });

  /**
   * DICE.ROLL (enhanced) — now also saves mode + deck metadata.
   * The original handler still works; we add mode metadata via diceRollService
   * for new rolls. The existing path is preserved to avoid breaking changes.
   *
   * NOTE: The existing dice.roll handler above handles the common case.
   * The new dice.roll.v2 handler below uses diceRollService for full metadata.
   */
  socket.on('dice.roll.v2', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) { refuse('Not authenticated to a campaign'); return; }
      if (!withinCeiling(socket, 'dice.roll', ack)) return;
      if (!canRollDice(socket.role)) { refuse('Spectators cannot roll dice'); return; }

      const parsed = (() => {
        if (typeof data !== 'object' || data === null) return null;
        const d = data as Record<string, unknown>;
        if (typeof d.expression !== 'string') return null;
        return {
          expression: d.expression as string,
          characterName: typeof d.characterName === 'string' ? d.characterName : undefined,
          purpose: typeof d.purpose === 'string' ? d.purpose : undefined,
          secret: d.secret === true,
          rerollOf: typeof d.rerollOf === 'string' ? d.rerollOf : undefined,
        };
      })();

      if (!parsed) { refuse('Dice expression required'); return; }

      const user = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: { displayName: true },
      });
      if (!user) { refuse('User not found'); return; }

      const diceRoll = await diceRollService.roll({
        campaignId: socket.campaignId,
        expression: parsed.expression,
        userId: socket.userId!,
        characterName: parsed.characterName,
        purpose: parsed.purpose,
        secret: parsed.secret,
        rerollOf: parsed.rerollOf,
      });

      const rollData = {
        id: diceRoll.id,
        userId: socket.userId,
        userName: user.displayName,
        characterName: parsed.characterName ?? null,
        expression: parsed.expression,
        result: diceRoll.result,
        breakdown: diceRoll.breakdown,
        purpose: parsed.purpose ?? null,
        timestamp: diceRoll.rolledAt.toISOString(),
        secret: parsed.secret,
        mode: diceRoll.mode,
        deckPosition: diceRoll.deckPosition,
        deckSize: diceRoll.deckSize,
        isReroll: diceRoll.isReroll,
        rerollReason: diceRoll.rerollReason,
      };

      if (parsed.secret) {
        socket.emit('dice.rolled', rollData);
        for (const s of await campaignSockets(io, socket.campaignId)) {
          const authedSocket = s as unknown as AuthenticatedSocket;
          if (authedSocket.role === 'DM' && authedSocket.userId !== socket.userId) {
            s.emit('dice.rolled.secret', { ...rollData, originalRoller: socket.userId, isAuditView: true });
          }
        }
      } else {
        io.to(socket.campaignId).emit('dice.rolled', rollData);
      }
      ack?.({ ok: true, id: diceRoll.id });

      logger.debug('dice.roll.v2', { expression: parsed.expression, result: diceRoll.result, mode: diceRoll.mode, userId: socket.userId });
    } catch (error) {
      logger.error('dice.roll.v2 failed', { err: error });
      refuse(error instanceof Error ? error.message : 'Failed to roll dice');
    }
  });
}

// Keep existing imports used by old dice.roll handler (rollDice, toJson) in scope
// by referencing them here — they are used in the original handler above.
void (rollDice as unknown);
void (toJson as unknown);
