// ============================================
// Dice Roll Service (Phase 12)
// Unified entry point for all dice rolls.
// Routes to true-random crypto or weighted-deck mode based on campaign setting.
// Persists every roll with full metadata for audit and reroll-chain tracking.
// ============================================

import { prisma } from '../config/database';
import { DiceMode, RerollReason, DiceRoll } from '@prisma/client';
import { rollDice, parseDiceExpression, DiceParserError } from '../utils/dice-parser';
import { diceDeckService, generateDeck, DeckOutcome } from './diceDeckService';
import logger from '../utils/logger';
import { toJson } from '../utils/prisma-json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RollRequest {
  campaignId: string;
  expression: string;
  userId: string;
  characterName?: string;
  purpose?: string;
  secret?: boolean;
  /** Link to a previous roll this supersedes (for reroll chains) */
  rerollOf?: string;
  rerollReason?: RerollReason;
  /** DM-forced mode override — bypasses campaign default */
  forcedMode?: DiceMode;
}

export interface RollResult {
  total: number;
  formula: string;
  rolls: RollDetail[];
}

interface RollDetail {
  type: 'dice' | 'modifier';
  notation?: string;
  sides?: number;
  results?: number[];
  kept?: number[];
  total?: number;
  value?: number;
}

// ---------------------------------------------------------------------------
// True-random roll using the existing dice-parser
// ---------------------------------------------------------------------------

function rollTrueRandom(expression: string): RollResult {
  const result = rollDice(expression);
  return {
    total: result.total,
    formula: result.formula ?? expression,
    rolls: result.rolls as RollDetail[],
  };
}

// ---------------------------------------------------------------------------
// Weighted-deck roll: draw from the pre-shuffled deck
// Returns a RollResult-shaped object compatible with the breakdown column.
// ---------------------------------------------------------------------------

async function rollFromDeck(
  campaignId: string,
  expression: string,
): Promise<{ result: RollResult; deckPosition: number; deckSize: number; seed: string }> {
  const draw = await diceDeckService.draw(campaignId, expression);
  const { outcome, deckPosition, deckSize, seed } = draw;

  // Build a minimal RollResult that mirrors the dice-parser format so the
  // frontend breakdown renderer works identically for both modes.
  const result: RollResult = {
    total: outcome.total,
    formula: expression,
    rolls: [
      {
        type: 'dice',
        notation: expression,
        results: outcome.rolls,
        total: outcome.total,
      },
    ],
  };

  return { result, deckPosition, deckSize, seed };
}

// ---------------------------------------------------------------------------
// Reroll number helper
// ---------------------------------------------------------------------------

