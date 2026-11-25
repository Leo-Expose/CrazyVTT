import { contributeToPool, withdrawFromPool } from '../partyPool';
import { prisma } from '../../../config/database';
import type { Prisma } from '@prisma/client';

jest.mock('../../../config/database', () => ({
  prisma: {
    partyResourcePool: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    currencyContainer: { findFirst: jest.fn() },
    currencyTransaction: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const amounts = { cp: 5, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
const pool = { id: 'pool', cp: 10, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0, custom: null };
const container = { id: 'purse', cp: 10, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0, custom: null };

describe('party pool transfers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rolls back a contribution if its pool transaction record fails', async () => {
    let characterBalance = 10;
    jest.mocked(prisma.partyResourcePool.findUnique).mockResolvedValue(pool as never);
    jest.mocked(prisma.$transaction).mockImplementation(async (run) => {
      let stagedBalance = characterBalance;
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        partyResourcePool: { findUnique: jest.fn().mockResolvedValue(pool), update: jest.fn() },
        currencyContainer: {
          findMany: jest.fn().mockResolvedValue([container]),
          update: jest.fn().mockImplementation(() => { stagedBalance -= amounts.cp; }),
        },
        currencyTransaction: { create: jest.fn() },
        partyResourceTransaction: { create: jest.fn().mockRejectedValue(new Error('record failed')) },
      };
      const result = await run(tx as unknown as Prisma.TransactionClient);
      characterBalance = stagedBalance;
      return result as never;
    });

    await expect(contributeToPool('pool', 'character', amounts, 'user', 'deposit')).rejects.toThrow('record failed');
    expect(characterBalance).toBe(10);
  });

  it('keeps a withdrawal on its transaction client when recording fails', async () => {
    jest.mocked(prisma.partyResourcePool.findUnique).mockResolvedValue(pool as never);
    jest.mocked(prisma.$transaction).mockImplementation(async (run) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        partyResourcePool: { findUnique: jest.fn().mockResolvedValue(pool), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        currencyContainer: { findFirst: jest.fn().mockResolvedValue(container), update: jest.fn() },
        currencyTransaction: { create: jest.fn() },
        partyResourceTransaction: { create: jest.fn().mockRejectedValue(new Error('record failed')) },
      };
      return run(tx as unknown as Prisma.TransactionClient);
    });

    await expect(withdrawFromPool('pool', 'character', amounts, 'user', 'withdraw')).rejects.toThrow('record failed');
    expect(prisma.currencyContainer.findFirst).not.toHaveBeenCalled();
    expect(prisma.currencyTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects a withdrawal when another transaction already spent the balance', async () => {
    jest.mocked(prisma.partyResourcePool.findUnique).mockResolvedValue(pool as never);
    const updateContainer = jest.fn();
    jest.mocked(prisma.$transaction).mockImplementation(async (run) => {
      const tx = {
        partyResourcePool: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), update: jest.fn() },
        currencyContainer: { findFirst: jest.fn().mockResolvedValue(container), update: updateContainer },
        currencyTransaction: { create: jest.fn() },
        partyResourceTransaction: { create: jest.fn() },
      };
      return run(tx as unknown as Prisma.TransactionClient);
    });
    await expect(withdrawFromPool('pool', 'character', amounts, 'user', 'withdraw')).rejects.toThrow('Insufficient funds in pool');
    expect(updateContainer).not.toHaveBeenCalled();
  });
});
