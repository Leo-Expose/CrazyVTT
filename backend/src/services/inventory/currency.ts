/**
 * Currency Service
 * Handles auto-conversion, container tracking, and transactions
 */

import { CurrencyContainer, TransactionType, GameSystem, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';

// Currency conversion rates (D&D 5e standard)
const DND_CONVERSION_RATES = {
  CP: 1,
  SP: 10,
  EP: 50,
  GP: 100,
  PP: 1000,
};

const PF2E_CONVERSION_RATES = {
  CP: 1,
  SP: 10,
  GP: 100,
  PP: 1000,
};

const SHADOWRUN_RATES = {
  NUYEN: 1,
};

const COC_RATES = {
  CASH: 1,
};

// Validation schemas
const addCurrencySchema = z.object({
  characterId: z.string().uuid(),
  containerId: z.string().uuid().optional(),
  cp: z.number().int().min(0).default(0),
  sp: z.number().int().min(0).default(0),
  ep: z.number().int().min(0).default(0),
  gp: z.number().int().min(0).default(0),
  pp: z.number().int().min(0).default(0),
  nuyen: z.number().int().min(0).default(0),
  cash: z.number().min(0).default(0),
  custom: z.record(z.string(), z.number()).optional(),
  description: z.string(),
  sourceType: z.enum(['SHOP', 'LOOT', 'TRADE', 'MANUAL', 'CONVERSION']).default('MANUAL'),
  sourceId: z.string().optional(),
  createdById: z.string().uuid(),
});

const transferCurrencySchema = z.object({
  characterId: z.string().uuid(),
  fromContainerId: z.string().uuid(),
  toContainerId: z.string().uuid().optional(), // optional = main pool
  cp: z.number().int().min(0).default(0),
  sp: z.number().int().min(0).default(0),
  ep: z.number().int().min(0).default(0),
  gp: z.number().int().min(0).default(0),
  pp: z.number().int().min(0).default(0),
  nuyen: z.number().int().min(0).default(0),
  cash: z.number().min(0).default(0),
  custom: z.record(z.string(), z.number()).optional(),
  description: z.string(),
  createdById: z.string().uuid(),
});

const convertCurrencySchema = z.object({
  characterId: z.string().uuid(),
  containerId: z.string().uuid().optional(),
  fromCurrency: z.enum(['CP', 'SP', 'EP', 'GP', 'PP', 'NUYEN', 'CASH']),
  toCurrency: z.enum(['CP', 'SP', 'EP', 'GP', 'PP', 'NUYEN', 'CASH']),
  amount: z.number().int().min(1),
  createdById: z.string().uuid(),
});

export interface CurrencyAmount {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  nuyen: number;
  cash: number;
  custom?: Record<string, number>;
}

export interface FormattedCurrency {
  display: string;
  shortDisplay: string;
  breakdown: CurrencyAmount;
  totalInLowest: number; // Total in cp/nuyen/cash
}

/**
 * Get all currency containers for a character
 */
export async function getCurrencyContainers(characterId: string): Promise<CurrencyContainer[]> {
  return prisma.currencyContainer.findMany({
    where: { characterId },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
  });
}

/**
 * Get total currency across all containers
 */
export async function getTotalCurrency(characterId: string): Promise<CurrencyAmount> {
  const containers = await getCurrencyContainers(characterId);
  
  return containers.reduce(
    (total, container) => ({
      cp: total.cp + container.cp,
      sp: total.sp + container.sp,
      ep: total.ep + container.ep,
      gp: total.gp + container.gp,
      pp: total.pp + container.pp,
      nuyen: total.nuyen + container.nuyen,
      cash: total.cash + container.cash,
      custom: mergeCustom(total.custom, container.custom as Record<string, number> | undefined),
    }),
    { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0, custom: {} }
  );
}

/**
 * Get currency in a specific container
 */
export async function getContainerCurrency(containerId: string): Promise<CurrencyAmount | null> {
  const container = await prisma.currencyContainer.findUnique({
    where: { id: containerId },
  });

  if (!container) return null;

  return {
    cp: container.cp,
    sp: container.sp,
    ep: container.ep,
    gp: container.gp,
    pp: container.pp,
    nuyen: container.nuyen,
    cash: container.cash,
    custom: container.custom as Record<string, number> | undefined,
  };
}

/**
 * Add currency to a container (or default)
 */
export async function addCurrency(data: z.infer<typeof addCurrencySchema>) {
  const validated = addCurrencySchema.parse(data);

  const foundContainer = validated.containerId
    ? await prisma.currencyContainer.findUnique({
      where: { id: validated.containerId },
    })
    : await prisma.currencyContainer.findFirst({
      where: { characterId: validated.characterId, isDefault: true },
    });

  if (validated.containerId) {
    if (!foundContainer) {
      throw new Error('Container not found');
    }
    if (foundContainer.characterId !== validated.characterId) {
      throw new Error('Container belongs to different character');
    }
  }

  const container = foundContainer ?? await prisma.currencyContainer.create({
        data: {
          characterId: validated.characterId,
          name: 'Main Purse',
          isDefault: true,
          sortOrder: 0,
        },
      });

  // Update container currency
  const updatedContainer = await prisma.currencyContainer.update({
    where: { id: container.id },
    data: {
      cp: { increment: validated.cp },
      sp: { increment: validated.sp },
      ep: { increment: validated.ep },
      gp: { increment: validated.gp },
      pp: { increment: validated.pp },
      nuyen: { increment: validated.nuyen },
      cash: { increment: validated.cash },
      custom: validated.custom 
        ? { ...(container.custom as Record<string, number> || {}), ...validated.custom }
        : undefined,
    },
  });

  // Record transaction
  await recordTransaction({
    characterId: validated.characterId,
    toContainerId: container.id,
    type: TransactionType.ADD,
    cp: validated.cp,
    sp: validated.sp,
    ep: validated.ep,
    gp: validated.gp,
    pp: validated.pp,
    nuyen: validated.nuyen,
    cash: validated.cash,
    custom: validated.custom,
    description: validated.description,
    sourceType: validated.sourceType,
    sourceId: validated.sourceId,
    createdById: validated.createdById,
  });

  // Auto-convert if over thresholds
  await autoConvertCurrency(container.id, container.characterId);

  return updatedContainer;
}

/**
 * Remove currency from a container
 */
export async function removeCurrency(data: z.infer<typeof addCurrencySchema>) {
  const validated = addCurrencySchema.parse(data);

  const container = validated.containerId
    ? await prisma.currencyContainer.findUnique({
      where: { id: validated.containerId },
    })
    : await prisma.currencyContainer.findFirst({
      where: { characterId: validated.characterId, isDefault: true },
    });

  if (!container) {
    throw new Error('Container not found');
  }

  // Check sufficient funds
  if (container.cp < validated.cp || container.sp < validated.sp || 
      container.ep < validated.ep || container.gp < validated.gp ||
      container.pp < validated.pp || container.nuyen < validated.nuyen ||
      container.cash < validated.cash) {
    throw new Error('Insufficient funds in container');
  }

  const updatedContainer = await prisma.currencyContainer.update({
    where: { id: container.id },
    data: {
      cp: { decrement: validated.cp },
      sp: { decrement: validated.sp },
      ep: { decrement: validated.ep },
      gp: { decrement: validated.gp },
      pp: { decrement: validated.pp },
      nuyen: { decrement: validated.nuyen },
      cash: { decrement: validated.cash },
    },
  });

  // Record transaction
  await recordTransaction({
    characterId: validated.characterId,
    fromContainerId: container.id,
    type: TransactionType.REMOVE,
    cp: validated.cp,
    sp: validated.sp,
    ep: validated.ep,
    gp: validated.gp,
    pp: validated.pp,
    nuyen: validated.nuyen,
    cash: validated.cash,
    custom: validated.custom,
    description: validated.description,
    sourceType: validated.sourceType,
    sourceId: validated.sourceId,
    createdById: validated.createdById,
  });

  return updatedContainer;
}

/**
 * Transfer currency between containers
 */
export async function transferCurrency(data: z.infer<typeof transferCurrencySchema>) {
  const validated = transferCurrencySchema.parse(data);

  const fromContainer = await prisma.currencyContainer.findUnique({
    where: { id: validated.fromContainerId },
  });

  if (!fromContainer) {
    throw new Error('Source container not found');
  }

  if (fromContainer.characterId !== validated.characterId) {
    throw new Error('Source container belongs to different character');
  }

  // Check sufficient funds
  if (fromContainer.cp < validated.cp || fromContainer.sp < validated.sp || 
      fromContainer.ep < validated.ep || fromContainer.gp < validated.gp ||
      fromContainer.pp < validated.pp || fromContainer.nuyen < validated.nuyen ||
      fromContainer.cash < validated.cash) {
    throw new Error('Insufficient funds in source container');
  }

  let toContainer: CurrencyContainer | null = null;

  if (validated.toContainerId) {
    toContainer = await prisma.currencyContainer.findUnique({
      where: { id: validated.toContainerId },
    });
    if (!toContainer) {
      throw new Error('Target container not found');
    }
    if (toContainer.characterId !== validated.characterId) {
      throw new Error('Target container belongs to different character');
    }
  } else {
    // Transfer to default/main pool
    toContainer = await prisma.currencyContainer.findFirst({
      where: { characterId: validated.characterId, isDefault: true },
    });
    if (!toContainer) {
      toContainer = await prisma.currencyContainer.create({
        data: {
          characterId: validated.characterId,
          name: 'Main Purse',
          isDefault: true,
          sortOrder: 0,
        },
      });
    }
  }

  // Perform transfer
  await prisma.$transaction(async (tx) => {
    // Decrement from source
    await tx.currencyContainer.update({
      where: { id: fromContainer.id },
      data: {
        cp: { decrement: validated.cp },
        sp: { decrement: validated.sp },
        ep: { decrement: validated.ep },
        gp: { decrement: validated.gp },
        pp: { decrement: validated.pp },
        nuyen: { decrement: validated.nuyen },
        cash: { decrement: validated.cash },
      },
    });

    // Increment to target
    await tx.currencyContainer.update({
      where: { id: toContainer!.id },
      data: {
        cp: { increment: validated.cp },
        sp: { increment: validated.sp },
        ep: { increment: validated.ep },
        gp: { increment: validated.gp },
        pp: { increment: validated.pp },
        nuyen: { increment: validated.nuyen },
        cash: { increment: validated.cash },
      },
    });
  });

  // Record transaction
  await recordTransaction({
    characterId: validated.characterId,
    fromContainerId: fromContainer.id,
    toContainerId: toContainer.id,
    type: TransactionType.TRANSFER,
    cp: validated.cp,
    sp: validated.sp,
    ep: validated.ep,
    gp: validated.gp,
    pp: validated.pp,
    nuyen: validated.nuyen,
    cash: validated.cash,
    custom: validated.custom,
    description: validated.description,
    sourceType: 'MANUAL',
    createdById: validated.createdById,
  });

  return { fromContainer, toContainer };
}

/**
 * Auto-convert currency (10 cp = 1 sp, etc.)
 */
export async function autoConvertCurrency(containerId: string, characterId: string, gameSystem: GameSystem = GameSystem.DND_5E) {
  const container = await prisma.currencyContainer.findUnique({
    where: { id: containerId },
  });

  if (!container) return;

  const rates = getConversionRates(gameSystem);
  let converted = false;

  // Convert CP to SP
  if (container.cp >= rates.SP) {
    const spGained = Math.floor(container.cp / rates.SP);
    await prisma.currencyContainer.update({
      where: { id: containerId },
      data: {
        cp: { decrement: spGained * rates.SP },
        sp: { increment: spGained },
      },
    });
    converted = true;
  }

  // Convert SP to EP (D&D only)
  if (gameSystem === GameSystem.DND_5E && container.sp >= rates.EP / rates.SP) {
    const epGained = Math.floor(container.sp / (rates.EP / rates.SP));
    await prisma.currencyContainer.update({
      where: { id: containerId },
      data: {
        sp: { decrement: epGained * (rates.EP / rates.SP) },
        ep: { increment: epGained },
      },
    });
    converted = true;
  }

  // Convert SP/EP to GP
  const gpFromSp = Math.floor(container.sp / (rates.GP / rates.SP));
  if (gpFromSp > 0) {
    await prisma.currencyContainer.update({
      where: { id: containerId },
      data: {
        sp: { decrement: gpFromSp * (rates.GP / rates.SP) },
        gp: { increment: gpFromSp },
      },
    });
    converted = true;
  }

  if (gameSystem === GameSystem.DND_5E) {
    const gpFromEp = Math.floor(container.ep / (rates.GP / rates.EP));
    if (gpFromEp > 0) {
      await prisma.currencyContainer.update({
        where: { id: containerId },
        data: {
          ep: { decrement: gpFromEp * (rates.GP / rates.EP) },
          gp: { increment: gpFromEp },
        },
      });
      converted = true;
    }
  }

  // Convert GP to PP
  const ppGained = Math.floor(container.gp / (rates.PP / rates.GP));
  if (ppGained > 0) {
    await prisma.currencyContainer.update({
      where: { id: containerId },
      data: {
        gp: { decrement: ppGained * (rates.PP / rates.GP) },
        pp: { increment: ppGained },
      },
    });
    converted = true;
  }

  if (converted) {
    await recordTransaction({
      characterId,
      toContainerId: containerId,
      type: TransactionType.CONVERT,
      description: 'Auto-converted currency to higher denominations',
      sourceType: 'CONVERSION',
      createdById: 'SYSTEM',
    });
  }
}

/**
 * Convert currency between denominations
 */
export async function convertCurrency(data: z.infer<typeof convertCurrencySchema>) {
  const validated = convertCurrencySchema.parse(data);

  const container = validated.containerId
    ? await prisma.currencyContainer.findUnique({ where: { id: validated.containerId } })
    : await prisma.currencyContainer.findFirst({ 
        where: { characterId: validated.characterId, isDefault: true } 
      });

  if (!container) {
    throw new Error('Container not found');
  }

  const rates = getConversionRates(
    await getCharacterGameSystem(validated.characterId)
  );

  const fromValue = rates[validated.fromCurrency] || 1;
  const toValue = rates[validated.toCurrency] || 1;

  // Calculate total value in lowest denomination
  const totalValue = validated.amount * fromValue;
  const convertedAmount = Math.floor(totalValue / toValue);
  const remainder = totalValue % toValue;

  // Check if we have enough
  const currentAmount = getContainerCurrencyValue(container, validated.fromCurrency, rates);
  if (currentAmount < validated.amount) {
    throw new Error(`Insufficient ${validated.fromCurrency} to convert`);
  }

  await prisma.$transaction(async (tx) => {
    // Decrement from currency
    await decrementCurrency(tx, container.id, validated.fromCurrency, validated.amount);
    
    // Increment to currency
    await incrementCurrency(tx, container.id, validated.toCurrency, convertedAmount);
    
    // Add remainder back to from currency (if any)
    if (remainder > 0) {
      await incrementCurrency(tx, container.id, validated.fromCurrency, remainder / fromValue);
    }
  });

  await recordTransaction({
    characterId: validated.characterId,
    toContainerId: container.id,
    type: TransactionType.CONVERT,
    description: `Converted ${validated.amount} ${validated.fromCurrency} to ${convertedAmount} ${validated.toCurrency}`,
    sourceType: 'CONVERSION',
    createdById: validated.createdById,
  });

  return { convertedAmount, remainder };
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: CurrencyAmount, gameSystem: GameSystem = GameSystem.DND_5E): FormattedCurrency {
  const rates = getConversionRates(gameSystem);
  
  let totalInLowest = 0;
  const parts: string[] = [];
  const shortParts: string[] = [];

  if (gameSystem === GameSystem.DND_5E || gameSystem === GameSystem.PATHFINDER_2E) {
    // D&D 5e / PF2e format
    if (amount.pp > 0) {
      parts.push(`${amount.pp.toLocaleString()} pp`);
      shortParts.push(`${amount.pp}pp`);
      totalInLowest += amount.pp * rates.PP;
    }
    if (amount.gp > 0) {
      parts.push(`${amount.gp.toLocaleString()} gp`);
      shortParts.push(`${amount.gp}gp`);
      totalInLowest += amount.gp * rates.GP;
    }
    if (gameSystem === GameSystem.DND_5E && amount.ep > 0) {
      parts.push(`${amount.ep.toLocaleString()} ep`);
      shortParts.push(`${amount.ep}ep`);
      totalInLowest += amount.ep * rates.EP;
    }
    if (amount.sp > 0) {
      parts.push(`${amount.sp.toLocaleString()} sp`);
      shortParts.push(`${amount.sp}sp`);
      totalInLowest += amount.sp * rates.SP;
    }
    if (amount.cp > 0) {
      parts.push(`${amount.cp.toLocaleString()} cp`);
      shortParts.push(`${amount.cp}cp`);
      totalInLowest += amount.cp;
    }
  } else if (gameSystem === GameSystem.SHADOWRUN_6E) {
    // Shadowrun format
    if (amount.nuyen > 0) {
      parts.push(`¥${amount.nuyen.toLocaleString()}`);
      shortParts.push(`¥${amount.nuyen}`);
      totalInLowest += amount.nuyen;
    }
  } else if (gameSystem === GameSystem.CALL_OF_CTHULHU_7E) {
    // CoC format
    if (amount.cash > 0) {
      parts.push(`$${amount.cash.toLocaleString()}`);
      shortParts.push(`$${amount.cash}`);
      totalInLowest += amount.cash;
    }
  }

  // Add custom currencies
  if (amount.custom) {
    for (const [currency, value] of Object.entries(amount.custom)) {
      if (value > 0) {
        parts.push(`${value.toLocaleString()} ${currency}`);
        shortParts.push(`${value}${currency}`);
      }
    }
  }

  return {
    display: parts.length > 0 ? parts.join(', ') : '—',
    shortDisplay: shortParts.length > 0 ? shortParts.join(' ') : '—',
    breakdown: amount,
    totalInLowest,
  };
}

/**
 * Format currency with container info
 */
export function formatCurrencyWithContainer(
  amount: CurrencyAmount, 
  containerName: string,
  gameSystem: GameSystem = GameSystem.DND_5E
): string {
  const formatted = formatCurrency(amount, gameSystem);
  return `${formatted.display} (in ${containerName})`;
}

/**
 * Split currency evenly among party members
 */
export async function splitCurrencyEvenly(
  characterIds: string[],
  totalAmount: CurrencyAmount,
  gameSystem: GameSystem = GameSystem.DND_5E,
  createdById: string
): Promise<{ characterId: string; amount: CurrencyAmount; remainder: CurrencyAmount }[]> {
  const count = characterIds.length;
  if (count === 0) return [];

  const rates = getConversionRates(gameSystem);
  
  // Convert everything to lowest denomination
  let totalInLowest = 0;
  totalInLowest += totalAmount.cp * (rates.CP || 1);
  totalInLowest += totalAmount.sp * (rates.SP || 1);
  totalInLowest += totalAmount.ep * (rates.EP || 1);
  totalInLowest += totalAmount.gp * (rates.GP || 1);
  totalInLowest += totalAmount.pp * (rates.PP || 1);
  totalInLowest += totalAmount.nuyen;
  totalInLowest += totalAmount.cash;

  const shareInLowest = Math.floor(totalInLowest / count);
  const remainderInLowest = totalInLowest % count;

  const results = [];
  
  for (let i = 0; i < count; i++) {
    const characterId = characterIds[i];
    let share = shareInLowest;
    
    // Give remainder to first few characters (or DM)
    if (i < remainderInLowest) {
      share += 1;
    }

    // Convert back to denominations
    const shareAmount = convertFromLowest(share, rates, gameSystem);
    
    // Add to character's default container
    if (Object.values(shareAmount).some(v => v > 0)) {
      await addCurrency({
        characterId,
        ...shareAmount,
        description: `Split from party loot (${count} ways)`,
        sourceType: 'LOOT',
        createdById,
      });
    }

    results.push({
      characterId,
      amount: shareAmount,
      remainder: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 },
    });
  }

  return results;
}

