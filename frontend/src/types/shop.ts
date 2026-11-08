/* eslint-disable @typescript-eslint/no-explicit-any -- itemData is intentionally system-specific JSON. */
// ============================================
// Shop System Types (Phase 7)
// ============================================

export type ShopType = 
  | 'GENERAL' 
  | 'MAGIC' 
  | 'BLACKSMITH' 
  | 'ALCHEMIST' 
  | 'TEMPLE' 
  | 'BLACK_MARKET' 
  | 'CUSTOM';

export type ShopItemType = 
  | 'RULEBOOK_SPELL' 
  | 'RULEBOOK_ITEM' 
  | 'RULEBOOK_MONSTER_PART' 
  | 'CUSTOM_ITEM' 
  | 'CHARACTER_TEMPLATE' 
  | 'TOKEN_TEMPLATE' 
  | 'LOOT_TABLE';

export type TransactionType = 'BUY' | 'SELL';

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  nuyen: number;
  cash: number;
  custom?: Record<string, number>;
  exchangeRates?: Record<string, number>;
}

export interface PriceOverride {
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
  nuyen?: number;
  cash?: number;
  custom?: Record<string, number>;
}

export interface RestockRule {
  interval: 'DAWN' | 'WEEKLY' | 'MONTHLY';
  chance: number;
  maxRestock: number;
  items?: string[];
}

export interface Shop {
  id: string;
  campaignId: string;
  name: string;
  description?: string;
  type: ShopType;
  mapId?: string;
  tokenId?: string;
  buyModifier: number;
  sellModifier: number;
  currency: Currency;
  restockRule?: RestockRule;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  items?: ShopItem[];
  visits?: ShopVisit[];
  transactions?: ShopTransaction[];
  map?: { id: string; name: string };
  createdBy?: { id: string; displayName: string };
}

export interface ShopItem {
  id: string;
  shopId: string;
  itemType: ShopItemType;
  itemRef: string;
  itemName: string;
  itemData: any;
  stock: number;
  maxStock: number;
  currentStock: number;
  priceOverride?: PriceOverride;
  category?: string;
  sortOrder: number;
  isVisible: boolean;
  notes?: string;
}

export interface ShopVisit {
  id: string;
  shopId: string;
  userId: string;
  visitedAt: string;
  purchases: Array<{ itemId: string; qty: number; pricePaid: Currency }>;
  sales: Array<{ itemId: string; qty: number; priceReceived: Currency }>;
  user?: { id: string; displayName: string };
}

export interface ShopTransaction {
  id: string;
  shopId: string;
  userId: string;
  type: TransactionType;
  items: Array<{
    itemId: string;
    itemName: string;
    qty: number;
    unitPrice: Currency;
    totalPrice: Currency;
  }>;
  currency: Currency;
  createdAt: string;
  user?: { id: string; displayName: string };
}

export interface CreateShopInput {
  campaignId: string;
  name: string;
  description?: string;
  type: ShopType;
  mapId?: string;
  tokenId?: string;
  buyModifier?: number;
  sellModifier?: number;
  currency: Currency;
  restockRule?: RestockRule;
  isActive?: boolean;
  items?: CreateShopItemInput[];
}

export interface UpdateShopInput {
  name?: string;
  description?: string | null;
  type?: ShopType;
  mapId?: string | null;
  tokenId?: string | null;
  buyModifier?: number;
  sellModifier?: number;
  currency?: Currency;
  restockRule?: RestockRule | null;
  isActive?: boolean;
}

export interface CreateShopItemInput {
  itemType: ShopItemType;
  itemRef: string;
  itemName: string;
  itemData: any;
  stock?: number;
  maxStock?: number;
  currentStock?: number;
  priceOverride?: PriceOverride;
  category?: string;
  sortOrder?: number;
  isVisible?: boolean;
  notes?: string;
}

export interface UpdateShopItemInput {
  itemType?: ShopItemType;
  itemRef?: string;
  itemName?: string;
  itemData?: any;
  stock?: number;
  maxStock?: number;
  currentStock?: number;
  priceOverride?: PriceOverride | null;
  category?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
  notes?: string | null;
}

export interface BuyItemsInput {
  items: Array<{ itemId: string; quantity: number }>;
  currencyContainerId?: string;
}

export interface SellItemsInput {
  items: Array<{ itemId: string; quantity: number; shopItemId?: string }>;
  currencyContainerId?: string;
}

export interface RestockShopInput {
  itemIds?: string[];
}
