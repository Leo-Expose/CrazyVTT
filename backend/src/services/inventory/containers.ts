/**
 * Container Service
 * Handles nested containers, capacity tracking, weight calculations,
 * and special containers (Bag of Holding, Portable Hole, Handy Haversack)
 */

import { InventoryContainer, ContainerType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { readCharacterInventory, toPrismaJson } from './characterData';

// Validation schemas
const createContainerSchema = z.object({
  characterId: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.nativeEnum(ContainerType).default(ContainerType.CUSTOM),
  parentId: z.string().uuid().optional(),
  capacity: z.number().min(0),
  capacityUnit: z.enum(['LBS', 'BULK', 'KG']).default('LBS'),
  baseWeight: z.number().min(0).default(0),
  isMagical: z.boolean().default(false),
  magicType: z.string().optional(),
  notes: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

const updateContainerSchema = createContainerSchema.partial().extend({
  id: z.string().uuid(),
});

const moveItemSchema = z.object({
  characterId: z.string().uuid(),
  itemId: z.string(), // Inventory item ID from Character.data.inventory
  fromContainerId: z.string().uuid().nullable(),
  toContainerId: z.string().uuid().nullable(),
});

export interface ContainerWithContents extends InventoryContainer {
  children: ContainerWithContents[];
  totalWeight: number;
  totalContentsWeight: number;
  remainingCapacity: number;
  isOverCapacity: boolean;
}

export interface ContainerTree {
  id: string;
  name: string;
  type: ContainerType;
  capacity: number;
  capacityUnit: string;
  baseWeight: number;
  totalWeight: number;
  totalContentsWeight: number;
  remainingCapacity: number;
  isOverCapacity: boolean;
  isMagical: boolean;
  magicType: string | null;
  children: ContainerTree[];
  items: ContainerItem[];
}

export interface ContainerItem {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  location: string;
  equipped: boolean;
  attuned: boolean;
  magical: boolean;
}

export interface WeightBreakdown {
  equipped: number;
  carried: number;
  stowed: number;
  containers: { [containerId: string]: number };
  total: number;
}

/**
 * Create a new container
 */
export async function createContainer(data: z.infer<typeof createContainerSchema>) {
  const validated = createContainerSchema.parse(data);
  
  // If parentId provided, verify it exists and belongs to same character
  if (validated.parentId) {
    const parent = await prisma.inventoryContainer.findUnique({
      where: { id: validated.parentId },
    });
    if (!parent) {
      throw new Error('Parent container not found');
    }
    if (parent.characterId !== validated.characterId) {
      throw new Error('Parent container belongs to different character');
    }
    // Check if adding this container would exceed parent capacity
    const parentWeight = await calculateContainerTotalWeight(parent.id);
    const newContainerWeight = validated.baseWeight;
    if (parentWeight + newContainerWeight > parent.capacity && parent.capacity > 0) {
      throw new Error('Adding this container would exceed parent capacity');
    }
  }

  // For magical containers, set special properties
  if (validated.isMagical && validated.magicType) {
    switch (validated.magicType) {
      case 'bag_of_holding':
        validated.capacity = 500; // 500 lbs
        validated.capacityUnit = 'LBS';
        validated.baseWeight = 15;
        break;
      case 'portable_hole':
        validated.capacity = 0; // No weight limit, volume based
        validated.capacityUnit = 'LBS';
        validated.baseWeight = 0;
        break;
      case 'handy_haversack':
        validated.capacity = 120; // 120 lbs
        validated.capacityUnit = 'LBS';
        validated.baseWeight = 5;
        break;
    }
  }

  return prisma.inventoryContainer.create({
    data: validated,
  });
}

/**
 * Get all containers for a character as a tree
 */
export async function getContainerTree(characterId: string): Promise<ContainerTree[]> {
  const containers = await prisma.inventoryContainer.findMany({
    where: { characterId },
    orderBy: { sortOrder: 'asc' },
  });

  // Build tree structure
  const containerMap = new Map<string, ContainerTree>();
  const rootContainers: ContainerTree[] = [];

  // Initialize all containers
  for (const container of containers) {
    containerMap.set(container.id, {
      id: container.id,
      name: container.name,
      type: container.type,
      capacity: container.capacity,
      capacityUnit: container.capacityUnit,
      baseWeight: container.baseWeight,
      totalWeight: 0,
      totalContentsWeight: 0,
      remainingCapacity: 0,
      isOverCapacity: false,
      isMagical: container.isMagical,
      magicType: container.magicType,
      children: [],
      items: [],
    });
  }

  // Build hierarchy
  for (const container of containers) {
    const treeNode = containerMap.get(container.id)!;
    if (container.parentId) {
      const parent = containerMap.get(container.parentId);
      if (parent) {
        parent.children.push(treeNode);
      } else {
        // Orphaned container, treat as root
        rootContainers.push(treeNode);
      }
    } else {
      rootContainers.push(treeNode);
    }
  }

  // Calculate weights for each container (bottom-up)
  await calculateTreeWeights(rootContainers, characterId);

  return rootContainers;
}

/**
 * Calculate weights for container tree (recursive, bottom-up)
 */
async function calculateTreeWeights(nodes: ContainerTree[], characterId: string): Promise<number> {
  let totalWeight = 0;

  for (const node of nodes) {
    // Get items directly in this container
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { data: true },
    });

    const { inventory } = readCharacterInventory(character?.data ?? null);
    const containerItems = inventory.filter((item) => item.containerId === node.id);
    
    node.items = containerItems.map((item) => ({
      id: item.id || '',
      name: item.name ?? '',
      quantity: item.quantity || 1,
      weight: item.weight || 0,
      location: item.location || 'CONTAINER',
      equipped: item.equipped || false,
      attuned: item.attuned || false,
      magical: item.magical || false,
    }));

    // Calculate weight of items in this container
    let contentsWeight = node.items.reduce((sum, item) => sum + item.weight * item.quantity, 0);
    
    // Add children weights
    const childrenWeight = await calculateTreeWeights(node.children, characterId);
    contentsWeight += childrenWeight;

    node.totalContentsWeight = contentsWeight;
    node.totalWeight = node.baseWeight + contentsWeight;
    node.remainingCapacity = node.capacity > 0 ? Math.max(0, node.capacity - contentsWeight) : Infinity;
    node.isOverCapacity = node.capacity > 0 && contentsWeight > node.capacity;

    totalWeight += node.totalWeight;
  }

  return totalWeight;
}

/**
 * Calculate total weight of a container (including nested containers and items)
 */
export async function calculateContainerTotalWeight(containerId: string): Promise<number> {
  const container = await prisma.inventoryContainer.findUnique({
    where: { id: containerId },
    include: { children: true },
  });

  if (!container) return 0;

  // Get character to access inventory
  const character = await prisma.character.findUnique({
    where: { id: container.characterId },
    select: { data: true },
  });

  const { inventory } = readCharacterInventory(character?.data ?? null);
  const containerItems = inventory.filter((item) => item.containerId === containerId);
  
  let weight = container.baseWeight;
  weight += containerItems.reduce((sum, item) => sum + (item.weight || 0) * (item.quantity || 1), 0);

  // Add children weights
  for (const child of container.children) {
    weight += await calculateContainerTotalWeight(child.id);
  }

  return weight;
}

/**
 * Move an item between containers
 */
export async function moveItemToContainer(data: z.infer<typeof moveItemSchema>) {
  const validated = moveItemSchema.parse(data);

  // Verify character owns the item
  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    select: { data: true },
  });

  if (!character) {
    throw new Error('Character not found');
  }

  const { data: characterData, inventory } = readCharacterInventory(character.data);
  const itemIndex = inventory.findIndex((item) => item.id === validated.itemId);
  
  if (itemIndex === -1) {
    throw new Error('Item not found in character inventory');
  }

  const item = inventory[itemIndex];
  const itemWeight = (item.weight || 0) * (item.quantity || 1);

  // If moving to a container, check capacity
  if (validated.toContainerId) {
    const targetContainer = await prisma.inventoryContainer.findUnique({
      where: { id: validated.toContainerId },
    });

    if (!targetContainer) {
      throw new Error('Target container not found');
    }

    if (targetContainer.characterId !== validated.characterId) {
      throw new Error('Target container belongs to different character');
    }

    // Check capacity (unless magical container with no weight limit)
    if (targetContainer.capacity > 0 && !(targetContainer.isMagical && targetContainer.magicType === 'portable_hole')) {
      const currentWeight = await calculateContainerTotalWeight(targetContainer.id);
      if (currentWeight + itemWeight > targetContainer.capacity) {
        throw new Error('Item would exceed container capacity');
      }
    }

    // Check for circular reference (moving container into itself or its descendant)
    if (await wouldCreateCircularReference(validated.itemId, validated.toContainerId, validated.characterId)) {
      throw new Error('Cannot move container into itself or its descendant');
    }
  }

  // If moving from a container, verify it was there
  if (validated.fromContainerId) {
    if (item.containerId !== validated.fromContainerId) {
      throw new Error('Item is not in the specified source container');
    }
  }

  // Update item location
  const newLocation = validated.toContainerId ? 'CONTAINER' : 'CARRIED';
  inventory[itemIndex] = {
    ...item,
    containerId: validated.toContainerId || undefined,
    location: newLocation,
  };

  // Save updated inventory
  await prisma.character.update({
    where: { id: validated.characterId },
    data: {
      data: toPrismaJson({ ...characterData, inventory }),
    },
  });

  return { success: true, item: inventory[itemIndex] };
}