/**
 * Get transaction history for a character
 */
export async function getTransactionHistory(characterId: string, limit: number = 50) {
  return prisma.currencyTransaction.findMany({
    where: { characterId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      fromContainer: { select: { id: true, name: true } },
      toContainer: { select: { id: true, name: true } },
      createdBy: { select: { id: true, displayName: true } },
    },
  });
}

/**
 * Create a currency container linked to an inventory container
 */
export async function createCurrencyContainer(
  characterId: string,
  name: string,
  inventoryContainerId: string,
  sortOrder: number = 0
) {
  return prisma.currencyContainer.create({
    data: {
      characterId,
      containerId: inventoryContainerId,
      name,
      sortOrder,
    },
  });
}

/**
 * Get character's game system
 */
async function getCharacterGameSystem(characterId: string): Promise<GameSystem> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { gameSystem: true },
  });
  return character?.gameSystem || GameSystem.DND_5E;
}

/**
 * Get conversion rates for a game system
 */
export function getConversionRates(gameSystem: GameSystem): Record<string, number> {
  switch (gameSystem) {
    case GameSystem.DND_5E:
      return DND_CONVERSION_RATES;
    case GameSystem.PATHFINDER_2E:
      return PF2E_CONVERSION_RATES;
    case GameSystem.SHADOWRUN_6E:
      return SHADOWRUN_RATES;
    case GameSystem.CALL_OF_CTHULHU_7E:
      return COC_RATES;
    default:
      return DND_CONVERSION_RATES;
  }
}

