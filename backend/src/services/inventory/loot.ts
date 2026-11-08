/**
 * Loot Distribution Service
 * Handles loot drops, party splitting, and distribution workflows
 */

import { Prisma, LootDistribution, LootAssignment, LootStatus, GameSystem } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { readCharacterInventory, toPrismaJson } from './characterData';

// Validation schemas
const createLootDistributionSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(200),
  sourceType: z.enum(['CREATURE', 'MANUAL', 'TABLE', 'SHOP']),
  sourceId: z.string().optional(),
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    quantity: z.number().int().min(1).default(1),
    weight: z.number().min(0).optional(),
    value: z.number().min(0).optional(),
    valueCurrency: z.enum(['CP', 'SP', 'EP', 'GP', 'PP']).optional(),
    requiresAttunement: z.boolean().optional(),
    attuned: z.boolean().optional(),
    magical: z.boolean().optional(),
    charges: z.object({
      max: z.number().int().min(0),
      current: z.number().int().min(0),
      recharge: z.string().optional(),
    }).optional(),
    description: z.string().optional(),
  })).optional(),
  currency: z.object({
    cp: z.number().int().min(0).default(0),
    sp: z.number().int().min(0).default(0),
    ep: z.number().int().min(0).default(0),
    gp: z.number().int().min(0).default(0),
    pp: z.number().int().min(0).default(0),
    nuyen: z.number().int().min(0).default(0),
    cash: z.number().min(0).default(0),
  }).optional(),
  createdById: z.string().uuid(),
});

const assignLootSchema = z.object({
  distributionId: z.string().uuid(),
  characterId: z.string().uuid(),
  assignedItems: z.array(z.object({
    itemId: z.string(),
    quantity: z.number().int().min(1),
  })).optional(),
  assignedCurrency: z.object({
    cp: z.number().int().min(0).default(0),
    sp: z.number().int().min(0).default(0),
    ep: z.number().int().min(0).default(0),
    gp: z.number().int().min(0).default(0),
    pp: z.number().int().min(0).default(0),
    nuyen: z.number().int().min(0).default(0),
    cash: z.number().min(0).default(0),
  }).optional(),
  assignedById: z.string().uuid(),
});

const confirmAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  confirmedById: z.string().uuid(),
});

const completeDistributionSchema = z.object({
  distributionId: z.string().uuid(),
  completedById: z.string().uuid(),
});

export interface LootItem {
  id?: string;
  itemId?: string;
  name: string;
  quantity: number;
  weight: number;
  value: number;
  valueCurrency: string;
  requiresAttunement: boolean;
  attuned: boolean;
  magical: boolean;
  charges?: { max: number; current: number; recharge?: string };
  description?: string;
  assignedTo?: string; // Character ID
  assignedQuantity?: number;
}

export interface LootCurrency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  nuyen: number;
  cash: number;
}

export interface DistributionSummary {
  distribution: LootDistribution;
  totalItems: number;
  totalWeight: number;
  totalValue: LootCurrency;
  assignments: AssignmentSummary[];
  unassignedItems: LootItem[];
  unassignedCurrency: LootCurrency;
}

export interface AssignmentSummary {
  characterId: string;
  characterName: string;
  items: LootItem[];
  currency: LootCurrency;
  confirmed: boolean;
}

/**
 * Create a new loot distribution
 */
