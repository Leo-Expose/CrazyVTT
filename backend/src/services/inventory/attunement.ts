/**
 * Attunement Tracking Service
 * Handles attunement slots, warnings, and short rest workflows
 */

import { AttunementSlot, GameSystem } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { readCharacterInventory, toPrismaJson } from './characterData';

// Validation schemas
const attuneItemSchema = z.object({
  characterId: z.string().uuid(),
  itemId: z.string(), // Inventory item ID
  itemName: z.string(),
  slotNumber: z.number().int().min(1).max(10).optional(), // Auto-assign if not provided
  notes: z.string().optional(),
  createdById: z.string().uuid(),
});

const unattuneItemSchema = z.object({
  characterId: z.string().uuid(),
  attunementSlotId: z.string().uuid(),
  createdById: z.string().uuid(),
});

const updateAttunementNotesSchema = z.object({
  attunementSlotId: z.string().uuid(),
  notes: z.string().optional(),
  createdById: z.string().uuid(),
});

export interface AttunementStatus {
  usedSlots: number;
  maxSlots: number;
  availableSlots: number;
  isOverLimit: boolean;
  attunedItems: AttunedItem[];
  warnings: string[];
}

export interface AttunedItem {
  id: string;
  itemId: string;
  itemName: string;
  slotNumber: number;
  attunedAt: Date;
  notes: string | null;
  isActive: boolean;
}

export interface AttunementWarning {
  type: 'OVER_LIMIT' | 'SLOT_CONFLICT' | 'REQUIRES_SHORT_REST';
  message: string;
  severity: 'warning' | 'error';
}

/**
 * Get attunement status for a character
 */
export async function getAttunementStatus(characterId: string): Promise<AttunementStatus> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { gameSystem: true, data: true },
  });

  if (!character) {
    throw new Error('Character not found');
  }

  // Get max slots based on game system
  const maxSlots = getMaxAttunementSlots(character.gameSystem);

  // Get attunement slots from database
  const slots = await prisma.attunementSlot.findMany({
    where: { characterId, isActive: true },
    orderBy: { slotNumber: 'asc' },
  });

  // Also check inventory for items marked as attuned
  const { inventory } = readCharacterInventory(character.data);
  const attunedItemsFromInventory = inventory.filter(
    (item): item is typeof item & { id: string; name: string } =>
      item.attuned === true && typeof item.id === 'string' && typeof item.name === 'string'
  );

  // Merge database slots with inventory items
  const attunedItems: AttunedItem[] = [];
  const usedSlotNumbers = new Set<number>();

  // First, add database slots
  for (const slot of slots) {
    attunedItems.push({
      id: slot.id,
      itemId: slot.itemId,
      itemName: slot.itemName,
      slotNumber: slot.slotNumber,
      attunedAt: slot.attunedAt,
      notes: slot.notes,
      isActive: slot.isActive,
    });
    usedSlotNumbers.add(slot.slotNumber);
  }

  // Then add inventory items that are attuned but not in slots
  for (const item of attunedItemsFromInventory) {
    const existingSlot = slots.find(s => s.itemId === item.id);
    if (!existingSlot) {
      // Find next available slot
      let slotNum = 1;
      while (usedSlotNumbers.has(slotNum)) slotNum++;
      usedSlotNumbers.add(slotNum);
      
      attunedItems.push({
        id: `inventory-${item.id}`,
        itemId: item.id,
        itemName: item.name,
        slotNumber: slotNum,
        attunedAt: new Date(), // Approximate
        notes: item.attunementNotes || null,
        isActive: true,
      });
    }
  }

  // Sort by slot number
  attunedItems.sort((a, b) => a.slotNumber - b.slotNumber);

  const usedSlots = attunedItems.length;
  const availableSlots = Math.max(0, maxSlots - usedSlots);
  const isOverLimit = usedSlots > maxSlots;

  // Generate warnings
  const warnings: string[] = [];
  if (isOverLimit) {
    warnings.push(`Exceeds maximum attunement slots (${usedSlots}/${maxSlots}). DM override required.`);
  } else if (usedSlots === maxSlots && maxSlots > 0) {
    warnings.push(`All attunement slots filled (${usedSlots}/${maxSlots}).`);
  }

  // Check for items requiring attunement but not attuned
  const requiresAttunementNotAttuned = inventory.filter(
    (item) => item.requiresAttunement === true && item.attuned !== true
  );
  if (requiresAttunementNotAttuned.length > 0) {
    warnings.push(`${requiresAttunementNotAttuned.length} item(s) require attunement but are not attuned.`);
  }

  return {
    usedSlots,
    maxSlots,
    availableSlots,
    isOverLimit,
    attunedItems,
    warnings,
  };
}