/**
 * Convert from lowest denomination to structured currency
 */
export function convertFromLowest(
  totalInLowest: number, 
  rates: Record<string, number>, 
  gameSystem: GameSystem
): CurrencyAmount {
  let remaining = totalInLowest;
  const result: CurrencyAmount = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };

  if (gameSystem === GameSystem.DND_5E) {
    result.pp = Math.floor(remaining / rates.PP);
    remaining %= rates.PP;
    result.gp = Math.floor(remaining / rates.GP);
    remaining %= rates.GP;
    result.ep = Math.floor(remaining / rates.EP);
    remaining %= rates.EP;
    result.sp = Math.floor(remaining / rates.SP);
    remaining %= rates.SP;
    result.cp = remaining;
  } else if (gameSystem === GameSystem.PATHFINDER_2E) {
    result.pp = Math.floor(remaining / rates.PP);
    remaining %= rates.PP;
    result.gp = Math.floor(remaining / rates.GP);
    remaining %= rates.GP;
    result.sp = Math.floor(remaining / rates.SP);
    remaining %= rates.SP;
    result.cp = remaining;
  } else if (gameSystem === GameSystem.SHADOWRUN_6E) {
    result.nuyen = remaining;
  } else if (gameSystem === GameSystem.CALL_OF_CTHULHU_7E) {
    result.cash = remaining;
  }

  return result;
}