export async function createLootDistribution(data: z.infer<typeof createLootDistributionSchema>) {
  const validated = createLootDistributionSchema.parse(data);

  // Verify campaign exists
  const campaign = await prisma.campaign.findUnique({
    where: { id: validated.campaignId },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Verify creator is a member of the campaign
  const membership = await prisma.campaignMembership.findUnique({
    where: {
      userId_campaignId: {
        userId: validated.createdById,
        campaignId: validated.campaignId,
      },
    },
  });

  if (!membership) {
    throw new Error('User is not a member of this campaign');
  }

  // Calculate total currency
  const currency = validated.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };

  return prisma.lootDistribution.create({
    data: {
      campaignId: validated.campaignId,
      name: validated.name,
      sourceType: validated.sourceType,
      sourceId: validated.sourceId,
      status: LootStatus.PENDING,
      items: validated.items || [],
      currency,
      createdById: validated.createdById,
    },
  });
}

/**
 * Get loot distribution with details
 */
export async function getLootDistribution(distributionId: string) {
  return prisma.lootDistribution.findUnique({
    where: { id: distributionId },
    include: {
      assignments: {
        include: {
          character: { select: { id: true, name: true } },
          assignedBy: { select: { id: true, displayName: true } },
          confirmedBy: { select: { id: true, displayName: true } },
        },
      },
      campaign: { select: { id: true, name: true, gameSystem: true } },
      createdBy: { select: { id: true, displayName: true } },
      completedBy: { select: { id: true, displayName: true } },
    },
  });
}

/**
 * Get all loot distributions for a campaign
 */
export async function getCampaignLootDistributions(campaignId: string, status?: LootStatus) {
  return prisma.lootDistribution.findMany({
    where: { 
      campaignId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      assignments: {
        include: {
          character: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/**
 * Assign loot to a character
 */
export async function assignLoot(data: z.infer<typeof assignLootSchema>) {
  const validated = assignLootSchema.parse(data);

  // Verify distribution exists and is not completed
  const distribution = await prisma.lootDistribution.findUnique({
    where: { id: validated.distributionId },
  });

  if (!distribution) {
    throw new Error('Loot distribution not found');
  }

  if (distribution.status === LootStatus.COMPLETED) {
    throw new Error('Cannot assign loot from completed distribution');
  }

  // Verify character is in the same campaign
  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    select: { id: true, name: true, campaignId: true },
  });

  if (!character || character.campaignId !== distribution.campaignId) {
    throw new Error('Character not found in this campaign');
  }

  // Verify items exist in distribution and not already fully assigned
  const distributionItems = distribution.items as unknown as LootItem[];
  const existingAssignments = await prisma.lootAssignment.findMany({
    where: { distributionId: validated.distributionId },
  });

  // Calculate already assigned quantities
  const assignedQuantities: Record<string, number> = {};
  for (const assignment of existingAssignments) {
    const items = assignment.assignedItems as unknown as LootItem[];
    for (const item of items) {
      if (!item.itemId) continue;
      assignedQuantities[item.itemId] = (assignedQuantities[item.itemId] || 0) + item.quantity;
    }
  }

  // Validate new assignments
  if (validated.assignedItems) {
    for (const item of validated.assignedItems) {
      const distItem = distributionItems.find(d => d.id === item.itemId);
      if (!distItem) {
        throw new Error(`Item ${item.itemId} not found in distribution`);
      }
      const alreadyAssigned = assignedQuantities[item.itemId] || 0;
      if (alreadyAssigned + item.quantity > distItem.quantity) {
        throw new Error(`Cannot assign more than available quantity for ${distItem.name}`);
      }
    }
  }

  // Validate currency not over-assigned
  if (validated.assignedCurrency) {
    const distCurrency = distribution.currency as unknown as LootCurrency;
    const assignedCurrency: LootCurrency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
    
    for (const assignment of existingAssignments) {
      const curr = assignment.assignedCurrency as unknown as LootCurrency;
      assignedCurrency.cp += curr.cp || 0;
      assignedCurrency.sp += curr.sp || 0;
      assignedCurrency.ep += curr.ep || 0;
      assignedCurrency.gp += curr.gp || 0;
      assignedCurrency.pp += curr.pp || 0;
      assignedCurrency.nuyen += curr.nuyen || 0;
      assignedCurrency.cash += curr.cash || 0;
    }

    const newCurrency = validated.assignedCurrency;
    if ((assignedCurrency.cp + newCurrency.cp) > (distCurrency.cp || 0)) throw new Error('CP over-assigned');
    if ((assignedCurrency.sp + newCurrency.sp) > (distCurrency.sp || 0)) throw new Error('SP over-assigned');
    if ((assignedCurrency.ep + newCurrency.ep) > (distCurrency.ep || 0)) throw new Error('EP over-assigned');
    if ((assignedCurrency.gp + newCurrency.gp) > (distCurrency.gp || 0)) throw new Error('GP over-assigned');
    if ((assignedCurrency.pp + newCurrency.pp) > (distCurrency.pp || 0)) throw new Error('PP over-assigned');
    if ((assignedCurrency.nuyen + newCurrency.nuyen) > (distCurrency.nuyen || 0)) throw new Error('Nuyen over-assigned');
    if ((assignedCurrency.cash + newCurrency.cash) > (distCurrency.cash || 0)) throw new Error('Cash over-assigned');
  }

  // Create or update assignment
  const existingAssignment = await prisma.lootAssignment.findFirst({
    where: {
      distributionId: validated.distributionId,
      characterId: validated.characterId,
    },
  });

  let assignment;
  if (existingAssignment) {
    // Merge with existing
    const existingItems = existingAssignment.assignedItems as unknown as LootItem[];
    const existingCurrency = existingAssignment.assignedCurrency as unknown as LootCurrency;
    
    const newItems = validated.assignedItems || [];
    const newCurrency = validated.assignedCurrency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };

    // Merge items
    const mergedItems = [...existingItems];
    for (const newItem of newItems) {
      const existingIdx = mergedItems.findIndex(i => i.itemId === newItem.itemId);
      if (existingIdx >= 0) {
        mergedItems[existingIdx].quantity += newItem.quantity;
      } else {
        const distributionItem = distributionItems.find(item => item.id === newItem.itemId);
        if (distributionItem) {
          mergedItems.push({ ...distributionItem, itemId: newItem.itemId, assignedTo: validated.characterId, assignedQuantity: newItem.quantity });
        }
      }
    }

    assignment = await prisma.lootAssignment.update({
      where: { id: existingAssignment.id },
      data: {
        assignedItems: mergedItems as unknown as Prisma.InputJsonValue,
        assignedCurrency: {
          cp: (existingCurrency.cp || 0) + (newCurrency.cp || 0),
          sp: (existingCurrency.sp || 0) + (newCurrency.sp || 0),
          ep: (existingCurrency.ep || 0) + (newCurrency.ep || 0),
          gp: (existingCurrency.gp || 0) + (newCurrency.gp || 0),
          pp: (existingCurrency.pp || 0) + (newCurrency.pp || 0),
          nuyen: (existingCurrency.nuyen || 0) + (newCurrency.nuyen || 0),
          cash: (existingCurrency.cash || 0) + (newCurrency.cash || 0),
        },
        assignedById: validated.assignedById,
      },
    });
  } else {
    assignment = await prisma.lootAssignment.create({
      data: {
        distributionId: validated.distributionId,
        characterId: validated.characterId,
        assignedItems: (validated.assignedItems || []) as unknown as Prisma.InputJsonValue,
        assignedCurrency: (validated.assignedCurrency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 }) as unknown as Prisma.InputJsonValue,
        assignedById: validated.assignedById,
      },
    });
  }

  // Update distribution status to IN_PROGRESS if it was PENDING
  if (distribution.status === LootStatus.PENDING) {
    await prisma.lootDistribution.update({
      where: { id: validated.distributionId },
      data: { status: LootStatus.IN_PROGRESS },
    });
  }

  return assignment;
}

/**
 * Confirm loot assignment (by character or DM)
 */
export async function confirmAssignment(data: z.infer<typeof confirmAssignmentSchema>) {
  const validated = confirmAssignmentSchema.parse(data);

  const assignment = await prisma.lootAssignment.findUnique({
    where: { id: validated.assignmentId },
    include: { distribution: true },
  });

  if (!assignment) {
    throw new Error('Assignment not found');
  }

  if (assignment.distribution.status === LootStatus.COMPLETED) {
    throw new Error('Cannot confirm assignment for completed distribution');
  }

  return prisma.lootAssignment.update({
    where: { id: validated.assignmentId },
    data: {
      confirmedAt: new Date(),
      confirmedById: validated.confirmedById,
    },
  });
}

/**
 * Auto-suggest loot distribution
 */
export async function suggestDistribution(distributionId: string, method: 'value' | 'weight' | 'need' | 'even' = 'even') {
  const distribution = await getLootDistribution(distributionId);
  if (!distribution) {
    throw new Error('Distribution not found');
  }

  // Get campaign characters
  const characters = await prisma.character.findMany({
    where: { campaignId: distribution.campaignId },
    select: { id: true, name: true, data: true, gameSystem: true },
  });

  const items = distribution.items as unknown as LootItem[];
  const currency = distribution.currency as unknown as LootCurrency;
  const suggestions: Record<string, { items: LootItem[]; currency: LootCurrency }> = {};

  // Initialize suggestions for each character
  for (const char of characters) {
    suggestions[char.id] = { items: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 } };
  }

  if (method === 'even') {
    // Evenly distribute items (by value) and currency
    await distributeEvenly(items, currency, characters, suggestions, distribution.campaign.gameSystem);
  } else if (method === 'value') {
    // Distribute by total value (highest value items to those with least value)
    await distributeByValue(items, currency, characters, suggestions, distribution.campaign.gameSystem);
  } else if (method === 'weight') {
    // Distribute by weight (consider encumbrance)
    await distributeByWeight(items, currency, characters, suggestions);
  } else if (method === 'need') {
    // Distribute by need (unattuned slots, missing item types)
    await distributeByNeed(items, currency, characters, suggestions);
  }

  return suggestions;
}

/**
 * Distribute items evenly among party
 */
async function distributeEvenly(
  items: LootItem[],
  currency: LootCurrency,
  characters: Array<{ id: string }>,
  suggestions: Record<string, { items: LootItem[]; currency: LootCurrency }>,
  gameSystem: GameSystem | null
) {
  // Sort items by value (highest first)
  const sortedItems = [...items].sort((a, b) => {
    const valueA = convertToCP(a.value, a.valueCurrency, gameSystem);
    const valueB = convertToCP(b.value, b.valueCurrency, gameSystem);
    return valueB - valueA;
  });

  // Distribute items to character with lowest current total value
  for (const item of sortedItems) {
    let targetCharId = characters[0].id;
    let minValue = Infinity;

    for (const char of characters) {
      const currentValue = calculateSuggestionValue(suggestions[char.id], gameSystem);
      if (currentValue < minValue) {
        minValue = currentValue;
        targetCharId = char.id;
      }
    }

    suggestions[targetCharId].items.push({ ...item, assignedQuantity: item.quantity });
  }

  // Distribute currency evenly
  const charCount = characters.length;
  if (charCount > 0) {
    const currencyKeys: (keyof LootCurrency)[] = ['cp', 'sp', 'ep', 'gp', 'pp', 'nuyen', 'cash'];
    for (const key of currencyKeys) {
      const total = currency[key] || 0;
      const perChar = Math.floor(total / charCount);
      const remainder = total % charCount;
      
      for (let i = 0; i < charCount; i++) {
        suggestions[characters[i].id].currency[key] = perChar + (i < remainder ? 1 : 0);
      }
    }
  }
}

/**
 * Distribute by value (give high-value items to those with least)
 */
async function distributeByValue(
  items: LootItem[],
  currency: LootCurrency,
  characters: Array<{ id: string }>,
  suggestions: Record<string, { items: LootItem[]; currency: LootCurrency }>,
  gameSystem: GameSystem | null
) {
  // Same as even for items, but currency goes to lowest value character
  await distributeEvenly(items, currency, characters, suggestions, gameSystem);
}

/**
 * Distribute by weight (consider encumbrance)
 */
async function distributeByWeight(
  items: LootItem[],
  currency: LootCurrency,
  characters: Array<{ id: string }>,
  suggestions: Record<string, { items: LootItem[]; currency: LootCurrency }>
) {
  // Sort items by weight (heaviest first)
  const sortedItems = [...items].sort((a, b) => b.weight - a.weight);

  for (const item of sortedItems) {
    // Assign to character with most remaining capacity
    let targetCharId = characters[0].id;
    let maxCapacity = -1;

    for (const char of characters) {
      const { getWeightBreakdown } = await import('./containers.js');
      const breakdown = await getWeightBreakdown(char.id);
      const { calculateEncumbrance } = await import('./encumbrance.js');
      const encumbrance = await calculateEncumbrance(char.id);
      
      const remaining = encumbrance.maxWeight - breakdown.total;
      if (remaining > maxCapacity) {
        maxCapacity = remaining;
        targetCharId = char.id;
      }
    }

    suggestions[targetCharId].items.push({ ...item, assignedQuantity: item.quantity });
  }

  // Distribute currency evenly
  await distributeEvenly([], currency, characters, suggestions, GameSystem.DND_5E);
}

/**
 * Distribute by need (unattuned slots, missing items)
 */
async function distributeByNeed(
  items: LootItem[],
  currency: LootCurrency,
  characters: Array<{ id: string }>,
  suggestions: Record<string, { items: LootItem[]; currency: LootCurrency }>
) {
  // For magical items requiring attunement, give to characters with available slots
  const attunementItems = items.filter(i => i.requiresAttunement);
  const otherItems = items.filter(i => !i.requiresAttunement);

  for (const item of attunementItems) {
    let targetCharId = characters[0].id;
    let maxSlots = -1;

    for (const char of characters) {
      const { getAttunementStatus } = await import('./attunement.js');
      const status = await getAttunementStatus(char.id);
      if (status.availableSlots > maxSlots) {
        maxSlots = status.availableSlots;
        targetCharId = char.id;
      }
    }

    suggestions[targetCharId].items.push({ ...item, assignedQuantity: item.quantity });
  }

  // Distribute other items evenly
  await distributeEvenly(otherItems, currency, characters, suggestions, GameSystem.DND_5E);
}

/**
 * Calculate total value of suggestion in copper pieces
 */
function calculateSuggestionValue(
  suggestion: { items: LootItem[]; currency: LootCurrency },
  gameSystem: GameSystem | null
): number {
  let value = 0;
  
  for (const item of suggestion.items) {
    value += convertToCP(item.value, item.valueCurrency, gameSystem) * (item.assignedQuantity || item.quantity);
  }

  const rates = getConversionRates(gameSystem || GameSystem.DND_5E);
  value += suggestion.currency.cp * (rates.CP || 1);
  value += suggestion.currency.sp * (rates.SP || 1);
  value += suggestion.currency.ep * (rates.EP || 1);
  value += suggestion.currency.gp * (rates.GP || 1);
  value += suggestion.currency.pp * (rates.PP || 1);
  value += suggestion.currency.nuyen;
  value += suggestion.currency.cash;

  return value;
}

/**
 * Convert value to copper pieces for comparison
 */
function convertToCP(value: number, currency: string | undefined, gameSystem: GameSystem | null): number {
  const rates = getConversionRates(gameSystem || GameSystem.DND_5E);
  const rate = rates[currency as keyof typeof rates] || rates.GP || 100;
  return value * rate;
}

/**
 * Get conversion rates
 */
function getConversionRates(gameSystem: GameSystem) {
  switch (gameSystem) {
    case GameSystem.DND_5E:
      return { CP: 1, SP: 10, EP: 50, GP: 100, PP: 1000 };
    case GameSystem.PATHFINDER_2E:
      return { CP: 1, SP: 10, GP: 100, PP: 1000 };
    default:
      return { CP: 1, SP: 10, EP: 50, GP: 100, PP: 1000 };
  }
}

/**
 * Complete loot distribution (apply to character sheets)
 */
export async function completeDistribution(data: z.infer<typeof completeDistributionSchema>) {
  const validated = completeDistributionSchema.parse(data);

  const distribution = await getLootDistribution(validated.distributionId);
  if (!distribution) {
    throw new Error('Distribution not found');
  }

  if (distribution.status === LootStatus.COMPLETED) {
    throw new Error('Distribution already completed');
  }

  // Apply all confirmed assignments to character sheets
  for (const assignment of distribution.assignments) {
    if (assignment.confirmedAt) {
      await applyLootToCharacter(assignment.characterId, assignment);
    }
  }

  // Update distribution status
  return prisma.lootDistribution.update({
    where: { id: validated.distributionId },
    data: {
      status: LootStatus.COMPLETED,
      completedAt: new Date(),
      completedById: validated.completedById,
    },
  });
}

/**
 * Apply loot assignment to character sheet
 */
async function applyLootToCharacter(characterId: string, assignment: LootAssignment) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true, gameSystem: true },
  });

  if (!character) return;

  const { data: characterData, inventory } = readCharacterInventory(character.data);
  const assignedItems = assignment.assignedItems as unknown as LootItem[];
  const assignedCurrency = assignment.assignedCurrency as unknown as LootCurrency;

  // Add items to inventory
  for (const item of assignedItems) {
    // Check if item already exists (by name)
    const existingIndex = inventory.findIndex((existing) =>
      existing.name?.toLowerCase() === item.name.toLowerCase() &&
      !existing.requiresAttunement && // Don't stack attunement items
      !existing.magical
    );

    if (existingIndex >= 0) {
      inventory[existingIndex].quantity = (inventory[existingIndex].quantity || 1) + (item.assignedQuantity || item.quantity);
    } else {
      inventory.push({
        id: crypto.randomUUID(),
        name: item.name,
        quantity: item.assignedQuantity || item.quantity,
        weight: item.weight || 0,
        notes: item.description || '',
        requiresAttunement: item.requiresAttunement || false,
        attuned: item.attuned || false,
        magical: item.magical || false,
        charges: item.charges,
        value: item.value,
        location: 'CARRIED',
      });
    }
  }

  // Add currency (use currency service)
  const { addCurrency } = await import('./currency.js');
  if (Object.values(assignedCurrency).some(v => v > 0)) {
    await addCurrency({
      characterId,
      cp: assignedCurrency.cp,
      sp: assignedCurrency.sp,
      ep: assignedCurrency.ep,
      gp: assignedCurrency.gp,
      pp: assignedCurrency.pp,
      nuyen: assignedCurrency.nuyen,
      cash: assignedCurrency.cash,
      description: `Loot from distribution ${assignment.distributionId}`,
      sourceType: 'LOOT',
      createdById: 'SYSTEM',
    });
  }

  // Update character
  await prisma.character.update({
    where: { id: characterId },
    data: {
      data: toPrismaJson({ ...characterData, inventory }),
    },
  });
}

