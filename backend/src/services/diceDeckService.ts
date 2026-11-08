// ============================================
// Dice Deck Service (Phase 12)
// Manages shuffled deck-based dice rolling for guaranteed statistical fairness.
// A "deck" enumerates every possible outcome of a dice expression and
// Fisher-Yates shuffles them. Players draw from the deck in order, so the
// distribution is perfect over each cycle (not just in the long run).
// ============================================

import { prisma } from '../config/database';
import { DiceDeck } from '@prisma/client';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeckOutcome {
  /** The individual die values for this outcome, e.g. [3, 5] for 2d6 */
  rolls: number[];
  /** Post-keep/drop total for this outcome */
  total: number;
}

export interface DrawResult {
  outcome: DeckOutcome;
  deckPosition: number;
  deckSize: number;
  seed: string;
}

export interface VerifyResult {
  valid: boolean;
  expectedDistribution: Map<number, number>;
  actualDistribution: Map<number, number>;
  chiSquared: number;
}

// ---------------------------------------------------------------------------
// Deterministic PRNG — mulberry32
// Produces a float in [0, 1) from a 32-bit integer seed.
// No external dependencies.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
    return z;
  };
}

/** Convert an arbitrary string seed into a 32-bit unsigned integer. */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Dice expression parsing (simple subset: NdS, NdSkhK, NdSklK, NdSdlK)
// ---------------------------------------------------------------------------

interface ParsedExpr {
  count: number;
  sides: number;
  /** keep highest K dice */
  keepHigh?: number;
  /** keep lowest K dice */
  keepLow?: number;
  /** drop lowest K dice (alias: keepHigh = count - K) */
  dropLow?: number;
  modifier: number;
}

/** Parse a dice expression like "2d6", "4d6kh3", "2d20kl1", "3d6+2". */
export function parseDiceExpr(expression: string): ParsedExpr {
  const clean = expression.toLowerCase().replace(/\s+/g, '');

  // Extract trailing numeric modifier (+N or -N), not part of the dice spec
  const modMatch = clean.match(/([+-]\d+)$/);
  const modifier = modMatch ? parseInt(modMatch[1], 10) : 0;
  const diceStr = modMatch ? clean.slice(0, clean.length - modMatch[1].length) : clean;

  // NdS with optional keep/drop
  const m = diceStr.match(/^(\d*)d(\d+)(?:(kh|kl|dl|dh)(\d+))?$/);
  if (!m) {
    throw new Error(`Unsupported dice expression for deck generation: "${expression}"`);
  }

  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  const mode = m[3];
  const arg = m[4] ? parseInt(m[4], 10) : undefined;

  if (count < 1 || count > 20) throw new Error(`Dice count out of range (1–20): ${count}`);
  if (sides < 2 || sides > 100) throw new Error(`Dice sides out of range (2–100): ${sides}`);

  const result: ParsedExpr = { count, sides, modifier };
  if (mode === 'kh' && arg !== undefined) result.keepHigh = arg;
  else if (mode === 'kl' && arg !== undefined) result.keepLow = arg;
  else if (mode === 'dl' && arg !== undefined) result.dropLow = arg;
  // dh (drop highest) → keepLow = count - arg
  else if (mode === 'dh' && arg !== undefined) result.keepLow = count - arg;

  return result;
}

// ---------------------------------------------------------------------------
// Deck generation — Cartesian product of all possible die values
// ---------------------------------------------------------------------------

/** Generate all ordered outcome combinations (Cartesian product). */
function cartesian(sides: number, count: number): number[][] {
  let results: number[][] = [[]];
  for (let d = 0; d < count; d++) {
    const next: number[][] = [];
    for (const prev of results) {
      for (let v = 1; v <= sides; v++) {
        next.push([...prev, v]);
      }
    }
    results = next;
  }
  return results;
}

/** Compute which dice are "kept" given the keep/drop modifiers. */
function applyModifiers(rolls: number[], parsed: ParsedExpr): number[] {
  const { keepHigh, keepLow, dropLow } = parsed;

  if (keepHigh !== undefined) {
    return [...rolls].sort((a, b) => b - a).slice(0, keepHigh);
  }
  if (keepLow !== undefined) {
    return [...rolls].sort((a, b) => a - b).slice(0, keepLow);
  }
  if (dropLow !== undefined) {
    return [...rolls].sort((a, b) => a - b).slice(dropLow);
  }
  return rolls;
}

/** Generate every possible DeckOutcome for a parsed expression. */
export function generateDeck(expression: string): DeckOutcome[] {
  const parsed = parseDiceExpr(expression);
  const { count, sides, modifier } = parsed;

  const combinations = cartesian(sides, count);
  const outcomes: DeckOutcome[] = combinations.map((rolls) => {
    const kept = applyModifiers(rolls, parsed);
    const total = kept.reduce((a, b) => a + b, 0) + modifier;
    return { rolls, total };
  });

  return outcomes;
}

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle with deterministic PRNG
// ---------------------------------------------------------------------------