/**
 * Get currency value from container in lowest denomination
 */
function getContainerCurrencyValue(
  container: CurrencyContainer, 
  currency: string, 
  _rates: Record<string, number>
): number {
  switch (currency) {
    case 'CP': return container.cp;
    case 'SP': return container.sp;
    case 'EP': return container.ep;
    case 'GP': return container.gp;
    case 'PP': return container.pp;
    case 'NUYEN': return container.nuyen;
    case 'CASH': return container.cash;
    default: return 0;
  }
}

/**
 * Decrement currency in transaction
 */
async function decrementCurrency(
  tx: Prisma.TransactionClient,
  containerId: string, 
  currency: z.infer<typeof convertCurrencySchema>['fromCurrency'],
  amount: number
) {
  const fieldMap: Record<z.infer<typeof convertCurrencySchema>['fromCurrency'], keyof CurrencyContainer> = {
    CP: 'cp',
    SP: 'sp',
    EP: 'ep',
    GP: 'gp',
    PP: 'pp',
    NUYEN: 'nuyen',
    CASH: 'cash',
  };
  
  const field = fieldMap[currency];
  if (!field) throw new Error(`Unknown currency: ${currency}`);
  
  await tx.currencyContainer.update({
    where: { id: containerId },
    data: { [field]: { decrement: amount } },
  });
}

