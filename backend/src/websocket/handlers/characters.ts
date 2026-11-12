// ============================================
// Character handlers: character.hp.update, character.hp.temporary,
// character.hitdice.spend
// Players act on their own characters; the DM may act on any of them.
// ============================================

import { Server } from 'socket.io';
import type { Character } from '@prisma/client';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { toJson } from '../../utils/prisma-json';
import type { DnD5eCharacterData } from '../../validators/game-systems/dnd5e.schema';
import { withinCeiling } from '../shared';
import { emitCharacterUpdated } from '../utils';
import { characterInCampaign } from '../../utils/characterCampaign';
import { applyHitPointChange, grantTemporaryHitPoints } from '../../utils/rules/hitPoints';
import { CharacterTemporaryHpSchema, TEMPORARY_HP_PAYLOAD_REFUSAL } from '../../validators/characters';

/** The largest change of hit points one event may make, either way. */
const MAX_HP_DELTA = 100_000;

/** The parts of a character blob this handler touches — see `charData` below. */
interface HpBlock {
  current?: unknown;
  maximum?: unknown;
  temporary?: unknown;
}
/** One hit dice pool as it sits in the blob, read loosely: only `remaining` is touched. */
type HitDiceEntry = Partial<Record<keyof NonNullable<DnD5eCharacterData['hitDice']>[number], unknown>>;
interface CharacterHitDiceData {
  hitDice?: unknown;
  [key: string]: unknown;
}
interface CharacterHpData {
  /** D&D 5e and Pathfinder 2e keep HP at the top level. */
  hp?: HpBlock;
  /** Call of Cthulhu 7e keeps it under derived stats. */
  derivedStats?: { hp?: HpBlock };
  [key: string]: unknown;
}

type Refusal = { error: string };

/**
 * The sheet with `delta` applied to its current hit points, clamped to 0 and
 * the maximum, or why it cannot be. In D&D 5e and Pathfinder 2e damage takes
 * temporary hit points first and only the rest comes off current hit points;
 * healing does not restore them (both rulebooks say so).
 *
 * Only the HP-bearing corners of the sheet are described: the blob is a full
 * character in one of several systems, and nothing else is read or written.
 * The values stay `unknown` until the checks below establish they are numbers.
 */
function applyHpDelta(
  gameSystem: string | null,
  stored: unknown,
  delta: number
): { data: CharacterHpData; hp: { current: number; max: number; temp: number } } | Refusal {
  const charData = stored as CharacterHpData;
  switch (gameSystem) {
    case 'DND_5E':
    case 'PATHFINDER_2E': {
      if (!charData?.hp || typeof charData.hp.maximum !== 'number') {
        return { error: 'Character does not have HP tracking' };
      }
      const max = charData.hp.maximum;
      const heldTemp = typeof charData.hp.temporary === 'number' ? Math.max(0, charData.hp.temporary) : 0;
      const { current, temp } = applyHitPointChange(
        { current: typeof charData.hp.current === 'number' ? charData.hp.current : max, max, temp: heldTemp },
        delta,
      );
      const hp = temp !== heldTemp ? { ...charData.hp, current, temporary: temp } : { ...charData.hp, current };
      return { data: { ...charData, hp }, hp: { current, max, temp } };
    }
    case 'CALL_OF_CTHULHU_7E': {
      if (!charData?.derivedStats?.hp || typeof charData.derivedStats.hp.maximum !== 'number') {
        return { error: 'Character does not have HP tracking' };
      }
      const max = charData.derivedStats.hp.maximum;
      const current = Math.max(0, Math.min(max, (typeof charData.derivedStats.hp.current === 'number' ? charData.derivedStats.hp.current : max) + delta));
      return {
        data: { ...charData, derivedStats: { ...charData.derivedStats, hp: { ...charData.derivedStats.hp, current } } },
        hp: { current, max, temp: 0 },
      };
    }
    default:
      return { error: 'HP tracking not supported for this game system' };
  }
}

/** The sheet with one die spent from the pool at `index`, or why it cannot be. */
function spendHitDie(stored: unknown, index: number): { data: CharacterHitDiceData } | Refusal {
  const charData = stored as CharacterHitDiceData;
  const pools = Array.isArray(charData?.hitDice) ? (charData.hitDice as HitDiceEntry[]) : null;
  if (!pools || !pools[index]) return { error: 'No hit dice pool at that position' };
  const remaining = typeof pools[index].remaining === 'number' ? (pools[index].remaining as number) : 0;
  if (remaining <= 0) return { error: 'No hit dice remaining to spend' };
  const hitDice = pools.map((entry, at) => (at === index ? { ...entry, remaining: remaining - 1 } : entry));
  return { data: { ...charData, hitDice } };
}