/**
 * Cancel distribution
 */
export async function cancelDistribution(distributionId: string, cancelledById: string) {
  return prisma.lootDistribution.update({
    where: { id: distributionId },
    data: {
      status: LootStatus.CANCELLED,
      completedAt: new Date(),
      completedById: cancelledById,
    },
  });
}

/**
 * Get distribution summary for UI
 */
export async function getDistributionSummary(distributionId: string): Promise<DistributionSummary> {
  const distribution = await getLootDistribution(distributionId);
  if (!distribution) {
    throw new Error('Distribution not found');
  }

  const items = distribution.items as unknown as LootItem[];
  const currency = distribution.currency as unknown as LootCurrency;

  // Calculate totals
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0) * item.quantity, 0);
  
  const totalValue: LootCurrency = { ...currency };

  // Calculate assignments
  const assignments: AssignmentSummary[] = [];
  const assignedItemQuantities: Record<string, number> = {};
  const assignedCurrency: LootCurrency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };

  for (const assignment of distribution.assignments) {
    const charItems = assignment.assignedItems as unknown as LootItem[];
    const charCurrency = assignment.assignedCurrency as unknown as LootCurrency;

    for (const item of charItems) {
      if (!item.itemId) continue;
      assignedItemQuantities[item.itemId] = (assignedItemQuantities[item.itemId] || 0) + (item.assignedQuantity || item.quantity);
    }

    assignedCurrency.cp += charCurrency.cp || 0;
    assignedCurrency.sp += charCurrency.sp || 0;
    assignedCurrency.ep += charCurrency.ep || 0;
    assignedCurrency.gp += charCurrency.gp || 0;
    assignedCurrency.pp += charCurrency.pp || 0;
    assignedCurrency.nuyen += charCurrency.nuyen || 0;
    assignedCurrency.cash += charCurrency.cash || 0;

    assignments.push({
      characterId: assignment.characterId,
      characterName: assignment.character.name,
      items: charItems,
      currency: charCurrency,
      confirmed: !!assignment.confirmedAt,
    });
  }

  // Find unassigned items
  const unassignedItems = items.filter(item => item.id !== undefined &&
    (assignedItemQuantities[item.id] || 0) < item.quantity
  ).map(item => ({
    ...item,
    quantity: item.quantity - (assignedItemQuantities[item.id!] || 0),
  }));

  // Calculate unassigned currency
  const unassignedCurrency: LootCurrency = {
    cp: (currency.cp || 0) - assignedCurrency.cp,
    sp: (currency.sp || 0) - assignedCurrency.sp,
    ep: (currency.ep || 0) - assignedCurrency.ep,
    gp: (currency.gp || 0) - assignedCurrency.gp,
    pp: (currency.pp || 0) - assignedCurrency.pp,
    nuyen: (currency.nuyen || 0) - assignedCurrency.nuyen,
    cash: (currency.cash || 0) - assignedCurrency.cash,
  };

  return {
    distribution,
    totalItems,
    totalWeight,
    totalValue,
    assignments,
    unassignedItems,
    unassignedCurrency,
  };
}

export default {
  createLootDistribution,
  getLootDistribution,
  getCampaignLootDistributions,
  assignLoot,
  confirmAssignment,
  suggestDistribution,
  completeDistribution,
  cancelDistribution,
  getDistributionSummary,
};
