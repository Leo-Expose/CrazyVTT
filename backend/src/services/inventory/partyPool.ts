/**
 * Party Resource Pool Service
 * Handles campaign-level shared resources (gold, consumables, etc.)
 * with atomic transactions, audit trail, and permission controls.
 */

import { PartyResourcePool, PartyResourceTransaction, GameSystem } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';

// Validation schemas
const createPoolSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  // D&D currencies
  cp: z.number().int().min(0).default(0),
  sp: z.number().int().min(0).default(0),
  ep: z.number().int().min(0).default(0),
  gp: z.number().int().min(0).default(0),
  pp: z.number().int().min(0).default(0),
  // Shadowrun
  nuyen: z.number().int().min(0).default(0),
  // Call of Cthulhu
  cash: z.number().min(0).default(0),
  // Custom currency (JSON for extensibility)
  custom: z.record(z.string(), z.number()).optional(),
  // Settings
  isDefault: z.boolean().default(false),
  allowPlayerWithdraw: z.boolean().default(true),
  createdById: z.string().uuid(),
});

const updatePoolSchema = createPoolSchema.partial().omit({ campaignId: true, createdById: true });

export interface PoolCurrencyAmount {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  nuyen: number;
  cash: number;
  custom?: Record<string, number>;
}

export interface FormattedPoolCurrency {
  display: string;
  shortDisplay: string;
  breakdown: PoolCurrencyAmount;
  totalInLowest: number; // Total in cp/nuyen/cash
}

export interface PoolWithDetails extends PartyResourcePool {
  transactionCount: number;
  recentTransactions: PartyResourceTransaction[];
}

/**
 * Get all resource pools for a campaign
 */