/**
 * The sheet with `temporary` temporary hit points in place of any it had, or
 * why it cannot be. They never add together (grantTemporaryHitPoints): the
 * character keeps the ones it has, which changes nothing, or takes these.
 */
function takeTemporaryHp(
  gameSystem: string | null,
  stored: unknown,
  temporary: number
): { data: CharacterHpData; hp: { current: number; max: number; temp: number } } | Refusal {
  if (gameSystem === 'CALL_OF_CTHULHU_7E') return { error: 'Call of Cthulhu sheets keep no temporary hit points' };
  const charData = stored as CharacterHpData;
  const heldTemp = typeof charData?.hp?.temporary === 'number' ? charData.hp.temporary : 0;
  const grant = grantTemporaryHitPoints(heldTemp, temporary, gameSystem);
  if (!grant) return { error: 'Temporary hit points are not tracked for this game system' };
  if (!charData?.hp || typeof charData.hp.maximum !== 'number') {
    return { error: 'Character does not have HP tracking' };
  }
  const max = charData.hp.maximum;
  const current = typeof charData.hp.current === 'number' ? charData.hp.current : max;
  return { data: { ...charData, hp: { ...charData.hp, temporary: grant.take } }, hp: { current, max, temp: grant.take } };
}

/**
 * The character `characterId` names, when this socket may change it: one of
 * its campaign's, as the REST routes judge it, and the socket's own unless
 * it is the DM's; a spectator changes none. Otherwise the refusal is sent,
 * `notYours` to a player on someone else's character, and the answer is null.
 */
async function characterToChange(socket: AuthenticatedSocket, campaignId: string, characterId: string, notYours: string): Promise<Character | null> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) {
    socket.emit('error', { message: 'Character not found' });
    return null;
  }
  if (!(await characterInCampaign(character, campaignId))) {
    socket.emit('error', { message: 'Character is not in this campaign' });
    return null;
  }
  // A spectator is watching, not playing: not even a character they own,
  // since a token bound to it follows the sheet on every screen. The DM
  // can still cover for them.
  if (socket.role === 'SPECTATOR') {
    socket.emit('error', { message: 'Spectators cannot change a character' });
    return null;
  }
  if (character.userId !== socket.userId && socket.role !== 'DM') {
    socket.emit('error', { message: notYours });
    return null;
  }
  return character;
}