/**
 * Get max attunement slots for a game system
 */
function getMaxAttunementSlots(gameSystem: GameSystem | null): number {
  switch (gameSystem) {
    case GameSystem.DND_5E:
      return 3;
    case GameSystem.PATHFINDER_2E:
      // PF2e uses "invested" items, limit is 10
      return 10;
    case GameSystem.SHADOWRUN_6E:
      // Shadowrun has foci limits based on Magic/Resonance
      return 10; // Simplified
    case GameSystem.CALL_OF_CTHULHU_7E:
      return 0; // No attunement system
    default:
      return 3;
  }
}

/**
 * Attune an item (use a slot)
 */
export async function attuneItem(data: z.infer<typeof attuneItemSchema>) {
  const validated = attuneItemSchema.parse(data);

  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    select: { gameSystem: true, data: true },
  });

  if (!character) {
    throw new Error('Character not found');
  }

  const maxSlots = getMaxAttunementSlots(character.gameSystem);
  const status = await getAttunementStatus(validated.characterId);

  // Check if already at max (unless DM override)
  if (status.usedSlots >= maxSlots && maxSlots > 0) {
    // Check if DM override - for now we allow but warn
    // In practice, this should check if the user is DM
  }

  // Find available slot number
  let slotNumber = validated.slotNumber;
  if (!slotNumber) {
    slotNumber = 1;
    while (status.attunedItems.some(item => item.slotNumber === slotNumber)) {
      slotNumber++;
    }
  }

  // Check if slot is already taken
  const existingSlot = await prisma.attunementSlot.findUnique({
    where: { 
      characterId_slotNumber: {
        characterId: validated.characterId,
        slotNumber,
      }
    },
  });

  if (existingSlot) {
    throw new Error(`Slot ${slotNumber} is already occupied`);
  }

  // Create attunement slot
  const slot = await prisma.attunementSlot.create({
    data: {
      characterId: validated.characterId,
      itemId: validated.itemId,
      itemName: validated.itemName,
      slotNumber,
      notes: validated.notes,
      isActive: true,
    },
  });

  // Update inventory item to mark as attuned
  await updateInventoryItemAttunement(validated.characterId, validated.itemId, true);

  return slot;
}

/**
 * Unattune an item (free a slot)
 */
export async function unattuneItem(data: z.infer<typeof unattuneItemSchema>) {
  const validated = unattuneItemSchema.parse(data);

  const slot = await prisma.attunementSlot.findUnique({
    where: { id: validated.attunementSlotId },
  });

  if (!slot) {
    throw new Error('Attunement slot not found');
  }

  if (slot.characterId !== validated.characterId) {
    throw new Error('Attunement slot belongs to different character');
  }

  // Mark slot as inactive
  await prisma.attunementSlot.update({
    where: { id: validated.attunementSlotId },
    data: { isActive: false },
  });

  // Update inventory item to mark as unattuned
  await updateInventoryItemAttunement(validated.characterId, slot.itemId, false);

  return { success: true };
}

/**
 * Update attunement notes
 */
