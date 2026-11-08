// ============================================
// DiceDeckService tests (Phase 12)
// ============================================

import {
  generateDeck,
  shuffleDeck,
  parseDiceExpr,
  DiceDeckService,
  DeckOutcome,
} from '../diceDeckService';
import { prisma } from '../../config/database';

// ---------------------------------------------------------------------------
// Unit tests: parseDiceExpr
// ---------------------------------------------------------------------------

describe('parseDiceExpr', () => {
  it('parses 1d6', () => {
    const p = parseDiceExpr('1d6');
    expect(p.count).toBe(1);
    expect(p.sides).toBe(6);
    expect(p.modifier).toBe(0);
  });

  it('parses 2d6', () => {
    const p = parseDiceExpr('2d6');
    expect(p.count).toBe(2);
    expect(p.sides).toBe(6);
  });

  it('parses 4d6kh3', () => {
    const p = parseDiceExpr('4d6kh3');
    expect(p.count).toBe(4);
    expect(p.sides).toBe(6);
    expect(p.keepHigh).toBe(3);
  });

  it('parses 2d20kl1 (disadvantage)', () => {
    const p = parseDiceExpr('2d20kl1');
    expect(p.keepLow).toBe(1);
  });

  it('parses 3d6+2', () => {
    const p = parseDiceExpr('3d6+2');
    expect(p.modifier).toBe(2);
  });

  it('throws on unsupported expression', () => {
    expect(() => parseDiceExpr('d%')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Unit tests: generateDeck
// ---------------------------------------------------------------------------

describe('generateDeck', () => {
  it('1d6 → 6 outcomes, totals 1–6 each appearing once', () => {
    const deck = generateDeck('1d6');
    expect(deck).toHaveLength(6);
    const totals = deck.map((o) => o.total).sort((a, b) => a - b);
    expect(totals).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('2d6 → 36 outcomes', () => {
    const deck = generateDeck('2d6');
    expect(deck).toHaveLength(36);
  });

  it('2d6 total distribution: 7 appears 6 times', () => {
    const deck = generateDeck('2d6');
    const freq = new Map<number, number>();
    for (const o of deck) freq.set(o.total, (freq.get(o.total) ?? 0) + 1);
    expect(freq.get(7)).toBe(6);
    expect(freq.get(2)).toBe(1);
    expect(freq.get(12)).toBe(1);
  });

  it('1d20 → 20 outcomes, totals 1–20 each appearing once', () => {
    const deck = generateDeck('1d20');
    expect(deck).toHaveLength(20);
    const totals = new Set(deck.map((o) => o.total));
    expect(totals.size).toBe(20);
  });

  it('4d6kh3 → 1296 outcomes (6^4)', () => {
    const deck = generateDeck('4d6kh3');
    expect(deck).toHaveLength(1296);
  });

  it('4d6kh3: each outcome keeps only 3 of 4 dice', () => {
    const deck = generateDeck('4d6kh3');
    // rolls array has all 4 dice, total reflects top 3
    for (const o of deck.slice(0, 10)) {
      expect(o.rolls).toHaveLength(4);
      const top3 = [...o.rolls].sort((a, b) => b - a).slice(0, 3);
      expect(o.total).toBe(top3.reduce((s, v) => s + v, 0));
    }
  });

  it('3d6+2 → 216 outcomes', () => {
    const deck = generateDeck('3d6+2');
    expect(deck).toHaveLength(216);
    // All totals are shifted by +2
    for (const o of deck) {
      const rawSum = o.rolls.reduce((s, v) => s + v, 0);
      expect(o.total).toBe(rawSum + 2);
    }
  });
});

// ---------------------------------------------------------------------------
// Unit tests: shuffleDeck
// ---------------------------------------------------------------------------

describe('shuffleDeck', () => {
  it('same seed produces the same order', () => {
    const deck = generateDeck('2d6');
    const s1 = shuffleDeck(deck, 'seed-abc');
    const s2 = shuffleDeck(deck, 'seed-abc');
    expect(s1.map((o) => o.total)).toEqual(s2.map((o) => o.total));
  });

  it('different seeds produce different orders (with overwhelming probability)', () => {
    const deck = generateDeck('2d6');
    const s1 = shuffleDeck(deck, 'seed-alpha');
    const s2 = shuffleDeck(deck, 'seed-beta');
    // 36! permutations — the probability both orders match is negligible
    const match = s1.every((o, i) => o.total === s2[i].total);
    expect(match).toBe(false);
  });

  it('contains the same elements after shuffle', () => {
    const deck = generateDeck('1d6');
    const shuffled = shuffleDeck(deck, 'test');
    const sortedOrig = deck.map((o) => o.total).sort((a, b) => a - b);
    const sortedShuffled = shuffled.map((o) => o.total).sort((a, b) => a - b);
    expect(sortedShuffled).toEqual(sortedOrig);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: DiceDeckService (mocked prisma)
// ---------------------------------------------------------------------------

jest.mock('../../config/database', () => ({
  prisma: {
    diceDeck: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

describe('DiceDeckService', () => {
  let service: DiceDeckService;

  const makeDeck = (position: number, deckData: DeckOutcome[]) => ({
    id: 'deck-1',
    campaignId: 'campaign-1',
    expression: '1d6',
    deck: deckData as unknown as Parameters<typeof prisma.diceDeck.create>[0]['data']['deck'],
    position,
    seed: 'test-seed',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    service = new DiceDeckService();
    jest.clearAllMocks();
  });

  describe('getDeck', () => {
    it('returns existing deck if found', async () => {
      const deckData = generateDeck('1d6');
      const dbDeck = makeDeck(0, deckData);
      (mockedPrisma.diceDeck.findUnique as jest.Mock).mockResolvedValue(dbDeck);

      const result = await service.getDeck('campaign-1', '1d6');
      expect(result).toBe(dbDeck);
    });

    it('creates a new deck when none exists', async () => {
      const deckData = generateDeck('1d6');
      const dbDeck = makeDeck(0, deckData);
      (mockedPrisma.diceDeck.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.diceDeck.create as jest.Mock).mockResolvedValue(dbDeck);

      const result = await service.getDeck('campaign-1', '1d6');
      expect(mockedPrisma.diceDeck.create).toHaveBeenCalledTimes(1);
      expect(result).toBe(dbDeck);
    });
  });

  describe('draw', () => {
    it('draws from current position and advances', async () => {
      const deckData = generateDeck('1d6');
      const shuffled = shuffleDeck(deckData, 'seed-1');
      const dbDeck = makeDeck(0, shuffled);

      (mockedPrisma.diceDeck.findUnique as jest.Mock).mockResolvedValue(dbDeck);
      (mockedPrisma.diceDeck.update as jest.Mock).mockResolvedValue({ ...dbDeck, position: 1 });

      const draw = await service.draw('campaign-1', '1d6');

      expect(draw.deckPosition).toBe(1);
      expect(draw.deckSize).toBe(6);
      expect(draw.outcome.total).toBeGreaterThanOrEqual(1);
      expect(draw.outcome.total).toBeLessThanOrEqual(6);
      expect(mockedPrisma.diceDeck.update).toHaveBeenCalledWith({
        where: { campaignId_expression: { campaignId: 'campaign-1', expression: '1d6' } },
        data: { position: 1 },
      });
    });

    it('reshuffles when deck is exhausted', async () => {
      const deckData = generateDeck('1d6');
      const shuffled = shuffleDeck(deckData, 'seed-exhausted');
      // Deck at position = length (fully exhausted)
      const exhaustedDeck = makeDeck(6, shuffled);
      const freshDeck = makeDeck(0, shuffleDeck(deckData, 'seed-fresh'));

      // First findUnique returns exhausted deck, second returns fresh deck
      (mockedPrisma.diceDeck.findUnique as jest.Mock)
        .mockResolvedValueOnce(exhaustedDeck)
        .mockResolvedValueOnce(freshDeck);
      (mockedPrisma.diceDeck.upsert as jest.Mock).mockResolvedValue(freshDeck);
      (mockedPrisma.diceDeck.update as jest.Mock).mockResolvedValue({ ...freshDeck, position: 1 });

      const draw = await service.draw('campaign-1', '1d6');

      expect(mockedPrisma.diceDeck.upsert).toHaveBeenCalledTimes(1); // reshuffle
      expect(draw.deckPosition).toBe(1);
    });
  });

  describe('verifyDeck', () => {
    it('returns valid=true for a fresh deck at position 0', async () => {
      const deckData = generateDeck('2d6');
      const dbDeck = makeDeck(0, shuffleDeck(deckData, 'verify-seed'));
      (mockedPrisma.diceDeck.findUnique as jest.Mock).mockResolvedValue(dbDeck);

      const result = await service.verifyDeck('campaign-1', '2d6');
      expect(result.valid).toBe(true);
      expect(result.chiSquared).toBe(0);
    });
  });
});
