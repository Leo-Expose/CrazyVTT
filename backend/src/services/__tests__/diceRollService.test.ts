// ============================================
// DiceRollService tests (Phase 12)
// ============================================

import { DiceRollService } from '../diceRollService';
import { DiceMode, RerollReason } from '@prisma/client';
import { prisma } from '../../config/database';

jest.mock('../../config/database', () => ({
  prisma: {
    campaign: { findUnique: jest.fn(), update: jest.fn() },
    diceRoll: { create: jest.fn(), findUnique: jest.fn() },
    diceDeck: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

function makeRoll(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'roll-1',
    campaignId: 'campaign-1',
    userId: 'user-1',
    expression: '1d20',
    result: 15,
    breakdown: null,
    characterName: null,
    purpose: null,
    secret: false,
    mode: DiceMode.TRUE_RANDOM,
    isReroll: false,
    originalRollId: null,
    rerollReason: null,
    rerollNumber: 0,
    deckPosition: null,
    deckSize: null,
    deckSeed: null,
    visibleTo: [],
    rolledAt: new Date(),
    ...overrides,
  };
}

describe('DiceRollService', () => {
  let service: DiceRollService;

  beforeEach(() => {
    service = new DiceRollService();
    jest.clearAllMocks();
  });

  describe('roll – TRUE_RANDOM mode', () => {
    it('uses true-random when campaign mode is TRUE_RANDOM', async () => {
      (mockedPrisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        diceMode: DiceMode.TRUE_RANDOM,
      });
      (mockedPrisma.diceRoll.create as jest.Mock).mockResolvedValue(makeRoll());

      const roll = await service.roll({
        campaignId: 'campaign-1',
        expression: '1d20',
        userId: 'user-1',
      });

      expect(roll.mode).toBe(DiceMode.TRUE_RANDOM);
      expect(mockedPrisma.diceRoll.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mode: DiceMode.TRUE_RANDOM }),
        }),
      );
    });

    it('respects forcedMode override regardless of campaign setting', async () => {
      (mockedPrisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        diceMode: DiceMode.TRUE_RANDOM,
      });
      // Deck path needs diceDeck to work
      (mockedPrisma.diceDeck.findUnique as jest.Mock).mockResolvedValue(null);
      const deckData = Array.from({ length: 6 }, (_, i) => ({ rolls: [i + 1], total: i + 1 }));
      const dbDeck = { id: 'd1', campaignId: 'campaign-1', expression: '1d6', deck: deckData, position: 0, seed: 's', createdAt: new Date(), updatedAt: new Date() };
      (mockedPrisma.diceDeck.create as jest.Mock).mockResolvedValue(dbDeck);
      (mockedPrisma.diceDeck.update as jest.Mock).mockResolvedValue({ ...dbDeck, position: 1 });
      (mockedPrisma.diceRoll.create as jest.Mock).mockResolvedValue(
        makeRoll({ expression: '1d6', mode: DiceMode.WEIGHTED_DECK }),
      );

      const roll = await service.roll({
        campaignId: 'campaign-1',
        expression: '1d6',
        userId: 'user-1',
        forcedMode: DiceMode.WEIGHTED_DECK,
      });

      expect(roll.mode).toBe(DiceMode.WEIGHTED_DECK);
    });
  });

  describe('roll – reroll chains', () => {
    it('stores rerollOf and rerollReason when specified', async () => {
      (mockedPrisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        diceMode: DiceMode.TRUE_RANDOM,
      });
      (mockedPrisma.diceRoll.findUnique as jest.Mock).mockResolvedValue(
        makeRoll({ rerollNumber: 0 }),
      );
      const expectedRoll = makeRoll({
        isReroll: true,
        originalRollId: 'roll-1',
        rerollReason: RerollReason.ADVANTAGE,
        rerollNumber: 1,
      });
      (mockedPrisma.diceRoll.create as jest.Mock).mockResolvedValue(expectedRoll);

      const roll = await service.roll({
        campaignId: 'campaign-1',
        expression: '1d20',
        userId: 'user-1',
        rerollOf: 'roll-1',
        rerollReason: RerollReason.ADVANTAGE,
      });

      expect(mockedPrisma.diceRoll.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isReroll: true,
            originalRollId: 'roll-1',
            rerollReason: RerollReason.ADVANTAGE,
            rerollNumber: 1,
          }),
        }),
      );
      expect(roll.isReroll).toBe(true);
    });
  });

  describe('setCampaignMode', () => {
    it('updates campaign diceMode in DB', async () => {
      (mockedPrisma.campaign.update as jest.Mock).mockResolvedValue({});

      await service.setCampaignMode('campaign-1', DiceMode.WEIGHTED_DECK);

      expect(mockedPrisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
        data: { diceMode: DiceMode.WEIGHTED_DECK },
      });
    });
  });

  describe('getDeckOutcomes', () => {
    it('returns correct number of outcomes for 2d6', () => {
      const outcomes = service.getDeckOutcomes('2d6');
      expect(outcomes).toHaveLength(36);
    });

    it('returns correct number of outcomes for 1d20', () => {
      const outcomes = service.getDeckOutcomes('1d20');
      expect(outcomes).toHaveLength(20);
    });
  });

  describe('roll – invalid expression', () => {
    it('throws for an unsupported expression', async () => {
      (mockedPrisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        diceMode: DiceMode.TRUE_RANDOM,
      });

      // parseDiceExpression will throw DiceParserError for nonsense
      await expect(
        service.roll({ campaignId: 'campaign-1', expression: 'not-dice', userId: 'user-1' }),
      ).rejects.toThrow(/Invalid dice expression/i);

      expect(mockedPrisma.diceRoll.create).not.toHaveBeenCalled();
    });
  });
});