export function shuffleDeck(deck: DeckOutcome[], seed: string): DeckOutcome[] {
  const rng = mulberry32(hashSeed(seed));
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ---------------------------------------------------------------------------
// DiceDeckService
// ---------------------------------------------------------------------------

export class DiceDeckService {
  /**
   * Get or create a DiceDeck record for the given campaign + expression.
   * The deck array is JSON-serialised as an array of DeckOutcome objects.
   */
  async getDeck(campaignId: string, expression: string): Promise<DiceDeck> {
    const existing = await prisma.diceDeck.findUnique({
      where: { campaignId_expression: { campaignId, expression } },
    });
    if (existing) return existing;

    return this.createFreshDeck(campaignId, expression);
  }

  /**
   * Draw the next outcome from the deck.
   * Reshuffles automatically when the deck is exhausted.
   */
  async draw(campaignId: string, expression: string): Promise<DrawResult> {
    let deck = await this.getDeck(campaignId, expression);
    const deckData = deck.deck as unknown as DeckOutcome[];

    // Reshuffle if we've consumed all entries
    if (deck.position >= deckData.length) {
      await this.reshuffle(campaignId, expression);
      deck = await this.getDeck(campaignId, expression);
    }

    const refreshed = deck.deck as unknown as DeckOutcome[];
    const position = deck.position;
    const outcome = refreshed[position];
    const deckSize = refreshed.length;

    // Advance position
    await prisma.diceDeck.update({
      where: { campaignId_expression: { campaignId, expression } },
      data: { position: position + 1 },
    });

    return {
      outcome,
      deckPosition: position + 1, // 1-based for display
      deckSize,
      seed: deck.seed,
    };
  }

  /** Reshuffle the deck (called when exhausted or by DM reset). */
  async reshuffle(campaignId: string, expression: string): Promise<void> {
    const outcomes = generateDeck(expression);
    const seed = crypto.randomUUID();
    const shuffled = shuffleDeck(outcomes, seed);

    await prisma.diceDeck.upsert({
      where: { campaignId_expression: { campaignId, expression } },
      update: { deck: shuffled as unknown as Parameters<typeof prisma.diceDeck.update>[0]['data']['deck'], position: 0, seed },
      create: {
        campaignId,
        expression,
        deck: shuffled as unknown as Parameters<typeof prisma.diceDeck.create>[0]['data']['deck'],
        position: 0,
        seed,
      },
    });
  }

  /**
   * Verify deck integrity by comparing the theoretical distribution of outcomes
   * to what has been drawn so far. Uses chi-squared as the similarity metric.
   */
  async verifyDeck(campaignId: string, expression: string): Promise<VerifyResult> {
    const deck = await this.getDeck(campaignId, expression);
    const deckData = deck.deck as unknown as DeckOutcome[];
    const drawn = deckData.slice(0, deck.position);

    // Expected: each total appears (count in full deck / deck size) times in drawn set
    const fullDeck = generateDeck(expression);
    const expectedFreq = new Map<number, number>();
    for (const o of fullDeck) {
      expectedFreq.set(o.total, (expectedFreq.get(o.total) ?? 0) + 1);
    }

    // Scale expected to the number of draws made
    const totalDrawn = drawn.length;
    const totalPossible = fullDeck.length;
    const scaledExpected = new Map<number, number>();
    expectedFreq.forEach((count, total) => {
      scaledExpected.set(total, (count / totalPossible) * totalDrawn);
    });

    // Actual distribution
    const actual = new Map<number, number>();
    for (const o of drawn) {
      actual.set(o.total, (actual.get(o.total) ?? 0) + 1);
    }

    // Chi-squared
    let chiSquared = 0;
    scaledExpected.forEach((expected, total) => {
      const obs = actual.get(total) ?? 0;
      if (expected > 0) {
        chiSquared += ((obs - expected) ** 2) / expected;
      }
    });

    // A perfectly shuffled deck will have chiSquared = 0 within a single cycle
    const valid = totalDrawn === 0 || chiSquared < 1e-9;

    return { valid, expectedDistribution: scaledExpected, actualDistribution: actual, chiSquared };
  }

  private async createFreshDeck(campaignId: string, expression: string): Promise<DiceDeck> {
    const outcomes = generateDeck(expression);
    const seed = crypto.randomUUID();
    const shuffled = shuffleDeck(outcomes, seed);

    return prisma.diceDeck.create({
      data: {
        campaignId,
        expression,
        deck: shuffled as unknown as Parameters<typeof prisma.diceDeck.create>[0]['data']['deck'],
        position: 0,
        seed,
      },
    });
  }
}

export const diceDeckService = new DiceDeckService();