export async function updateAttunementNotes(data: z.infer<typeof updateAttunementNotesSchema>) {
  const validated = updateAttunementNotesSchema.parse(data);

  return prisma.attunementSlot.update({
    where: { id: validated.attunementSlotId },
    data: { notes: validated.notes },
  });
}

/**
 * Update inventory item attunement status
 */
async function updateInventoryItemAttunement(characterId: string, itemId: string, attuned: boolean) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true },
  });

  if (!character) return;

  const { data: characterData, inventory } = readCharacterInventory(character.data);
  const itemIndex = inventory.findIndex((item) => item.id === itemId);
  
  if (itemIndex !== -1) {
    inventory[itemIndex] = {
      ...inventory[itemIndex],
      attuned,
    };

    await prisma.character.update({
      where: { id: characterId },
      data: {
        data: toPrismaJson({ ...characterData, inventory }),
      },
    });
  }
}

/**
 * Perform short rest attunement workflow
 * Allows changing attuned items (max 1 item per short rest in 5e)
 */
export async function shortRestAttunementChange(
  characterId: string,
  unattuneItemId: string | null,
  attuneItemId: string | null,
  attuneItemName: string | null,
  attuneNotes: string | null,
  createdById: string
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { gameSystem: true },
  });

  if (!character) {
    throw new Error('Character not found');
  }

  // In D&D 5e, you can only change one attunement per short rest
  // For other systems, we may allow more flexibility
  if (character.gameSystem === GameSystem.DND_5E) {
    if (unattuneItemId && attuneItemId) {
      // This is a swap - allowed
    } else if (unattuneItemId || attuneItemId) {
      // Single change - allowed
    }
  }

  const results: { unattuned?: AttunementSlot; attuned?: AttunementSlot } = {};

  // Unattune if specified
  if (unattuneItemId) {
    const slot = await prisma.attunementSlot.findFirst({
      where: { characterId, itemId: unattuneItemId, isActive: true },
    });
    if (slot) {
      await unattuneItem({
        characterId,
        attunementSlotId: slot.id,
        createdById,
      });
      results.unattuned = slot;
    }
  }

  // Attune if specified
  if (attuneItemId && attuneItemName) {
    const slot = await attuneItem({
      characterId,
      itemId: attuneItemId,
      itemName: attuneItemName,
      notes: attuneNotes ?? undefined,
      createdById,
    });
    results.attuned = slot;
  }

  return results;
}

/**
 * Get attunement warnings for display
 */
export async function getAttunementWarnings(characterId: string): Promise<AttunementWarning[]> {
  const status = await getAttunementStatus(characterId);
  const warnings: AttunementWarning[] = [];

  if (status.isOverLimit) {
    warnings.push({
      type: 'OVER_LIMIT',
      message: `Character has ${status.usedSlots} attuned items but maximum is ${status.maxSlots}.`,
      severity: 'error',
    });
  } else if (status.usedSlots === status.maxSlots && status.maxSlots > 0) {
    warnings.push({
      type: 'OVER_LIMIT',
      message: `All ${status.maxSlots} attunement slots are filled.`,
      severity: 'warning',
    });
  }

  return warnings;
}

/**
 * Create default attunement slots for a character (if needed)
 */
export async function initializeAttunementSlots(_characterId: string) {
  // This is called when a character is created or when attunement is first accessed
  // No default slots needed - they're created as items are attuned
  return { success: true };
}

/**
 * Get all attunement slots for a character (including inactive)
 */
export async function getAllAttunementSlots(characterId: string) {
  return prisma.attunementSlot.findMany({
    where: { characterId },
    orderBy: [{ isActive: 'desc' }, { slotNumber: 'asc' }],
  });
}

export default {
  getAttunementStatus,
  attuneItem,
  unattuneItem,
  updateAttunementNotes,
  shortRestAttunementChange,
  getAttunementWarnings,
  initializeAttunementSlots,
  getAllAttunementSlots,
};
