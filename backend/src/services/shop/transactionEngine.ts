// ============================================
// Shop Transaction Engine (Phase 7)
// Handles buy/sell transactions with inventory/currency integration
// ============================================

import { Prisma, PrismaClient, ShopItemType } from '@prisma/client';
import { addCurrency as addCurrencyRecord, getTotalCurrency, removeCurrency } from '../inventory/currency.js';
import type { RestockRuleInput } from '../../validators/shops.js';
import { readCharacterInventory, toPrismaJson, type InventoryEntry } from '../inventory/characterData.js';

interface BuyItemInput {
  itemId: string;
  quantity: number;
}

interface SellItemInput {
  itemId: string; // Character inventory item ID
  quantity: number;
  shopItemId?: string; // Shop item to add stock to
}

interface TransactionResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  items?: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: PriceBreakdown;
    totalPrice: PriceBreakdown;
  }>;
  currency?: PriceBreakdown;
}

interface PriceBreakdown {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  nuyen: number;
  cash: number;
  custom?: Record<string, number>;
}

type PriceKey = 'cp' | 'sp' | 'ep' | 'gp' | 'pp' | 'nuyen' | 'cash';
const PRICE_KEYS: readonly PriceKey[] = ['cp', 'sp', 'ep', 'gp', 'pp', 'nuyen', 'cash'];
type LoadedShopItem = Prisma.ShopItemGetPayload<Record<string, never>>;

function isPriceBreakdown(value: unknown): value is PriceBreakdown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return PRICE_KEYS.every((key) => typeof (value as Record<string, unknown>)[key] === 'number');
}

interface CurrencyGateway {
  getCharacterCurrencySummary(characterId: string): Promise<PriceBreakdown>;
  spendCurrency(
    characterId: string,
    amount: PriceBreakdown,
    description: string,
    sourceType: string,
    sourceId: string,
    containerId: string | undefined,
    createdById: string,
  ): Promise<{ success: boolean; error?: string }>;
  addCurrency(
    characterId: string,
    amount: PriceBreakdown,
    description: string,
    sourceType: string,
    sourceId: string,
    containerId: string | undefined,
    createdById: string,
  ): Promise<{ success: boolean; error?: string }>;
}