/**
 * Check if moving an item would create a circular reference
 */
async function wouldCreateCircularReference(itemId: string, targetContainerId: string, characterId: string): Promise<boolean> {
  // Get the item to see if it's a container
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true },
  });

  const { inventory } = readCharacterInventory(character?.data ?? null);
  const item = inventory.find((entry) => entry.id === itemId);
  
  if (!item) return false;

  // If item is not a container, no circular reference possible
  const container = await prisma.inventoryContainer.findUnique({
    where: { id: itemId },
  });

  if (!container) return false;

  // Check if targetContainer is a descendant of item
  let current: string | null = targetContainerId;
  while (current) {
    if (current === itemId) return true;
    const parent: { parentId: string | null } | null = await prisma.inventoryContainer.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = parent?.parentId || null;
  }

  return false;
}

/**
 * Update container
 */
export async function updateContainer(data: z.infer<typeof updateContainerSchema>) {
  const validated = updateContainerSchema.parse(data);
  const { id, ...updateData } = validated;

  const container = await prisma.inventoryContainer.findUnique({
    where: { id },
  });

  if (!container) {
    throw new Error('Container not found');
  }

  // If changing parent, validate
  if (updateData.parentId !== undefined) {
    if (updateData.parentId === id) {
      throw new Error('Container cannot be its own parent');
    }
    if (updateData.parentId) {
      const parent = await prisma.inventoryContainer.findUnique({
        where: { id: updateData.parentId },
      });
      if (!parent) {
        throw new Error('Parent container not found');
      }
      if (parent.characterId !== container.characterId) {
        throw new Error('Parent container belongs to different character');
      }
      // Check circular reference
      let current: string | null = updateData.parentId;
      while (current) {
        if (current === id) {
          throw new Error('Cannot create circular reference');
        }
        const p: { parentId: string | null } | null = await prisma.inventoryContainer.findUnique({
          where: { id: current },
          select: { parentId: true },
        });
        current = p?.parentId || null;
      }
    }
  }

  return prisma.inventoryContainer.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Delete container (and move contents to parent or root)
 */
export async function deleteContainer(containerId: string, moveContentsToParent: boolean = true) {
  const container = await prisma.inventoryContainer.findUnique({
    where: { id: containerId },
    include: { children: true },
  });

  if (!container) {
    throw new Error('Container not found');
  }

  // Move child containers to parent
  if (moveContentsToParent) {
    for (const child of container.children) {
      await prisma.inventoryContainer.update({
        where: { id: child.id },
        data: { parentId: container.parentId },
      });
    }

    // Move items to parent container or root
    const character = await prisma.character.findUnique({
      where: { id: container.characterId },
      select: { data: true },
    });

    const { data: characterData, inventory } = readCharacterInventory(character?.data ?? null);
    for (let i = 0; i < inventory.length; i++) {
      if (inventory[i].containerId === containerId) {
        inventory[i] = {
          ...inventory[i],
          containerId: container.parentId || undefined,
          location: container.parentId ? 'CONTAINER' : 'CARRIED',
        };
      }
    }

    await prisma.character.update({
      where: { id: container.characterId },
      data: {
        data: toPrismaJson({ ...characterData, inventory }),
      },
    });
  }

  return prisma.inventoryContainer.delete({
    where: { id: containerId },
  });
}

/**
 * Get weight breakdown for character
 */
export async function getWeightBreakdown(characterId: string): Promise<WeightBreakdown> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true, gameSystem: true },
  });

  if (!character) {
    throw new Error('Character not found');
  }

  const { inventory } = readCharacterInventory(character.data);
  const containers = await prisma.inventoryContainer.findMany({
    where: { characterId },
  });

  const breakdown: WeightBreakdown = {
    equipped: 0,
    carried: 0,
    stowed: 0,
    containers: {},
    total: 0,
  };

  // Calculate container weights
  for (const container of containers) {
    const weight = await calculateContainerTotalWeight(container.id);
    breakdown.containers[container.id] = weight;
    breakdown.total += weight;
  }

  // Calculate item weights by location
  for (const item of inventory) {
    const weight = (item.weight || 0) * (item.quantity || 1);
    
    switch (item.location) {
      case 'EQUIPPED':
        breakdown.equipped += weight;
        break;
      case 'CARRIED':
        breakdown.carried += weight;
        break;
      case 'STOWED':
        breakdown.stowed += weight;
        break;
      case 'CONTAINER':
        // Already counted in container weight
        break;
    }
    
    // Only add to total if not in container (containers already include their items)
    if (!item.containerId) {
      breakdown.total += weight;
    }
  }

  return breakdown;
}

