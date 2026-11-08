/**
 * Inventory Routes
 * API endpoints for inventory management, containers, currency, encumbrance, attunement, and loot
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { GameSystem, ContainerType, LootStatus, Prisma } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { campaignMember, campaignDM } from '../middleware/compose';
import { AuthenticatedRequest } from '../middleware/rbac';
import { prisma } from '../config/database';
import { 
  createContainer, 
  getContainerTree, 
  moveItemToContainer, 
  updateContainer, 
  deleteContainer, 
  getWeightBreakdown,
  getContainerWithDetails,
  createDefaultContainers,
} from '../services/inventory/containers';
import { 
  getEncumbranceStatus,
  calculateDnD5eEncumbrance,
  calculatePF2eEncumbrance,
} from '../services/inventory/encumbrance';
import { 
  getCurrencyContainers, 
  getTotalCurrency, 
  getContainerCurrency, 
  addCurrency, 
  removeCurrency, 
  transferCurrency, 
  convertCurrency, 
  formatCurrency, 
  getTransactionHistory, 
  createCurrencyContainer,
} from '../services/inventory/currency';
import { 
  getAttunementStatus, 
  attuneItem, 
  unattuneItem, 
  updateAttunementNotes, 
  shortRestAttunementChange, 
  getAttunementWarnings, 
  getAllAttunementSlots,
} from '../services/inventory/attunement';
import { 
  createLootDistribution, 
  getLootDistribution, 
  getCampaignLootDistributions, 
  assignLoot, 
  confirmAssignment, 
  suggestDistribution, 
  completeDistribution, 
  cancelDistribution, 
  getDistributionSummary,
} from '../services/inventory/loot';

const router = Router();

// UUID validation schema (Zod v4 compatible)
const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

// All routes require authentication
router.use(requireAuth);

// Validation schemas
const moveItemSchema = z.object({
  itemId: uuidSchema,
  fromContainerId: uuidSchema.nullable(),
  toContainerId: uuidSchema.nullable(),
  newLocation: z.enum(['EQUIPPED', 'CARRIED', 'STOWED', 'CONTAINER']),
});

const addCurrencySchema = z.object({
  containerId: uuidSchema.optional(),
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
});

const transferCurrencySchema = z.object({
  fromContainerId: uuidSchema,
  toContainerId: uuidSchema.optional(),
  cp: z.number().int().min(0).default(0),
  sp: z.number().int().min(0).default(0),
  ep: z.number().int().min(0).default(0),
  gp: z.number().int().min(0).default(0),
  pp: z.number().int().min(0).default(0),
  nuyen: z.number().int().min(0).default(0),
  cash: z.number().min(0).default(0),
  custom: z.record(z.string(), z.number()).optional(),
  description: z.string(),
});

const convertCurrencySchema = z.object({
  containerId: uuidSchema.optional(),
  fromCurrency: z.enum(['CP', 'SP', 'EP', 'GP', 'PP', 'NUYEN', 'CASH']),
  toCurrency: z.enum(['CP', 'SP', 'EP', 'GP', 'PP', 'NUYEN', 'CASH']),
  amount: z.number().int().min(1),
});

const createContainerSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(ContainerType).default(ContainerType.CUSTOM),
  parentId: uuidSchema.optional(),
  capacity: z.number().min(0),
  capacityUnit: z.enum(['LBS', 'BULK', 'KG']).default('LBS'),
  baseWeight: z.number().min(0).default(0),
  isMagical: z.boolean().default(false),
  magicType: z.string().optional(),
  notes: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

const updateContainerSchema = createContainerSchema.partial();

const attuneItemSchema = z.object({
  itemId: z.string(),
  itemName: z.string(),
  slotNumber: z.number().int().min(1).max(10).optional(),
  notes: z.string().optional(),
});

const updateAttunementNotesSchema = z.object({
  notes: z.string().optional(),
});

const shortRestAttunementSchema = z.object({
  unattuneItemId: z.string().nullable().optional(),
  attuneItemId: z.string().nullable().optional(),
  attuneItemName: z.string().nullable().optional(),
  attuneNotes: z.string().nullable().optional(),
});

const createLootSchema = z.object({
  name: z.string().min(1).max(200),
  sourceType: z.enum(['CREATURE', 'MANUAL', 'TABLE', 'SHOP']),
  sourceId: z.string().optional(),
  items: z.array(z.object({
    id: uuidSchema,
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
});

const assignLootSchema = z.object({
  characterId: uuidSchema,
  assignedItems: z.array(z.object({
    itemId: uuidSchema,
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
});

const suggestLootSchema = z.object({
  method: z.enum(['even', 'value', 'weight', 'need']).default('even'),
});

// Helper function to handle Zod errors
function handleZodError(error: unknown, res: Response): boolean {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', details: error.issues });
    return true;
  }
  return false;
}

type InventoryItem = Prisma.JsonObject & { id: string };

function characterInventory(value: Prisma.JsonValue): { data: Prisma.JsonObject; items: InventoryItem[] } {
  const data = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const items = Array.isArray(data.inventory)
    ? data.inventory.filter((item): item is InventoryItem =>
      item !== null && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string'
    )
    : [];
  return { data, items };
}

// ============================================
// INVENTORY ITEMS (stored in Character.data.inventory)
// ============================================

// Get inventory items (from character data)
router.get('/:campaignId/characters/:characterId/inventory', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: req.params.characterId! },
      select: { data: true, gameSystem: true },
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    return res.json(characterInventory(character.data).items);
  } catch (error) {
    console.error('Get inventory error:', error);
    return res.status(500).json({ error: 'Failed to get inventory' });
  }
});

// Add inventory item
router.post('/:campaignId/characters/:characterId/inventory', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: req.params.characterId! },
      select: { data: true },
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const { data: characterData, items: inventory } = characterInventory(character.data);
    const newItem = {
      id: crypto.randomUUID(),
      ...req.body,
      quantity: req.body.quantity || 1,
      weight: req.body.weight || 0,
      notes: req.body.notes || '',
      equippable: req.body.equippable || false,
      equipped: false,
      requiresAttunement: req.body.requiresAttunement || false,
      attuned: false,
      magical: req.body.magical || false,
      location: req.body.location || 'CARRIED',
    };

    inventory.push(newItem);

    await prisma.character.update({
      where: { id: req.params.characterId! },
      data: { data: { ...characterData, inventory } as Prisma.InputJsonValue },
    });

    return res.status(201).json(newItem);
  } catch (error) {
    console.error('Add inventory item error:', error);
    return res.status(500).json({ error: 'Failed to add inventory item' });
  }
});

// Update inventory item
router.patch('/:campaignId/characters/:characterId/inventory/:itemId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: req.params.characterId! },
      select: { data: true },
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const { data: characterData, items: inventory } = characterInventory(character.data);
    const itemIndex = inventory.findIndex((item) => item.id === req.params.itemId);

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    inventory[itemIndex] = { ...inventory[itemIndex], ...req.body };

    await prisma.character.update({
      where: { id: req.params.characterId! },
      data: { data: { ...characterData, inventory } as Prisma.InputJsonValue },
    });

    return res.json(inventory[itemIndex]);
  } catch (error) {
    console.error('Update inventory item error:', error);
    return res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// Delete inventory item
router.delete('/:campaignId/characters/:characterId/inventory/:itemId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: req.params.characterId! },
      select: { data: true },
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const { data: characterData, items: inventory } = characterInventory(character.data);
    const filteredInventory = inventory.filter((item) => item.id !== req.params.itemId);

    await prisma.character.update({
      where: { id: req.params.characterId! },
      data: { data: { ...characterData, inventory: filteredInventory } as Prisma.InputJsonValue },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    return res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// Move item between containers/locations
router.post('/:campaignId/characters/:characterId/inventory/move', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = moveItemSchema.parse(req.body);
    const result = await moveItemToContainer({
      characterId: req.params.characterId!,
      ...validated,
    });
    return res.json(result);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Move item error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to move item' });
  }
});

// ============================================
// CONTAINERS
// ============================================

// Get container tree
router.get('/:campaignId/characters/:characterId/containers/tree', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tree = await getContainerTree(req.params.characterId!);
    return res.json(tree);
  } catch (error) {
    console.error('Get container tree error:', error);
    return res.status(500).json({ error: 'Failed to get container tree' });
  }
});

// Get weight breakdown
router.get('/:campaignId/characters/:characterId/weight-breakdown', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const breakdown = await getWeightBreakdown(req.params.characterId!);
    return res.json(breakdown);
  } catch (error) {
    console.error('Get weight breakdown error:', error);
    return res.status(500).json({ error: 'Failed to get weight breakdown' });
  }
});

// Create container
router.post('/:campaignId/characters/:characterId/containers', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = createContainerSchema.parse(req.body);
    const container = await createContainer({
      characterId: req.params.characterId!,
      ...validated,
    });
    return res.status(201).json(container);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Create container error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create container' });
  }
});

// Update container
router.patch('/:campaignId/characters/:characterId/containers/:containerId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = updateContainerSchema.parse(req.body);
    const container = await updateContainer({
      id: req.params.containerId!,
      ...validated,
    });
    return res.json(container);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Update container error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update container' });
  }
});

// Delete container
router.delete('/:campaignId/characters/:characterId/containers/:containerId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const moveContents = req.query.moveContents !== 'false';
    await deleteContainer(req.params.containerId!, moveContents);
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete container error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete container' });
  }
});

// Get container details
router.get('/:campaignId/characters/:characterId/containers/:containerId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const container = await getContainerWithDetails(req.params.containerId!);
    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }
    return res.json(container);
  } catch (error) {
    console.error('Get container details error:', error);
    return res.status(500).json({ error: 'Failed to get container details' });
  }
});

// Create default containers for character
router.post('/:campaignId/characters/:characterId/containers/defaults', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: req.params.characterId! },
      select: { gameSystem: true },
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const containers = await createDefaultContainers(req.params.characterId!, character.gameSystem || 'DND_5E');
    return res.status(201).json(containers);
  } catch (error) {
    console.error('Create default containers error:', error);
    return res.status(500).json({ error: 'Failed to create default containers' });
  }
});

// ============================================
// ENCUMBRANCE
// ============================================

// Get encumbrance status
router.get('/:campaignId/characters/:characterId/encumbrance', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await getEncumbranceStatus(req.params.characterId!);
    return res.json(status);
  } catch (error) {
    console.error('Get encumbrance error:', error);
    return res.status(500).json({ error: 'Failed to calculate encumbrance' });
  }
});

// Calculate encumbrance for specific values (for preview)
router.post('/:campaignId/characters/:characterId/encumbrance/preview', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { totalWeight, strengthScore, strengthModifier, gameSystem } = req.body;
    const system = gameSystem || (await prisma.character.findUnique({
      where: { id: req.params.characterId! },
      select: { gameSystem: true },
    }))?.gameSystem || GameSystem.DND_5E;

    let status;
    switch (system) {
      case GameSystem.DND_5E:
        status = calculateDnD5eEncumbrance(totalWeight, strengthScore);
        break;
      case GameSystem.PATHFINDER_2E:
        status = calculatePF2eEncumbrance(totalWeight, strengthModifier);
        break;
      default:
        status = calculateDnD5eEncumbrance(totalWeight, strengthScore);
    }
    return res.json(status);
  } catch (error) {
    console.error('Preview encumbrance error:', error);
    return res.status(500).json({ error: 'Failed to calculate encumbrance preview' });
  }
});

// ============================================
// CURRENCY
// ============================================

// Get all currency containers
router.get('/:campaignId/characters/:characterId/currency/containers', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const containers = await getCurrencyContainers(req.params.characterId!);
    return res.json(containers);
  } catch (error) {
    console.error('Get currency containers error:', error);
    return res.status(500).json({ error: 'Failed to get currency containers' });
  }
});

// Get total currency
router.get('/:campaignId/characters/:characterId/currency/total', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const total = await getTotalCurrency(req.params.characterId!);
    const character = await prisma.character.findUnique({
      where: { id: req.params.characterId! },
      select: { gameSystem: true },
    });
    const formatted = formatCurrency(total, character?.gameSystem || GameSystem.DND_5E);
    return res.json({ ...total, formatted: formatted.display, shortDisplay: formatted.shortDisplay });
  } catch (error) {
    console.error('Get total currency error:', error);
    return res.status(500).json({ error: 'Failed to get total currency' });
  }
});

// Get currency in specific container
router.get('/:campaignId/characters/:characterId/currency/containers/:containerId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currency = await getContainerCurrency(req.params.containerId!);
    if (!currency) {
      return res.status(404).json({ error: 'Container not found' });
    }
    return res.json(currency);
  } catch (error) {
    console.error('Get container currency error:', error);
    return res.status(500).json({ error: 'Failed to get container currency' });
  }
});

// Add currency
router.post('/:campaignId/characters/:characterId/currency/add', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = addCurrencySchema.parse(req.body);
    const container = await addCurrency({
      characterId: req.params.characterId!,
      createdById: req.session.userId!,
      ...validated,
    });
    return res.json(container);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Add currency error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add currency' });
  }
});

// Remove currency
router.post('/:campaignId/characters/:characterId/currency/remove', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = addCurrencySchema.parse(req.body);
    const container = await removeCurrency({
      characterId: req.params.characterId!,
      createdById: req.session.userId!,
      ...validated,
    });
    return res.json(container);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Remove currency error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to remove currency' });
  }
});

// Transfer currency between containers
router.post('/:campaignId/characters/:characterId/currency/transfer', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = transferCurrencySchema.parse(req.body);
    const result = await transferCurrency({
      characterId: req.params.characterId!,
      createdById: req.session.userId!,
      ...validated,
    });
    return res.json(result);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Transfer currency error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to transfer currency' });
  }
});

// Convert currency
router.post('/:campaignId/characters/:characterId/currency/convert', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = convertCurrencySchema.parse(req.body);
    const result = await convertCurrency({
      characterId: req.params.characterId!,
      createdById: req.session.userId!,
      ...validated,
    });
    return res.json(result);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Convert currency error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to convert currency' });
  }
});

// Get transaction history
router.get('/:campaignId/characters/:characterId/currency/transactions', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const transactions = await getTransactionHistory(req.params.characterId!, limit);
    return res.json(transactions);
  } catch (error) {
    console.error('Get transaction history error:', error);
    return res.status(500).json({ error: 'Failed to get transaction history' });
  }
});

// Create currency container linked to inventory container
router.post('/:campaignId/characters/:characterId/currency/containers', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, containerId, sortOrder } = req.body;
    const currencyContainer = await createCurrencyContainer(
      req.params.characterId!,
      name,
      containerId,
      sortOrder || 0
    );
    return res.status(201).json(currencyContainer);
  } catch (error) {
    console.error('Create currency container error:', error);
    return res.status(500).json({ error: 'Failed to create currency container' });
  }
});

// ============================================
// ATTUNEMENT
// ============================================

// Get attunement status
router.get('/:campaignId/characters/:characterId/attunement', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await getAttunementStatus(req.params.characterId!);
    return res.json(status);
  } catch (error) {
    console.error('Get attunement status error:', error);
    return res.status(500).json({ error: 'Failed to get attunement status' });
  }
});

// Get attunement warnings
router.get('/:campaignId/characters/:characterId/attunement/warnings', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const warnings = await getAttunementWarnings(req.params.characterId!);
    return res.json(warnings);
  } catch (error) {
    console.error('Get attunement warnings error:', error);
    return res.status(500).json({ error: 'Failed to get attunement warnings' });
  }
});

// Attune item
router.post('/:campaignId/characters/:characterId/attunement', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = attuneItemSchema.parse(req.body);
    const slot = await attuneItem({
      characterId: req.params.characterId!,
      createdById: req.session.userId!,
      ...validated,
    });
    return res.status(201).json(slot);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Attune item error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to attune item' });
  }
});

// Unattune item
router.delete('/:campaignId/characters/:characterId/attunement/:slotId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await unattuneItem({
      characterId: req.params.characterId!,
      attunementSlotId: req.params.slotId!,
      createdById: req.session.userId!,
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('Unattune item error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to unattune item' });
  }
});

// Update attunement notes
router.patch('/:campaignId/characters/:characterId/attunement/:slotId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = updateAttunementNotesSchema.parse(req.body);
    const slot = await updateAttunementNotes({
      attunementSlotId: req.params.slotId!,
      notes: validated.notes,
      createdById: req.session.userId!,
    });
    return res.json(slot);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Update attunement notes error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update attunement notes' });
  }
});

// Short rest attunement change
router.post('/:campaignId/characters/:characterId/attunement/short-rest', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = shortRestAttunementSchema.parse(req.body);
    const result = await shortRestAttunementChange(
      req.params.characterId!,
      validated.unattuneItemId ?? null,
      validated.attuneItemId ?? null,
      validated.attuneItemName ?? null,
      validated.attuneNotes ?? null,
      req.session.userId!
    );
    return res.json(result);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Short rest attunement error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to perform short rest attunement change' });
  }
});

// Get all attunement slots
router.get('/:campaignId/characters/:characterId/attunement/slots', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const slots = await getAllAttunementSlots(req.params.characterId!);
    return res.json(slots);
  } catch (error) {
    console.error('Get attunement slots error:', error);
    return res.status(500).json({ error: 'Failed to get attunement slots' });
  }
});

// ============================================
// LOOT DISTRIBUTION
// ============================================

// Get campaign loot distributions
router.get('/:campaignId/loot', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = (req.query.status as string) as LootStatus | undefined;
    const distributions = await getCampaignLootDistributions(req.params.campaignId, status);
    return res.json(distributions);
  } catch (error) {
    console.error('Get loot distributions error:', error);
    return res.status(500).json({ error: 'Failed to get loot distributions' });
  }
});

// Create loot distribution
router.post('/:campaignId/loot', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = createLootSchema.parse(req.body);
    const distribution = await createLootDistribution({
      campaignId: req.params.campaignId,
      createdById: req.session.userId!,
      ...validated,
    });
    return res.status(201).json(distribution);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Create loot distribution error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create loot distribution' });
  }
});

// Get loot distribution details
router.get('/:campaignId/loot/:distributionId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const distribution = await getLootDistribution(req.params.distributionId!);
    if (!distribution) {
      return res.status(404).json({ error: 'Loot distribution not found' });
    }
    return res.json(distribution);
  } catch (error) {
    console.error('Get loot distribution error:', error);
    return res.status(500).json({ error: 'Failed to get loot distribution' });
  }
});

// Get distribution summary
router.get('/:campaignId/loot/:distributionId/summary', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = await getDistributionSummary(req.params.distributionId!);
    return res.json(summary);
  } catch (error) {
    console.error('Get distribution summary error:', error);
    return res.status(500).json({ error: 'Failed to get distribution summary' });
  }
});

// Assign loot to character
router.post('/:campaignId/loot/:distributionId/assign', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = assignLootSchema.parse(req.body);
    const assignment = await assignLoot({
      distributionId: req.params.distributionId!,
      assignedById: req.session.userId!,
      ...validated,
    });
    return res.json(assignment);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Assign loot error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to assign loot' });
  }
});

// Confirm assignment
router.post('/:campaignId/loot/assignments/:assignmentId/confirm', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const assignment = await confirmAssignment({
      assignmentId: req.params.assignmentId!,
      confirmedById: req.session.userId!,
    });
    return res.json(assignment);
  } catch (error) {
    console.error('Confirm assignment error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to confirm assignment' });
  }
});

// Get auto-suggestions
router.post('/:campaignId/loot/:distributionId/suggest', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = suggestLootSchema.parse(req.body);
    const suggestions = await suggestDistribution(req.params.distributionId!, validated.method);
    return res.json(suggestions);
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Suggest distribution error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate suggestions' });
  }
});

// Complete distribution
router.post('/:campaignId/loot/:distributionId/complete', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const distribution = await completeDistribution({
      distributionId: req.params.distributionId!,
      completedById: req.session.userId!,
    });
    return res.json(distribution);
  } catch (error) {
    console.error('Complete distribution error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to complete distribution' });
  }
});

// Cancel distribution
router.post('/:campaignId/loot/:distributionId/cancel', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const distribution = await cancelDistribution(req.params.distributionId!, req.session.userId!);
    return res.json(distribution);
  } catch (error) {
    console.error('Cancel distribution error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to cancel distribution' });
  }
});

export default router;