export class ShopTransactionEngine {
  private prisma: PrismaClient;
  private currencyService: CurrencyGateway;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.currencyService = {
      getCharacterCurrencySummary: async (characterId) => getTotalCurrency(characterId),
      spendCurrency: async (characterId, amount, description, _sourceType, sourceId, containerId, createdById) => {
        try {
          await removeCurrency({ characterId, containerId, ...amount, description, sourceType: 'SHOP', sourceId, createdById });
          return { success: true };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to remove currency' };
        }
      },
      addCurrency: async (characterId, amount, description, _sourceType, sourceId, containerId, createdById) => {
        try {
          await addCurrencyRecord({ characterId, containerId, ...amount, description, sourceType: 'SHOP', sourceId, createdById });
          return { success: true };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to add currency' };
        }
      },
    };
  }

  /**
   * Process a buy transaction
   */
  async buyItems(
    shopId: string,
    userId: string,
    characterId: string,
    items: BuyItemInput[],
    currencyContainerId?: string
  ): Promise<TransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Verify shop exists and is active
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        include: {
          items: {
            where: { isVisible: true, id: { in: items.map(i => i.itemId) } },
          },
        },
      });

      if (!shop) {
        return { success: false, error: 'Shop not found' };
      }

      if (!shop.isActive) {
        return { success: false, error: 'Shop is currently closed' };
      }

      // 2. Check stock and calculate prices
      const purchaseItems: Array<{
        shopItem: typeof shop.items[0];
        quantity: number;
        unitPrice: PriceBreakdown;
        totalPrice: PriceBreakdown;
      }> = [];

      for (const buyItem of items) {
        const shopItem = shop.items.find(i => i.id === buyItem.itemId);
        if (!shopItem) {
          return { success: false, error: `Item ${buyItem.itemId} not found in shop` };
        }

        if (shopItem.stock !== -1 && shopItem.currentStock < buyItem.quantity) {
          return { success: false, error: `Insufficient stock for ${shopItem.itemName}. Available: ${shopItem.currentStock}` };
        }

        // Calculate price with buy modifier
        const basePrice = shopItem.priceOverride as PriceBreakdown | null;
        const itemData = shopItem.itemData as { price?: PriceBreakdown };
        const price = (basePrice || itemData.price || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 }) as PriceBreakdown;
        const unitPrice = this.applyModifier(price, shop.buyModifier);
        const totalPrice = this.multiplyPrice(unitPrice, buyItem.quantity);

        purchaseItems.push({ shopItem, quantity: buyItem.quantity, unitPrice, totalPrice });
      }

      // 3. Calculate total cost
      const totalCost = this.sumPrices(purchaseItems.map(p => p.totalPrice));

      // 4. Check player currency
      const characterCurrency = await this.currencyService.getCharacterCurrencySummary(characterId);
      if (!this.hasSufficientCurrency(characterCurrency, totalCost)) {
        return { success: false, error: 'Insufficient funds' };
      }

      // 5. Check weight/encumbrance
      const weightCheck = await this.checkWeightCapacity(characterId, purchaseItems, tx);
      if (!weightCheck.canCarry) {
        return { success: false, error: `Cannot carry items: ${weightCheck.reason}` };
      }

      // 6. Deduct currency from player
      const currencyResult = await this.currencyService.spendCurrency(
        characterId,
        totalCost,
        `Purchase from ${shop.name}`,
        'SHOP',
        shopId,
        currencyContainerId,
        userId
      );

      if (!currencyResult.success) {
        return { success: false, error: currencyResult.error || 'Failed to deduct currency' };
      }

      // 7. Add items to player inventory
      for (const purchase of purchaseItems) {
        await this.addItemToInventory(
          characterId,
          purchase.shopItem,
          purchase.quantity,
          tx
        );
      }

      // 8. Decrement shop stock
      for (const purchase of purchaseItems) {
        if (purchase.shopItem.stock !== -1) {
          await tx.shopItem.update({
            where: { id: purchase.shopItem.id },
            data: { currentStock: { decrement: purchase.quantity } },
          });
        }
      }

      // 9. Create transaction record
      const transaction = await tx.shopTransaction.create({
        data: {
          shopId,
          userId,
          type: 'BUY',
          items: purchaseItems.map(p => ({
            itemId: p.shopItem.id,
            itemName: p.shopItem.itemName,
            qty: p.quantity,
            unitPrice: p.unitPrice,
            totalPrice: p.totalPrice,
          })) as unknown as Prisma.InputJsonValue,
          currency: totalCost as unknown as Prisma.InputJsonValue,
        },
      });

      // 10. Update or create shop visit
      await this.recordVisit(shopId, userId, tx, purchaseItems.map(p => ({
        itemId: p.shopItem.id,
        qty: p.quantity,
        pricePaid: p.totalPrice,
      })), []);

      // 11. Broadcast update via WebSocket (will be handled by route)
      return {
        success: true,
        transactionId: transaction.id,
        items: purchaseItems.map(p => ({
          itemId: p.shopItem.id,
          itemName: p.shopItem.itemName,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          totalPrice: p.totalPrice,
        })),
        currency: totalCost,
      };
    });
  }

  /**
   * Process a sell transaction
   */
  async sellItems(
    shopId: string,
    userId: string,
    characterId: string,
    items: SellItemInput[],
    currencyContainerId?: string
  ): Promise<TransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Verify shop exists and is active
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        include: { items: true },
      });

      if (!shop) {
        return { success: false, error: 'Shop not found' };
      }

      if (!shop.isActive) {
        return { success: false, error: 'Shop is currently closed' };
      }

      // 2. Check items in character inventory and calculate sell prices
      const sellItems: Array<{
        characterItem: InventoryEntry & { id: string };
        shopItem?: typeof shop.items[0];
        quantity: number;
        unitPrice: PriceBreakdown;
        totalPrice: PriceBreakdown;
      }> = [];

      for (const sellItem of items) {
        // Find item in character inventory
        const character = await tx.character.findUnique({
          where: { id: characterId },
          select: { data: true },
        });

        if (!character) {
          return { success: false, error: 'Character not found' };
        }

        const characterItem = this.findInventoryItem(character.data, sellItem.itemId);
        
        if (!characterItem) {
          return { success: false, error: `Item not found in inventory` };
        }

        if ((characterItem.quantity || 1) < sellItem.quantity) {
          return { success: false, error: `Insufficient quantity in inventory` };
        }

        // Determine base price from character item data
        const candidatePrice = characterItem.price ?? characterItem.value;
        const basePrice = isPriceBreakdown(candidatePrice)
          ? candidatePrice
          : { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
        const unitPrice = this.applyModifier(basePrice, shop.sellModifier);
        const totalPrice = this.multiplyPrice(unitPrice, sellItem.quantity);

        // Check if this matches a shop item for restocking
        let shopItem: typeof shop.items[0] | undefined;
        if (sellItem.shopItemId) {
          shopItem = shop.items.find(i => i.id === sellItem.shopItemId);
        } else {
          // Try to match by name/type
          shopItem = shop.items.find(i => 
            i.itemName.toLowerCase() === characterItem.name?.toLowerCase() &&
            i.itemType === this.mapItemType(typeof characterItem.type === 'string' ? characterItem.type : '')
          );
        }

        sellItems.push({ characterItem, shopItem, quantity: sellItem.quantity, unitPrice, totalPrice });
      }

      // 3. Calculate total payout
      const totalPayout = this.sumPrices(sellItems.map(s => s.totalPrice));

      // 4. Remove items from character inventory
      for (const sellItem of sellItems) {
        await this.removeItemFromInventory(characterId, sellItem.characterItem.id, sellItem.quantity, tx);
      }

      // 5. Add currency to player
      const currencyResult = await this.currencyService.addCurrency(
        characterId,
        totalPayout,
        `Sale to ${shop.name}`,
        'SHOP',
        shopId,
        currencyContainerId,
        userId
      );

      if (!currencyResult.success) {
        return { success: false, error: currencyResult.error || 'Failed to add currency' };
      }

      // 6. Increment shop stock if matched to shop item
      for (const sellItem of sellItems) {
        if (sellItem.shopItem && sellItem.shopItem.stock !== -1) {
          const newStock = Math.min(
            sellItem.shopItem.currentStock + sellItem.quantity,
            sellItem.shopItem.maxStock === -1 ? 999999 : sellItem.shopItem.maxStock
          );
          await tx.shopItem.update({
            where: { id: sellItem.shopItem.id },
            data: { currentStock: newStock },
          });
        }
      }

      // 7. Create transaction record
      const transaction = await tx.shopTransaction.create({
        data: {
          shopId,
          userId,
          type: 'SELL',
          items: sellItems.map(s => ({
            itemId: s.characterItem.id,
            itemName: s.characterItem.name,
            qty: s.quantity,
            unitPrice: s.unitPrice,
            totalPrice: s.totalPrice,
          })) as unknown as Prisma.InputJsonValue,
          currency: totalPayout as unknown as Prisma.InputJsonValue,
        },
      });

      // 8. Update or create shop visit
      await this.recordVisit(shopId, userId, tx, [], sellItems.map(s => ({
        itemId: s.characterItem.id,
        qty: s.quantity,
        priceReceived: s.totalPrice,
      })));

      return {
        success: true,
        transactionId: transaction.id,
        items: sellItems.map(s => ({
          itemId: s.characterItem.id,
          itemName: s.characterItem.name ?? s.characterItem.id,
          quantity: s.quantity,
          unitPrice: s.unitPrice,
          totalPrice: s.totalPrice,
        })),
        currency: totalPayout,
      };
    });
  }

  /**
   * Get shop with items for browsing
   */
  async getShopForBrowse(shopId: string, _userId: string, isDM: boolean) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        items: {
          where: isDM ? {} : { isVisible: true },
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { itemName: 'asc' }],
        },
      },
    });

    if (!shop) return null;

    // For players, filter out DM notes
    if (!isDM) {
      return {
        ...shop,
        items: shop.items.map(item => ({
          ...item,
          notes: undefined,
        })),
      };
    }

    return shop;
  }

  /**
   * Restock shop items
   */
  async restockShop(shopId: string, itemIds?: string[]) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop || !shop.restockRule) {
      return { success: false, error: 'Shop not found or no restock rule configured' };
    }

    const rule = shop.restockRule as unknown as RestockRuleInput;
    const items = await this.prisma.shopItem.findMany({ where: { shopId } });
    const itemsToRestock = itemIds 
      ? items.filter(i => itemIds.includes(i.id))
      : items.filter(i => i.stock !== -1 && i.currentStock < (i.maxStock === -1 ? 999999 : i.maxStock));

    const results = [];

    for (const item of itemsToRestock) {
      const shouldRestock = Math.random() < rule.chance;
      if (!shouldRestock) {
        results.push({ itemId: item.id, restocked: 0, reason: 'Chance roll failed' });
        continue;
      }

      const maxStock = item.maxStock === -1 ? 999999 : item.maxStock;
      const spaceAvailable = maxStock - item.currentStock;
      const restockAmount = Math.min(rule.maxRestock, spaceAvailable);

      if (restockAmount <= 0) {
        results.push({ itemId: item.id, restocked: 0, reason: 'Already at max stock' });
        continue;
      }

      await this.prisma.shopItem.update({
        where: { id: item.id },
        data: { currentStock: { increment: restockAmount } },
      });

      results.push({ itemId: item.id, restocked: restockAmount });
    }

    return { success: true, results };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private applyModifier(price: PriceBreakdown, modifier: number): PriceBreakdown {
    const result: PriceBreakdown = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
    for (const [key, value] of Object.entries(price)) {
      if (typeof value === 'number' && key !== 'custom') {
        if (PRICE_KEYS.includes(key as PriceKey)) result[key as PriceKey] = Math.round(value * modifier);
      }
    }
    if (price.custom) {
      result.custom = {};
      for (const [key, value] of Object.entries(price.custom)) {
        result.custom![key] = Math.round(value * modifier);
      }
    }
    return result;
  }

  private multiplyPrice(price: PriceBreakdown, quantity: number): PriceBreakdown {
    const result: PriceBreakdown = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
    for (const [key, value] of Object.entries(price)) {
      if (typeof value === 'number' && key !== 'custom') {
        if (PRICE_KEYS.includes(key as PriceKey)) result[key as PriceKey] = value * quantity;
      }
    }
    if (price.custom) {
      result.custom = {};
      for (const [key, value] of Object.entries(price.custom)) {
        result.custom![key] = value * quantity;
      }
    }
    return result;
  }

  private sumPrices(prices: PriceBreakdown[]): PriceBreakdown {
    const result: PriceBreakdown = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
    for (const price of prices) {
      for (const [key, value] of Object.entries(price)) {
        if (typeof value === 'number' && key !== 'custom') {
          if (PRICE_KEYS.includes(key as PriceKey)) result[key as PriceKey] += value;
        }
      }
      if (price.custom) {
        result.custom = result.custom || {};
        for (const [key, value] of Object.entries(price.custom)) {
          result.custom![key] = (result.custom![key] || 0) + value;
        }
      }
    }
    return result;
  }

  private hasSufficientCurrency(characterCurrency: PriceBreakdown, cost: PriceBreakdown): boolean {
    // Convert all to copper for comparison
    const characterTotal = this.convertToCopper(characterCurrency);
    const costTotal = this.convertToCopper(cost);
    return characterTotal >= costTotal;
  }

  private convertToCopper(currency: PriceBreakdown): number {
    // Standard D&D 5e conversion: 1 PP = 10 GP = 50 EP = 100 SP = 1000 CP
    // This is simplified - in practice you'd use the campaign's exchange rates
    let total = (currency.cp || 0);
    total += (currency.sp || 0) * 10;
    total += (currency.ep || 0) * 50;
    total += (currency.gp || 0) * 100;
    total += (currency.pp || 0) * 1000;
    total += (currency.nuyen || 0) * 100; // Shadowrun: 1 nuyen ≈ 1 GP
    total += (currency.cash || 0) * 100; // CoC: $1 ≈ 1 GP (rough)
    if (currency.custom) {
      for (const value of Object.values(currency.custom)) {
        total += value * 100; // Assume custom currencies are GP-equivalent
      }
    }
    return total;
  }

  private async checkWeightCapacity(
    characterId: string,
    purchaseItems: Array<{ shopItem: LoadedShopItem; quantity: number }>,
    tx: Prisma.TransactionClient
  ): Promise<{ canCarry: boolean; reason?: string }> {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: { data: true },
    });

    if (!character) return { canCarry: false, reason: 'Character not found' };

    const charData = character.data !== null && typeof character.data === 'object' && !Array.isArray(character.data)
      ? character.data as Prisma.JsonObject & { encumbrance?: { currentWeight?: number; maxWeight?: number } }
      : {};
    const currentWeight = charData.encumbrance?.currentWeight || 0;
    const maxWeight = charData.encumbrance?.maxWeight || 300; // Default 300 lbs

    let additionalWeight = 0;
    for (const purchase of purchaseItems) {
      const itemData = purchase.shopItem.itemData;
      const itemWeight = itemData !== null && typeof itemData === 'object' && !Array.isArray(itemData)
        && typeof itemData.weight === 'number'
        ? itemData.weight
        : 0;
      additionalWeight += itemWeight * purchase.quantity;
    }

    if (currentWeight + additionalWeight > maxWeight) {
      return { 
        canCarry: false, 
        reason: `Would exceed carry capacity (${currentWeight + additionalWeight}/${maxWeight} lbs)` 
      };
    }

    return { canCarry: true };
  }

  private async addItemToInventory(
    characterId: string,
    shopItem: LoadedShopItem,
    quantity: number,
    tx: Prisma.TransactionClient
  ) {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: { data: true, containers: { include: { currencyContainers: true } } },
    });

    if (!character) throw new Error('Character not found');

    const { data: charData, inventory } = readCharacterInventory(character.data);
    
    // Create item entry
    const newItem = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...(shopItem.itemData !== null && typeof shopItem.itemData === 'object' && !Array.isArray(shopItem.itemData) ? shopItem.itemData : {}),
      name: shopItem.itemName,
      quantity,
      acquiredFrom: 'SHOP',
      acquiredAt: new Date().toISOString(),
    };

    inventory.push(newItem);
    
    // Update character data
    await tx.character.update({
      where: { id: characterId },
      data: { data: toPrismaJson({ ...charData, inventory }) },
    });
  }

  private async removeItemFromInventory(
    characterId: string,
    itemId: string,
    quantity: number,
    tx: Prisma.TransactionClient
  ) {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: { data: true },
    });

    if (!character) throw new Error('Character not found');

    const { data: charData, inventory } = readCharacterInventory(character.data);
    
    const itemIndex = inventory.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) throw new Error('Item not found in inventory');

    const item = inventory[itemIndex];
    const currentQty = item.quantity || 1;

    if (currentQty <= quantity) {
      inventory.splice(itemIndex, 1);
    } else {
      inventory[itemIndex] = { ...item, quantity: currentQty - quantity };
    }

    await tx.character.update({
      where: { id: characterId },
      data: { data: toPrismaJson({ ...charData, inventory }) },
    });
  }

  private findInventoryItem(inventory: Prisma.JsonValue, itemId: string): (InventoryEntry & { id: string }) | undefined {
    return readCharacterInventory(inventory).inventory.find(
      (item): item is InventoryEntry & { id: string } => typeof item.id === 'string' && item.id === itemId
    );
  }

  private mapItemType(type: string): ShopItemType {
    const typeMap: Record<string, ShopItemType> = {
      'weapon': 'RULEBOOK_ITEM',
      'armor': 'RULEBOOK_ITEM',
      'potion': 'RULEBOOK_ITEM',
      'scroll': 'RULEBOOK_SPELL',
      'wondrous': 'RULEBOOK_ITEM',
      'ammunition': 'RULEBOOK_ITEM',
      'trade-goods': 'RULEBOOK_ITEM',
      'spell': 'RULEBOOK_SPELL',
      'monster-part': 'RULEBOOK_MONSTER_PART',
      'template': 'CHARACTER_TEMPLATE',
      'token': 'TOKEN_TEMPLATE',
      'loot': 'LOOT_TABLE',
    };
    return typeMap[type?.toLowerCase()] || 'CUSTOM_ITEM';
  }

  private async recordVisit(
    shopId: string,
    userId: string,
    tx: Prisma.TransactionClient,
    purchases: Array<{ itemId: string; qty: number; pricePaid: PriceBreakdown }>,
    sales: Array<{ itemId: string; qty: number; priceReceived: PriceBreakdown }>
  ) {
    // Find existing visit today or create new
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const visit = await tx.shopVisit.findFirst({
      where: {
        shopId,
        userId,
        visitedAt: { gte: today, lt: tomorrow },
      },
    });

    if (visit) {
      const existingPurchases = Array.isArray(visit.purchases) ? visit.purchases : [];
      const existingSales = Array.isArray(visit.sales) ? visit.sales : [];
      
      await tx.shopVisit.update({
        where: { id: visit.id },
        data: {
          purchases: toPrismaJson([...existingPurchases, ...purchases]),
          sales: toPrismaJson([...existingSales, ...sales]),
        },
      });
    } else {
      await tx.shopVisit.create({
        data: {
          shopId,
          userId,
          purchases: purchases as unknown as Prisma.InputJsonValue,
          sales: sales as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
}
