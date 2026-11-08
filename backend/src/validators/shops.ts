// ============================================
// Shop System Validators (Phase 7)
// ============================================

import { z } from 'zod';
import { ShopType, ShopItemType } from '@prisma/client';

// Currency schema for accepted currencies + exchange rates
const CurrencySchema = z.object({
  cp: z.number().int().min(0).default(0),
  sp: z.number().int().min(0).default(0),
  ep: z.number().int().min(0).default(0),
  gp: z.number().int().min(0).default(0),
  pp: z.number().int().min(0).default(0),
  nuyen: z.number().int().min(0).default(0),
  cash: z.number().min(0).default(0),
  custom: z.record(z.string(), z.number()).optional(),
  exchangeRates: z.record(z.string(), z.number()).optional(), // e.g., { "GP": 1, "SP": 10, "CP": 100 }
}).passthrough();

export type CurrencyInput = z.infer<typeof CurrencySchema>;

// Price override schema
const PriceOverrideSchema = z.object({
  cp: z.number().int().min(0).optional(),
  sp: z.number().int().min(0).optional(),
  ep: z.number().int().min(0).optional(),
  gp: z.number().int().min(0).optional(),
  pp: z.number().int().min(0).optional(),
  nuyen: z.number().int().min(0).optional(),
  cash: z.number().min(0).optional(),
  custom: z.record(z.string(), z.number()).optional(),
}).passthrough();

export type PriceOverrideInput = z.infer<typeof PriceOverrideSchema>;

// Restock rule schema
const RestockRuleSchema = z.object({
  interval: z.enum(['DAWN', 'WEEKLY', 'MONTHLY']),
  chance: z.number().min(0).max(1).default(0.5),
  maxRestock: z.number().int().min(1).max(100).default(3),
  items: z.array(z.string().uuid()).optional(), // Specific item IDs to restock, or all if omitted
}).passthrough();

export type RestockRuleInput = z.infer<typeof RestockRuleSchema>;

// Shop item schema for nested creation
const ShopItemInputSchema = z.object({
  itemType: z.nativeEnum(ShopItemType),
  itemRef: z.string().min(1, 'Item reference is required'),
  itemName: z.string().trim().min(1, 'Item name is required').max(200),
  itemData: z.any(), // Full item data snapshot
  stock: z.number().int().default(1),
  maxStock: z.number().int().default(-1),
  currentStock: z.number().int().default(1),
  priceOverride: PriceOverrideSchema.optional(),
  category: z.string().max(100).optional(),
  sortOrder: z.number().int().default(0),
  isVisible: z.boolean().default(true),
  notes: z.string().max(5000).optional(),
}).strip();

export type ShopItemInput = z.infer<typeof ShopItemInputSchema>;

/** POST /api/campaigns/:campaignId/shops */
export const CreateShopSchema = z.object({
  name: z.string().trim().min(1, 'Shop name is required').max(200),
  description: z.string().max(5000).optional(),
  type: z.nativeEnum(ShopType, { error: 'Invalid shop type' }),
  mapId: z.string().uuid().nullable().optional(),
  tokenId: z.string().max(255).optional(),
  buyModifier: z.number().min(0.1).max(10).default(1.0),
  sellModifier: z.number().min(0.01).max(5).default(0.5),
  currency: CurrencySchema.default({
    cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0, custom: {}, exchangeRates: {}
  }),
  restockRule: RestockRuleSchema.optional(),
  isActive: z.boolean().default(true),
  items: z.array(ShopItemInputSchema).default([]),
}).strip();

export type CreateShopInput = z.infer<typeof CreateShopSchema>;

/** PUT /api/campaigns/:campaignId/shops/:shopId */
export const UpdateShopSchema = z.object({
  name: z.string().trim().min(1, 'Shop name is required').max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  type: z.nativeEnum(ShopType, { error: 'Invalid shop type' }).optional(),
  mapId: z.string().uuid().nullable().optional(),
  tokenId: z.string().max(255).nullable().optional(),
  buyModifier: z.number().min(0.1).max(10).optional(),
  sellModifier: z.number().min(0.01).max(5).optional(),
  currency: CurrencySchema.optional(),
  restockRule: RestockRuleSchema.nullable().optional(),
  isActive: z.boolean().optional(),
}).strip();

export type UpdateShopInput = z.infer<typeof UpdateShopSchema>;

/** POST /api/campaigns/:campaignId/shops/:shopId/items */
export const CreateShopItemSchema = ShopItemInputSchema;

export type CreateShopItemInput = z.infer<typeof CreateShopItemSchema>;

/** PUT /api/campaigns/:campaignId/shops/:shopId/items/:itemId */
export const UpdateShopItemSchema = z.object({
  itemType: z.nativeEnum(ShopItemType).optional(),
  itemRef: z.string().min(1).optional(),
  itemName: z.string().trim().min(1).max(200).optional(),
  itemData: z.any().optional(),
  stock: z.number().int().min(-1).optional(),
  maxStock: z.number().int().min(-1).optional(),
  currentStock: z.number().int().min(0).optional(),
  priceOverride: PriceOverrideSchema.nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
}).strip();

export type UpdateShopItemInput = z.infer<typeof UpdateShopItemSchema>;

/** POST /api/campaigns/:campaignId/shops/:shopId/buy */
export const BuyItemsSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().uuid('Invalid item ID'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  })).min(1, 'At least one item is required'),
  currencyContainerId: z.string().uuid().optional(), // Specific container to pay from
}).strip();

export type BuyItemsInput = z.infer<typeof BuyItemsSchema>;

/** POST /api/campaigns/:campaignId/shops/:shopId/sell */
export const SellItemsSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().uuid('Invalid item ID'), // Character inventory item ID
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    shopItemId: z.string().uuid().optional(), // Shop item to add to (if restocking)
  })).min(1, 'At least one item is required'),
  currencyContainerId: z.string().uuid().optional(), // Specific container to receive currency
}).strip();

export type SellItemsInput = z.infer<typeof SellItemsSchema>;

/** POST /api/campaigns/:campaignId/shops/:shopId/restock */
export const RestockShopSchema = z.object({
  itemIds: z.array(z.string().uuid()).optional(), // Specific items to restock, or all if omitted
}).strip();

export type RestockShopInput = z.infer<typeof RestockShopSchema>;