export function registerCharacterHandlers(io: Server, socket: AuthenticatedSocket): void {
  socket.on('character.hp.update', async (data: { characterId: string; delta: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      // Each change holds the character's row for a transaction, so a burst
      // of them would hold every database connection the instance has.
      if (!withinCeiling(socket, 'character.hp.update')) return;

      const { characterId, delta } = data;

      if (!characterId || typeof delta !== 'number' || !Number.isFinite(delta)) {
        socket.emit('error', { message: 'characterId (string) and delta (number) are required' });
        return;
      }
      // Sheets store whole hit points: half a point was stored as 7.5, which
      // the sheet's schema then refused on every save.
      if (!Number.isInteger(delta) || Math.abs(delta) > MAX_HP_DELTA) {
        socket.emit('error', { message: `delta must be a whole number of hit points from -${MAX_HP_DELTA} to ${MAX_HP_DELTA}` });
        return;
      }

      // The character's owner, or the DM.
      const character = await characterToChange(socket, socket.campaignId, characterId, 'You do not have permission to update this character\'s HP');
      if (!character) return;

      // Read and written under the row's lock, afresh. Reading before the
      // lock and writing the whole sheet back undid any save that landed in
      // between; a save arriving now waits for this one instead.
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
        const fresh = await tx.character.findUnique({ where: { id: characterId }, select: { data: true } });
        if (!fresh) return { error: 'Character not found' } as const;
        const applied = applyHpDelta(character.gameSystem, fresh.data, delta);
        if ('error' in applied) return applied;
        await tx.character.update({ where: { id: characterId }, data: { data: toJson(applied.data) } });
        return applied;
      });
      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }
      const { current, max, temp } = outcome.hp;

      // Broadcast updated HP to all campaign members
      io.to(socket.campaignId!).emit('character.hp.updated', {
        characterId,
        hp: { current, max, temp },
      });

    } catch (error) {
      logger.error('character.hp.update failed', { err: error });
      socket.emit('error', { message: 'Failed to update character HP' });
    }
  });

  /**
   * CHARACTER.HP.TEMPORARY: the character takes `temporary` temporary hit
   * points in place of any it has. Temporary hit points never add together,
   * and a character that has some chooses between keeping those, which
   * changes nothing, and taking the new ones, which is this. Same permission
   * rule as HP.
   */
  socket.on('character.hp.temporary', async (data: unknown) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!withinCeiling(socket, 'character.hp.temporary')) return;

      const parsed = CharacterTemporaryHpSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? TEMPORARY_HP_PAYLOAD_REFUSAL });
        return;
      }
      const { characterId, temporary } = parsed.data;

      const character = await characterToChange(socket, socket.campaignId, characterId, 'You do not have permission to update this character\'s HP');
      if (!character) return;

      // Under the row's lock and read afresh, for the reason given for hit
      // points above.
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
        const fresh = await tx.character.findUnique({ where: { id: characterId }, select: { data: true } });
        if (!fresh) return { error: 'Character not found' } as const;
        const taken = takeTemporaryHp(character.gameSystem, fresh.data, temporary);
        if ('error' in taken) return taken;
        await tx.character.update({ where: { id: characterId }, data: { data: toJson(taken.data) } });
        return taken;
      });
      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

      io.to(socket.campaignId).emit('character.hp.updated', { characterId, hp: outcome.hp });
    } catch (error) {
      logger.error('character.hp.temporary failed', { err: error });
      socket.emit('error', { message: 'Failed to update character HP' });
    }
  });

  /**
   * CHARACTER.HITDICE.SPEND — spend one D&D 5e hit die.
   *
   * The roll itself goes through `dice.roll` like every other roll; this only
   * decrements the pool, so the count cannot be inflated by a client that
   * simply declines to send it. Same permission rule as HP: the character's
   * owner, or the DM covering for an absent player.
   */
  socket.on('character.hitdice.spend', async (data: { characterId: string; index: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!withinCeiling(socket, 'character.hitdice.spend')) return;

      const { characterId, index } = data ?? {};

      if (!characterId || typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
        socket.emit('error', { message: 'characterId (string) and index (integer) are required' });
        return;
      }

      // As for hit points: the character's owner, or the DM.
      const character = await characterToChange(socket, socket.campaignId, characterId, 'You do not have permission to spend this character\'s hit dice');
      if (!character) return;

      if (character.gameSystem !== 'DND_5E') {
        socket.emit('error', { message: 'Hit dice are not tracked for this game system' });
        return;
      }

      // Under the row's lock and read afresh, for the reason given for hit
      // points above.
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
        const fresh = await tx.character.findUnique({ where: { id: characterId }, select: { data: true } });
        if (!fresh) return { error: 'Character not found' } as const;
        const spent = spendHitDie(fresh.data, index);
        if ('error' in spent) return spent;
        return { updated: await tx.character.update({ where: { id: characterId }, data: { data: toJson(spent.data) } }) };
      });
      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }
      const updated = outcome.updated;

      // The sheet blob changed, so this goes out as `character.updated` — the
      // event an open character sheet already refreshes on — rather than a
      // narrow one of its own that nothing would listen to. No token art or
      // name changed, so nothing needs to repaint the map.
      // The sheet as each member may read it: the Keeper's Notes to the DM alone.
      await emitCharacterUpdated(socket.campaignId, updated, {
        characterId,
        userId: socket.userId,
        tokensChanged: false,
      });

    } catch (error) {
      logger.error('character.hitdice.spend failed', { err: error });
      socket.emit('error', { message: 'Failed to spend hit die' });
    }
  });

  /**
   * CHARACTER.REST — Long Rest / Short Rest automated recovery engine (PRD §5, §10.3)
   * Automatically recovers hit points, refreshes expended spell slots, resets death saves,
   * and replenishes hit dice per 5e rules.
   */
  socket.on('character.rest', async (data: { characterId: string; restType: 'short' | 'long' }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      const { characterId, restType } = data ?? {};
      if (!characterId || (restType !== 'short' && restType !== 'long')) {
        socket.emit('error', { message: 'characterId and valid restType ("short" | "long") are required' });
        return;
      }

      const character = await characterToChange(
        socket,
        socket.campaignId,
        characterId,
        'You do not have permission to rest this character',
      );
      if (!character) return;

      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
        const fresh = await tx.character.findUnique({ where: { id: characterId }, select: { data: true } });
        if (!fresh) return { error: 'Character not found' } as const;

        const sheetData = { ...(fresh.data as Record<string, unknown>) };

        if (restType === 'long') {
          // 1. Long Rest restores 100% of maximum HP and clears temporary HP
          const hp = (sheetData.hp as { current: number; maximum: number; temporary: number }) || { current: 10, maximum: 10, temporary: 0 };
          sheetData.hp = { ...hp, current: hp.maximum, temporary: 0 };

          // 2. Clear death saves
          sheetData.deathSaves = { successes: 0, failures: 0 };

          // 3. Reset spell slots: reset used count to 0 for all tiers
          if (sheetData.spellcasting && typeof sheetData.spellcasting === 'object') {
            const spellcasting = { ...(sheetData.spellcasting as Record<string, unknown>) };
            const slots = (spellcasting.slots as Record<string, { total: number; used: number }>) || {};
            const refreshedSlots: Record<string, { total: number; used: number }> = {};
            for (const [lvl, val] of Object.entries(slots)) {
              refreshedSlots[lvl] = { ...val, used: 0 };
            }
            spellcasting.slots = refreshedSlots;
            sheetData.spellcasting = spellcasting;
          }

          // 4. Regain up to half total hit dice (min 1)
          if (Array.isArray(sheetData.hitDice)) {
            sheetData.hitDice = sheetData.hitDice.map((hd: { maximum: number; remaining: number; class?: string; total?: string; die?: string }) => {
              const max = hd.maximum || 1;
              const regained = Math.max(1, Math.floor(max / 2));
              return { ...hd, remaining: Math.min(max, (hd.remaining || 0) + regained) };
            });
          }
        }

        const updated = await tx.character.update({
          where: { id: characterId },
          data: { data: toJson(sheetData) },
        });

        return { updated, hp: sheetData.hp };
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

      // Broadcast character updated to table
      await emitCharacterUpdated(socket.campaignId, outcome.updated, {
        characterId,
        userId: socket.userId,
        tokensChanged: false,
      });

      io.to(socket.campaignId).emit('character.hp.updated', { characterId, hp: outcome.hp });
      logger.info('character.rest applied', { characterId, restType, userId: socket.userId });
    } catch (error) {
      logger.error('character.rest failed', { err: error });
      socket.emit('error', { message: 'Failed to process character rest' });
    }
  });

  /**
   * CHARACTER.SPELLSLOT.USE — Deduct or refund a spell slot on cast (PRD §5, §10.3)
   */
  socket.on('character.spellslot.use', async (data: { characterId: string; level: number; delta: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      const { characterId, level, delta } = data ?? {};
      if (!characterId || typeof level !== 'number' || level < 1 || level > 9 || typeof delta !== 'number') {
        socket.emit('error', { message: 'characterId, valid level (1-9), and delta are required' });
        return;
      }

      const character = await characterToChange(
        socket,
        socket.campaignId,
        characterId,
        'You do not have permission to modify this character\'s spell slots',
      );
      if (!character) return;

      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
        const fresh = await tx.character.findUnique({ where: { id: characterId }, select: { data: true } });
        if (!fresh) return { error: 'Character not found' } as const;

        const sheetData = { ...(fresh.data as Record<string, unknown>) };
        if (!sheetData.spellcasting || typeof sheetData.spellcasting !== 'object') {
          return { error: 'Character has no spellcasting slots' } as const;
        }

        const spellcasting = { ...(sheetData.spellcasting as Record<string, unknown>) };
        const slots = { ...(spellcasting.slots as Record<string, { total: number; used: number }>) };
        const lvlKey = String(level);
        const slot = slots[lvlKey] || { total: 0, used: 0 };

        const newUsed = Math.max(0, Math.min(slot.total, (slot.used || 0) + delta));
        slots[lvlKey] = { ...slot, used: newUsed };
        spellcasting.slots = slots;
        sheetData.spellcasting = spellcasting;

        const updated = await tx.character.update({
          where: { id: characterId },
          data: { data: toJson(sheetData) },
        });

        return { updated, newUsed, total: slot.total };
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

      await emitCharacterUpdated(socket.campaignId, outcome.updated, {
        characterId,
        userId: socket.userId,
        tokensChanged: false,
      });

      logger.info('character.spellslot.use applied', { characterId, level, delta, newUsed: outcome.newUsed });
    } catch (error) {
      logger.error('character.spellslot.use failed', { err: error });
      socket.emit('error', { message: 'Failed to update spell slots' });
    }
  });
}