async function getRerollNumber(rerollOf: string | undefined): Promise<number> {
  if (!rerollOf) return 0;
  const parent = await prisma.diceRoll.findUnique({
    where: { id: rerollOf },
    select: { rerollNumber: true },
  });
  return (parent?.rerollNumber ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// DiceRollService
// ---------------------------------------------------------------------------

export class DiceRollService {
  /**
   * Roll dice in the appropriate mode for the campaign, persist to DB,
   * and return the saved DiceRoll record.
   */
  async roll(request: RollRequest): Promise<DiceRoll> {
    const {
      campaignId,
      expression,
      userId,
      characterName,
      purpose,
      secret = false,
      rerollOf,
      rerollReason,
      forcedMode,
    } = request;

    // Validate expression before touching the database
    try {
      parseDiceExpression(expression);
    } catch (err) {
      if (err instanceof DiceParserError) {
        throw new Error(`Invalid dice expression: ${err.message}`, { cause: err });
      }
      throw err;
    }

    // Resolve mode: forced override > campaign default > TRUE_RANDOM fallback
    const mode = forcedMode ?? (await this.getCampaignMode(campaignId));
    const isReroll = !!rerollOf;
    const rerollNumber = await getRerollNumber(rerollOf);

    let rollResult: RollResult;
    let deckPosition: number | undefined;
    let deckSize: number | undefined;
    let deckSeed: string | undefined;

    if (mode === DiceMode.WEIGHTED_DECK) {
      try {
        const draw = await rollFromDeck(campaignId, expression);
        rollResult = draw.result;
        deckPosition = draw.deckPosition;
        deckSize = draw.deckSize;
        deckSeed = draw.seed;
      } catch (err) {
        // If deck generation fails (e.g. unsupported expression), fall back gracefully
        logger.warn('diceRollService: deck draw failed, falling back to true-random', {
          expression,
          campaignId,
          err: String(err),
        });
        rollResult = rollTrueRandom(expression);
      }
    } else {
      rollResult = rollTrueRandom(expression);
    }

    const diceRoll = await prisma.diceRoll.create({
      data: {
        campaignId,
        userId,
        expression,
        result: rollResult.total,
        breakdown: toJson(rollResult),
        characterName: characterName ?? null,
        purpose: purpose ?? null,
        secret,
        mode,
        isReroll,
        originalRollId: rerollOf ?? null,
        rerollReason: rerollReason ?? null,
        rerollNumber,
        deckPosition: deckPosition ?? null,
        deckSize: deckSize ?? null,
        deckSeed: deckSeed ?? null,
      },
    });

    logger.debug('diceRollService.roll', {
      id: diceRoll.id,
      expression,
      result: rollResult.total,
      mode,
      userId,
      campaignId,
      isReroll,
    });

    return diceRoll;
  }

  /**
   * Roll with advantage: two 1d20 rolls, returning both for the caller
   * to pick the higher.
   */
  async rollAdvantage(request: Omit<RollRequest, 'expression'>): Promise<{ roll1: DiceRoll; roll2: DiceRoll }> {
    const roll1 = await this.roll({ ...request, expression: '1d20' });
    const roll2 = await this.roll({
      ...request,
      expression: '1d20',
      rerollOf: roll1.id,
      rerollReason: RerollReason.ADVANTAGE,
    });
    return { roll1, roll2 };
  }

  /**
   * Roll with disadvantage: two 1d20 rolls, returning both for the caller
   * to pick the lower.
   */
  async rollDisadvantage(request: Omit<RollRequest, 'expression'>): Promise<{ roll1: DiceRoll; roll2: DiceRoll }> {
    const roll1 = await this.roll({ ...request, expression: '1d20' });
    const roll2 = await this.roll({
      ...request,
      expression: '1d20',
      rerollOf: roll1.id,
      rerollReason: RerollReason.DISADVANTAGE,
    });
    return { roll1, roll2 };
  }

  /**
   * Halfling Luck: re-roll any 1 on a d20.
   */
  async rollHalflingLuck(request: Omit<RollRequest, 'expression'>): Promise<DiceRoll> {
    const roll = await this.roll({ ...request, expression: '1d20' });
    const breakdown = roll.breakdown as unknown as RollResult | null;
    const rolls = breakdown?.rolls ?? [];
    const hasNatural1 = rolls.some(
      (r) => r.type === 'dice' && r.sides === 20 && r.results?.includes(1),
    );

    if (!hasNatural1) return roll;

    return this.roll({
      ...request,
      expression: '1d20',
      rerollOf: roll.id,
      rerollReason: RerollReason.HALFLING_LUCK,
    });
  }

  /** Set a campaign's dice mode (DM-only action; auth enforced at handler). */
  async setCampaignMode(campaignId: string, mode: DiceMode): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { diceMode: mode },
    });
  }

  /** Get theoretical deck outcomes for display/audit. */
  getDeckOutcomes(expression: string): DeckOutcome[] {
    return generateDeck(expression);
  }

  private async getCampaignMode(campaignId: string): Promise<DiceMode> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { diceMode: true },
    });
    return campaign?.diceMode ?? DiceMode.TRUE_RANDOM;
  }
}

export const diceRollService = new DiceRollService();
