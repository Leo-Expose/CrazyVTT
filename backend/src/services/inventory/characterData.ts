import { Prisma } from '@prisma/client';

export interface InventoryEntry {
  [key: string]: unknown;
  id?: string;
  name?: string;
  quantity?: number;
  weight?: number;
  notes?: string;
  requiresAttunement?: boolean;
  attuned?: boolean;
  attunementNotes?: string;
  slotNumber?: number;
  magical?: boolean;
  equipped?: boolean;
  containerId?: string | null;
  location?: string;
}

export function readCharacterInventory(value: Prisma.JsonValue): {
  data: Record<string, unknown>;
  inventory: InventoryEntry[];
} {
  const data = isJsonObject(value) ? value : {};
  const inventory = Array.isArray(data.inventory)
    ? data.inventory.filter(isJsonObject).map((item) => item as InventoryEntry)
    : [];
  return { data, inventory };
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