/**
 * Get container by ID with full details
 */
export async function getContainerWithDetails(containerId: string) {
  return prisma.inventoryContainer.findUnique({
    where: { id: containerId },
    include: {
      children: true,
      currencyContainers: true,
      character: {
        select: { data: true },
      },
    },
  });
}

/**
 * Create default containers for a new character
 */
export async function createDefaultContainers(characterId: string, gameSystem: string) {
  const defaults = getDefaultContainers(gameSystem);
  
  const created = [];
  for (const container of defaults) {
    const result = await createContainer({
      characterId,
      ...container,
      name: container.name!, // name is guaranteed to be present
    });
    created.push(result);
  }
  
  return created;
}

type DefaultContainer = Pick<z.infer<typeof createContainerSchema>, 'name' | 'type' | 'capacity' | 'capacityUnit' | 'baseWeight' | 'isMagical' | 'sortOrder'>;

export function getDefaultContainers(gameSystem: string): DefaultContainer[] {
  const baseContainers: DefaultContainer[] = [
    { name: 'Backpack', type: ContainerType.BACKPACK, capacity: 30, capacityUnit: 'LBS', baseWeight: 5, isMagical: false, sortOrder: 0 },
    { name: 'Belt Pouch', type: ContainerType.BELT_POUCH, capacity: 6, capacityUnit: 'LBS', baseWeight: 1, isMagical: false, sortOrder: 1 },
  ];

  if (gameSystem === 'PATHFINDER_2E') {
    return baseContainers.map(c => ({ ...c, capacityUnit: 'BULK' as const, capacity: c.capacity / 10 }));
  }

  return baseContainers;
}

export default {
  createContainer,
  getContainerTree,
  calculateContainerTotalWeight,
  moveItemToContainer,
  updateContainer,
  deleteContainer,
  getWeightBreakdown,
  getContainerWithDetails,
  createDefaultContainers,
};