export async function getCampaignPools(campaignId: string): Promise<PartyResourcePool[]> {
  return prisma.partyResourcePool.findMany({
    where: { campaignId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
}

/**
 * Get a single pool with details
 */
export async function getPool(poolId: string): Promise<PoolWithDetails | null> {
  const pool = await prisma.partyResourcePool.findUnique({
    where: { id: poolId },
    include: {
      transactions: {
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          character: { select: { id: true, name: true } },
          createdBy: { select: { id: true, displayName: true } },
        },
      },
      _count: { select: { transactions: true } },
    },
  });

  if (!pool) return null;

  return {
    ...pool,
    transactionCount: pool._count.transactions,
    recentTransactions: pool.transactions,
  };
}

/**
 * Get pool with paginated transactions
 */
export async function getPoolTransactions(
  poolId: string,
  pagination: { page: number; limit: number }
): Promise<{ transactions: PartyResourceTransaction[]; total: number; totalPages: number }> {
  const { page, limit } = pagination;
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    prisma.partyResourceTransaction.findMany({
      where: { poolId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        character: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    }),
    prisma.partyResourceTransaction.count({ where: { poolId } }),
  ]);

  return {
    transactions,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Create a new resource pool
 */
export async function createPool(data: z.infer<typeof createPoolSchema>): Promise<PartyResourcePool> {
  const validated = createPoolSchema.parse(data);

  // If this is the default pool, ensure no other default exists
  if (validated.isDefault) {
    await prisma.partyResourcePool.updateMany({
      where: { campaignId: validated.campaignId, isDefault: true },
      data: { isDefault: false },
    });
  }

  return prisma.partyResourcePool.create({
    data: {
      campaignId: validated.campaignId,
      name: validated.name,
      description: validated.description,
      cp: validated.cp,
      sp: validated.sp,
      ep: validated.ep,
      gp: validated.gp,
      pp: validated.pp,
      nuyen: validated.nuyen,
      cash: validated.cash,
      custom: validated.custom,
      isDefault: validated.isDefault,
      allowPlayerWithdraw: validated.allowPlayerWithdraw,
      createdById: validated.createdById,
    },
  });
}

/**
 * Update pool settings (DM only)
 */
export async function updatePool(poolId: string, data: z.infer<typeof updatePoolSchema>): Promise<PartyResourcePool> {
  const validated = updatePoolSchema.parse(data);

  // If setting as default, unset other defaults
  if (validated.isDefault === true) {
    const pool = await prisma.partyResourcePool.findUnique({ where: { id: poolId } });
    if (pool) {
      await prisma.partyResourcePool.updateMany({
        where: { campaignId: pool.campaignId, isDefault: true, NOT: { id: poolId } },
        data: { isDefault: false },
      });
    }
  }

  return prisma.partyResourcePool.update({
    where: { id: poolId },
    data: validated,
  });
}

/**
 * Delete a pool (DM only, must be empty or force)
 */
export async function deletePool(poolId: string, force: boolean = false): Promise<void> {
  const pool = await prisma.partyResourcePool.findUnique({
    where: { id: poolId },
    include: { _count: { select: { transactions: true } } },
  });

  if (!pool) {
    throw new Error('Pool not found');
  }

  // Check if pool has currency (non-zero balances)
  const hasCurrency = pool.cp !== 0 || pool.sp !== 0 || pool.ep !== 0 || 
                     pool.gp !== 0 || pool.pp !== 0 || pool.nuyen !== 0 || 
                     pool.cash !== 0 || (pool.custom && Object.keys(pool.custom as object).length > 0);

  if (hasCurrency && !force) {
    throw new Error('Pool has currency. Use force=true to delete anyway, or spend/withdraw first.');
  }

  await prisma.partyResourcePool.delete({ where: { id: poolId } });
}

/**
 * Remove currency from character's containers (for contribution)
 * Uses default container first, then others if needed
 */
async function removeCurrencyFromCharacter(
  characterId: string,
  amounts: PoolCurrencyAmount,
  createdById: string,
  description: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const containers = await tx.currencyContainer.findMany({
      where: { characterId },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    });

    // Calculate total available
    const totalAvailable = containers.reduce(
      (acc, c) => ({
        cp: acc.cp + c.cp,
        sp: acc.sp + c.sp,
        ep: acc.ep + c.ep,
        gp: acc.gp + c.gp,
        pp: acc.pp + c.pp,
        nuyen: acc.nuyen + c.nuyen,
        cash: acc.cash + c.cash,
        custom: mergeCustom(acc.custom, c.custom as Record<string, number> | undefined),
      }),
      { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0, custom: {} }
    );

    // Check sufficient funds
    if (totalAvailable.cp < amounts.cp || totalAvailable.sp < amounts.sp ||
        totalAvailable.ep < amounts.ep || totalAvailable.gp < amounts.gp ||
        totalAvailable.pp < amounts.pp || totalAvailable.nuyen < amounts.nuyen ||
        totalAvailable.cash < amounts.cash) {
      throw new Error('Insufficient funds in character\'s containers');
    }

    // Remove from containers (default first, then others)
    let remaining = { ...amounts };
    for (const container of containers) {
      if (isEmpty(remaining)) break;

      const toRemove = {
        cp: Math.min(container.cp, remaining.cp),
        sp: Math.min(container.sp, remaining.sp),
        ep: Math.min(container.ep, remaining.ep),
        gp: Math.min(container.gp, remaining.gp),
        pp: Math.min(container.pp, remaining.pp),
        nuyen: Math.min(container.nuyen, remaining.nuyen),
        cash: Math.min(container.cash, remaining.cash),
        custom: {} as Record<string, number>,
      };

      if (remaining.custom) {
        for (const [key, value] of Object.entries(remaining.custom)) {
          const available = (container.custom as Record<string, number> | undefined)?.[key] ?? 0;
          toRemove.custom[key] = Math.min(available, value);
        }
      }

      if (!isEmpty(toRemove)) {
        await tx.currencyContainer.update({
          where: { id: container.id },
          data: {
            cp: { decrement: toRemove.cp },
            sp: { decrement: toRemove.sp },
            ep: { decrement: toRemove.ep },
            gp: { decrement: toRemove.gp },
            pp: { decrement: toRemove.pp },
            nuyen: { decrement: toRemove.nuyen },
            cash: { decrement: toRemove.cash },
            ...(Object.keys(toRemove.custom).length > 0 ? {
              custom: subtractCustom(container.custom as Record<string, number> || {}, toRemove.custom)
            } : {}),
          },
        });

        // Record character currency transaction
        await tx.currencyTransaction.create({
          data: {
            characterId,
            fromContainerId: container.id,
            type: 'REMOVE' as const,
            cp: toRemove.cp,
            sp: toRemove.sp,
            ep: toRemove.ep,
            gp: toRemove.gp,
            pp: toRemove.pp,
            nuyen: toRemove.nuyen,
            cash: toRemove.cash,
            custom: toRemove.custom,
            description: `Contributed to party pool: ${description}`,
            sourceType: 'MANUAL',
            createdById,
          },
        });

        remaining = subtractAmounts(remaining, toRemove);
      }
    }
  });
}

/**
 * Add currency to character's default container (for withdrawal)
 */
async function addCurrencyToCharacter(
  characterId: string,
  amounts: PoolCurrencyAmount,
  createdById: string,
  description: string
): Promise<void> {
  const container = await prisma.currencyContainer.findFirst({
    where: { characterId, isDefault: true },
  });

  if (!container) {
    // Create default container if it doesn't exist
    await prisma.currencyContainer.create({
      data: {
        characterId,
        name: 'Main Purse',
        isDefault: true,
        sortOrder: 0,
        cp: amounts.cp,
        sp: amounts.sp,
        ep: amounts.ep,
        gp: amounts.gp,
        pp: amounts.pp,
        nuyen: amounts.nuyen,
        cash: amounts.cash,
        custom: amounts.custom,
      },
    });
  } else {
    const existingCustom = (container.custom as Record<string, number> || {});
    const updateData: Record<string, any> = {
      cp: { increment: amounts.cp },
      sp: { increment: amounts.sp },
      ep: { increment: amounts.ep },
      gp: { increment: amounts.gp },
      pp: { increment: amounts.pp },
      nuyen: { increment: amounts.nuyen },
      cash: { increment: amounts.cash },
    };
    if (amounts.custom) {
      updateData.custom = { ...existingCustom, ...amounts.custom };
    }
    await prisma.currencyContainer.update({
      where: { id: container.id },
      data: updateData,
    });
  }

  // Record character currency transaction
  await prisma.currencyTransaction.create({
    data: {
      characterId,
      toContainerId: container?.id,
      type: 'ADD' as const,
      cp: amounts.cp,
      sp: amounts.sp,
      ep: amounts.ep,
      gp: amounts.gp,
      pp: amounts.pp,
      nuyen: amounts.nuyen,
      cash: amounts.cash,
      custom: amounts.custom,
      description: `Withdrawn from party pool: ${description}`,
      sourceType: 'MANUAL',
      createdById,
    },
  });
}

/**
 * Character contributes currency to pool
 * Atomic: removes from character, adds to pool, records transaction
 */
export async function contributeToPool(
  poolId: string,
  characterId: string,
  amounts: PoolCurrencyAmount,
  userId: string,
  description: string
): Promise<PartyResourcePool> {
  const pool = await prisma.partyResourcePool.findUnique({ where: { id: poolId } });
  if (!pool) throw new Error('Pool not found');

  await prisma.$transaction(async (tx) => {
    // Remove from character
    await removeCurrencyFromCharacter(characterId, amounts, userId, description);

    // Add to pool
    const updateData: Record<string, any> = {
      cp: { increment: amounts.cp },
      sp: { increment: amounts.sp },
      ep: { increment: amounts.ep },
      gp: { increment: amounts.gp },
      pp: { increment: amounts.pp },
      nuyen: { increment: amounts.nuyen },
      cash: { increment: amounts.cash },
    };
    if (amounts.custom) {
      updateData.custom = { ...(pool.custom as Record<string, number> || {}), ...amounts.custom };
    }
    await tx.partyResourcePool.update({
      where: { id: poolId },
      data: updateData,
    });

    // Record pool transaction
    await tx.partyResourceTransaction.create({
      data: {
        poolId,
        characterId,
        type: 'CONTRIBUTE',
        cp: amounts.cp,
        sp: amounts.sp,
        ep: amounts.ep,
        gp: amounts.gp,
        pp: amounts.pp,
        nuyen: amounts.nuyen,
        cash: amounts.cash,
        custom: amounts.custom,
        description,
        sourceType: 'MANUAL',
        createdById: userId,
      },
    });
  });

  return getPool(poolId) as Promise<PartyResourcePool>;
}

/**
 * Character withdraws currency from pool
 * Atomic: removes from pool, adds to character, records transaction
 */
export async function withdrawFromPool(
  poolId: string,
  characterId: string,
  amounts: PoolCurrencyAmount,
  userId: string,
  description: string
): Promise<PartyResourcePool> {
  const pool = await prisma.partyResourcePool.findUnique({ where: { id: poolId } });
  if (!pool) throw new Error('Pool not found');

  // Check pool has sufficient funds
  if (pool.cp < amounts.cp || pool.sp < amounts.sp || pool.ep < amounts.ep ||
      pool.gp < amounts.gp || pool.pp < amounts.pp || pool.nuyen < amounts.nuyen ||
      pool.cash < amounts.cash) {
    throw new Error('Insufficient funds in pool');
  }

  await prisma.$transaction(async (tx) => {
    // Remove from pool
    await tx.partyResourcePool.update({
      where: { id: poolId },
      data: {
        cp: { decrement: amounts.cp },
        sp: { decrement: amounts.sp },
        ep: { decrement: amounts.ep },
        gp: { decrement: amounts.gp },
        pp: { decrement: amounts.pp },
        nuyen: { decrement: amounts.nuyen },
        cash: { decrement: amounts.cash },
      } as any,
    });

    // Add to character
    await addCurrencyToCharacter(characterId, amounts, userId, description);

    // Record pool transaction
    await tx.partyResourceTransaction.create({
      data: {
        poolId,
        characterId,
        type: 'WITHDRAW',
        cp: amounts.cp,
        sp: amounts.sp,
        ep: amounts.ep,
        gp: amounts.gp,
        pp: amounts.pp,
        nuyen: amounts.nuyen,
        cash: amounts.cash,
        custom: amounts.custom,
        description,
        sourceType: 'MANUAL',
        createdById: userId,
      },
    });
  });

  return getPool(poolId) as Promise<PartyResourcePool>;
}

/**
 * DM adjusts pool directly (any amount, any direction)
 */
export async function adjustPool(
  poolId: string,
  amounts: PoolCurrencyAmount,
  userId: string,
  description: string,
  sourceType?: string,
  sourceId?: string
): Promise<PartyResourcePool> {
  const pool = await prisma.partyResourcePool.findUnique({ where: { id: poolId } });
  if (!pool) throw new Error('Pool not found');

  // Check if adjustment would make any currency negative
  if (pool.cp + amounts.cp < 0 || pool.sp + amounts.sp < 0 || pool.ep + amounts.ep < 0 ||
      pool.gp + amounts.gp < 0 || pool.pp + amounts.pp < 0 || pool.nuyen + amounts.nuyen < 0 ||
      pool.cash + amounts.cash < 0) {
    throw new Error('Adjustment would make pool balance negative');
  }

  await prisma.$transaction(async (tx) => {
    const updateData: Record<string, { increment: number } | { decrement: number } | Record<string, number>> = {};
    if (amounts.cp !== 0) updateData.cp = { increment: amounts.cp };
    if (amounts.sp !== 0) updateData.sp = { increment: amounts.sp };
    if (amounts.ep !== 0) updateData.ep = { increment: amounts.ep };
    if (amounts.gp !== 0) updateData.gp = { increment: amounts.gp };
    if (amounts.pp !== 0) updateData.pp = { increment: amounts.pp };
    if (amounts.nuyen !== 0) updateData.nuyen = { increment: amounts.nuyen };
    if (amounts.cash !== 0) updateData.cash = { increment: amounts.cash };
    if (amounts.custom) {
      updateData.custom = { ...(pool.custom as Record<string, number> || {}), ...amounts.custom };
    }

    await tx.partyResourcePool.update({
      where: { id: poolId },
      data: updateData as any,
    });

    // Record pool transaction (use absolute amounts for the transaction record)
    await tx.partyResourceTransaction.create({
      data: {
        poolId,
        characterId: null, // DM adjustment
        type: 'DM_ADJUST',
        cp: Math.abs(amounts.cp),
        sp: Math.abs(amounts.sp),
        ep: Math.abs(amounts.ep),
        gp: Math.abs(amounts.gp),
        pp: Math.abs(amounts.pp),
        nuyen: Math.abs(amounts.nuyen),
        cash: Math.abs(amounts.cash),
        custom: amounts.custom,
        description,
        sourceType,
        sourceId,
        createdById: userId,
      },
    });
  });

  return getPool(poolId) as Promise<PartyResourcePool>;
}

/**
 * DM spends from pool (shop, services, etc.)
 */
export async function spendFromPool(
  poolId: string,
  amounts: PoolCurrencyAmount,
  userId: string,
  description: string,
  sourceType: string,
  sourceId?: string
): Promise<PartyResourcePool> {
  const pool = await prisma.partyResourcePool.findUnique({ where: { id: poolId } });
  if (!pool) throw new Error('Pool not found');

  // Check pool has sufficient funds
  if (pool.cp < amounts.cp || pool.sp < amounts.sp || pool.ep < amounts.ep ||
      pool.gp < amounts.gp || pool.pp < amounts.pp || pool.nuyen < amounts.nuyen ||
      pool.cash < amounts.cash) {
    throw new Error('Insufficient funds in pool');
  }

  await prisma.$transaction(async (tx) => {
    // Remove from pool
    await tx.partyResourcePool.update({
      where: { id: poolId },
      data: {
        cp: { decrement: amounts.cp },
        sp: { decrement: amounts.sp },
        ep: { decrement: amounts.ep },
        gp: { decrement: amounts.gp },
        pp: { decrement: amounts.pp },
        nuyen: { decrement: amounts.nuyen },
        cash: { decrement: amounts.cash },
      } as any,
    });

    // Record pool transaction
    await tx.partyResourceTransaction.create({
      data: {
        poolId,
        characterId: null,
        type: 'SPEND',
        cp: amounts.cp,
        sp: amounts.sp,
        ep: amounts.ep,
        gp: amounts.gp,
        pp: amounts.pp,
        nuyen: amounts.nuyen,
        cash: amounts.cash,
        custom: amounts.custom,
        description,
        sourceType,
        sourceId,
        createdById: userId,
      },
    });
  });

  return getPool(poolId) as Promise<PartyResourcePool>;
}

/**
 * Deposit completed loot distribution into pool
 */
export async function depositLootToPool(
  distributionId: string,
  poolId: string,
  userId: string
): Promise<PartyResourcePool> {
  const [distribution, pool] = await Promise.all([
    prisma.lootDistribution.findUnique({
      where: { id: distributionId },
      include: { assignments: true },
    }),
    prisma.partyResourcePool.findUnique({ where: { id: poolId } }),
  ]);

  if (!distribution) throw new Error('Loot distribution not found');
  if (!pool) throw new Error('Pool not found');
  if (distribution.status !== 'COMPLETED') throw new Error('Distribution must be completed first');

  // Extract currency from distribution (JSON field)
  const currency = (distribution.currency as Record<string, unknown>) || {};

  await prisma.$transaction(async (tx) => {
    // Add to pool
    const updateData: Record<string, any> = {
      cp: { increment: currency.cp || 0 },
      sp: { increment: currency.sp || 0 },
      ep: { increment: currency.ep || 0 },
      gp: { increment: currency.gp || 0 },
      pp: { increment: currency.pp || 0 },
      nuyen: { increment: currency.nuyen || 0 },
      cash: { increment: currency.cash || 0 },
    };
    const currencyCustom = currency.custom as Record<string, number> | undefined;
    if (currencyCustom && typeof currencyCustom === 'object' && !Array.isArray(currencyCustom)) {
      updateData.custom = { ...(pool.custom as Record<string, number> || {}), ...currencyCustom };
    }

    await tx.partyResourcePool.update({
      where: { id: poolId },
      data: updateData,
    });

    // Record pool transaction
    await tx.partyResourceTransaction.create({
      data: {
        poolId,
        characterId: null,
        type: 'LOOT_DEPOSIT',
        cp: (currency.cp as number) || 0,
        sp: (currency.sp as number) || 0,
        ep: (currency.ep as number) || 0,
        gp: (currency.gp as number) || 0,
        pp: (currency.pp as number) || 0,
        nuyen: (currency.nuyen as number) || 0,
        cash: (currency.cash as number) || 0,
        custom: currency.custom as Record<string, number> | undefined,
        description: `Loot deposit: ${distribution.name}`,
        sourceType: 'LOOT',
        sourceId: distributionId,
        createdById: userId,
      },
    });
  });

  return getPool(poolId) as Promise<PartyResourcePool>;
}

/**
 * Format currency for display
 */
export function formatPoolCurrency(
  currency: PoolCurrencyAmount,
  gameSystem: GameSystem = GameSystem.DND_5E
): FormattedPoolCurrency {
  const parts: string[] = [];
  const shortParts: string[] = [];
  let totalInLowest = 0;

  switch (gameSystem) {
    case GameSystem.DND_5E:
    case GameSystem.PATHFINDER_2E: {
      const rates = gameSystem === GameSystem.PATHFINDER_2E ? { CP: 1, SP: 10, GP: 100, PP: 1000 } : { CP: 1, SP: 10, EP: 50, GP: 100, PP: 1000 };
      totalInLowest = 
        currency.cp * rates.CP +
        currency.sp * rates.SP +
        (currency.ep * (rates.EP || 0)) +
        currency.gp * rates.GP +
        currency.pp * rates.PP;

      if (currency.pp > 0) { parts.push(`${currency.pp}pp`); shortParts.push(`${currency.pp}pp`); }
      if (currency.gp > 0) { parts.push(`${currency.gp}gp`); shortParts.push(`${currency.gp}gp`); }
      if (currency.ep > 0) { parts.push(`${currency.ep}ep`); shortParts.push(`${currency.ep}ep`); }
      if (currency.sp > 0) { parts.push(`${currency.sp}sp`); shortParts.push(`${currency.sp}sp`); }
      if (currency.cp > 0) { parts.push(`${currency.cp}cp`); shortParts.push(`${currency.cp}cp`); }
      break;
    }
    case GameSystem.SHADOWRUN_6E: {
      totalInLowest = currency.nuyen;
      if (currency.nuyen > 0) { parts.push(`${currency.nuyen.toLocaleString()}¥`); shortParts.push(`${currency.nuyen.toLocaleString()}¥`); }
      break;
    }
    case GameSystem.CALL_OF_CTHULHU_7E: {
      totalInLowest = Math.round(currency.cash * 100); // cents
      if (currency.cash > 0) { parts.push(`$${currency.cash.toFixed(2)}`); shortParts.push(`$${currency.cash.toFixed(2)}`); }
      break;
    }
    default: {
      totalInLowest = currency.cp + currency.sp * 10 + currency.ep * 50 + currency.gp * 100 + currency.pp * 1000;
      if (currency.pp > 0) parts.push(`${currency.pp}pp`);
      if (currency.gp > 0) parts.push(`${currency.gp}gp`);
      if (currency.ep > 0) parts.push(`${currency.ep}ep`);
      if (currency.sp > 0) parts.push(`${currency.sp}sp`);
      if (currency.cp > 0) parts.push(`${currency.cp}cp`);
    }
  }

  return {
    display: parts.length > 0 ? parts.join(', ') : '—',
    shortDisplay: shortParts.length > 0 ? shortParts.join(' ') : '—',
    breakdown: currency,
    totalInLowest,
  };
}

// Helper functions
function mergeCustom(target: Record<string, number> | undefined, source: Record<string, number> | undefined): Record<string, number> {
  if (!source) return target || {};
  if (!target) return { ...source };
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    result[key] = (result[key] || 0) + value;
  }
  return result;
}

function subtractCustom(target: Record<string, number>, subtract: Record<string, number>): Record<string, number> {
  const result = { ...target };
  for (const [key, value] of Object.entries(subtract)) {
    result[key] = (result[key] || 0) - value;
    if (result[key] <= 0) delete result[key];
  }
  return result;
}

function subtractAmounts(a: PoolCurrencyAmount, b: PoolCurrencyAmount): PoolCurrencyAmount {
  return {
    cp: a.cp - b.cp,
    sp: a.sp - b.sp,
    ep: a.ep - b.ep,
    gp: a.gp - b.gp,
    pp: a.pp - b.pp,
    nuyen: a.nuyen - b.nuyen,
    cash: a.cash - b.cash,
    custom: a.custom ? subtractCustom(a.custom, b.custom || {}) : undefined,
  };
}

function isEmpty(amounts: PoolCurrencyAmount): boolean {
  return amounts.cp === 0 && amounts.sp === 0 && amounts.ep === 0 && 
         amounts.gp === 0 && amounts.pp === 0 && amounts.nuyen === 0 && 
         amounts.cash === 0 && (!amounts.custom || Object.keys(amounts.custom).length === 0);
}