/**
 * Increment currency in transaction
 */
async function incrementCurrency(
  tx: Prisma.TransactionClient,
  containerId: string, 
  currency: z.infer<typeof convertCurrencySchema>['fromCurrency'],
  amount: number
) {
  const fieldMap: Record<z.infer<typeof convertCurrencySchema>['fromCurrency'], keyof CurrencyContainer> = {
    CP: 'cp',
    SP: 'sp',
    EP: 'ep',
    GP: 'gp',
    PP: 'pp',
    NUYEN: 'nuyen',
    CASH: 'cash',
  };
  
  const field = fieldMap[currency];
  if (!field) throw new Error(`Unknown currency: ${currency}`);
  
  await tx.currencyContainer.update({
    where: { id: containerId },
    data: { [field]: { increment: amount } },
  });
}

/**
 * Record a currency transaction
 */
async function recordTransaction(data: {
  characterId: string;
  fromContainerId?: string;
  toContainerId?: string;
  type: TransactionType;
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
  nuyen?: number;
  cash?: number;
  custom?: Record<string, number>;
  description: string;
  sourceType: string;
  sourceId?: string;
  createdById: string;
}) {
  await prisma.currencyTransaction.create({
    data: {
      characterId: data.characterId,
      fromContainerId: data.fromContainerId,
      toContainerId: data.toContainerId,
      type: data.type,
      cp: data.cp || 0,
      sp: data.sp || 0,
      ep: data.ep || 0,
      gp: data.gp || 0,
      pp: data.pp || 0,
      nuyen: data.nuyen || 0,
      cash: data.cash || 0,
      custom: data.custom,
      description: data.description,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      createdById: data.createdById,
    },
  });
}

/**
 * Merge custom currency objects
 */
export function mergeCustom(a?: Record<string, number>, b?: Record<string, number>): Record<string, number> {
  const result = { ...a };
  if (b) {
    for (const [key, value] of Object.entries(b)) {
      result[key] = (result[key] || 0) + value;
    }
  }
  return result;
}

export default {
  getCurrencyContainers,
  getTotalCurrency,
  getContainerCurrency,
  addCurrency,
  removeCurrency,
  transferCurrency,
  autoConvertCurrency,
  convertCurrency,
  formatCurrency,
  formatCurrencyWithContainer,
  splitCurrencyEvenly,
  getTransactionHistory,
  createCurrencyContainer,
};
