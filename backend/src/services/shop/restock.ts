// ============================================
// Shop Restock System (Phase 7)
// Scheduled job for automatic restocking
// ============================================

import { PrismaClient, Prisma } from '@prisma/client';

export interface RestockResult {
  shopId: string;
  shopName: string;
  itemsRestocked: Array<{
    itemId: string;
    itemName: string;
    quantityAdded: number;
  }>;
  timestamp: Date;
}

interface RestockRule {
  interval?: 'DAWN' | 'WEEKLY' | 'MONTHLY';
  chance?: number;
  maxRestock?: number;
}

interface RestockItemResult {
  itemId: string;
  restocked: number;
  reason?: string;
}

interface RestockOutcome {
  success: boolean;
  results: RestockItemResult[];
  error?: string;
}

function isRestockRule(value: Prisma.JsonValue): value is Prisma.JsonObject & RestockRule {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class ShopRestockService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Run restock for all active shops with restock rules
   * Called by scheduled job
   */
  async runScheduledRestock(interval: 'DAWN' | 'WEEKLY' | 'MONTHLY'): Promise<RestockResult[]> {
    const shops = await this.prisma.shop.findMany({
      where: {
        isActive: true,
        restockRule: {
          not: Prisma.JsonNull,
        },
      },
    });

    const results: RestockResult[] = [];

    for (const shop of shops) {
      const shopItems = await this.prisma.shopItem.findMany({ where: { shopId: shop.id } });
      if (!shop.restockRule || !isRestockRule(shop.restockRule) || shop.restockRule.interval !== interval) continue;

      const result = await this.restockShop(shop.id);
      if (result.success) {
        results.push({
          shopId: shop.id,
          shopName: shop.name,
          itemsRestocked: result.results
            .filter((result) => result.restocked > 0)
            .map((result) => {
              const item = shopItems.find(i => i.id === result.itemId);
              return {
                itemId: result.itemId,
                itemName: item?.itemName || 'Unknown',
                quantityAdded: result.restocked,
              };
            }),
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Restock a specific shop
   */
  async restockShop(shopId: string): Promise<RestockOutcome> {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      return { success: false, results: [], error: 'Shop not found' };
    }

    if (!shop.restockRule) {
      return { success: false, results: [], error: 'No restock rule configured' };
    }

    if (!isRestockRule(shop.restockRule)) {
      return { success: false, results: [], error: 'Invalid restock rule' };
    }
    const rule = shop.restockRule;
    const items = await this.prisma.shopItem.findMany({ where: { shopId } });
    const itemsToRestock = items.filter(
      i => i.stock !== -1 && i.currentStock < (i.maxStock === -1 ? 999999 : i.maxStock)
    );

    const results: RestockItemResult[] = [];

    for (const item of itemsToRestock) {
      const shouldRestock = Math.random() < (rule.chance || 0.5);
      if (!shouldRestock) {
        results.push({ itemId: item.id, restocked: 0, reason: 'Chance roll failed' });
        continue;
      }

      const maxStock = item.maxStock === -1 ? 999999 : item.maxStock;
      const spaceAvailable = maxStock - item.currentStock;
      const restockAmount = Math.min(rule.maxRestock || 3, spaceAvailable);

      if (restockAmount <= 0) {
        results.push({ itemId: item.id, restocked: 0, reason: 'Already at max stock' });
        continue;
      }

      await this.prisma.shopItem.update({
        where: { id: item.id },
        data: { currentStock: { increment: restockAmount } },
      });

      // Log restock event
      await this.prisma.shopTransaction.create({
        data: {
          shopId,
          userId: shop.createdById, // System action attributed to shop creator
          type: 'BUY', // Using BUY as restock type (could add RESTOCK enum)
          items: [{
            itemId: item.id,
            itemName: item.itemName,
            qty: restockAmount,
            unitPrice: { gp: 0 },
            totalPrice: { gp: 0 },
            restock: true,
          }],
          currency: { gp: 0 },
        },
      });

      results.push({ itemId: item.id, restocked: restockAmount });
    }

    return { success: true, results };
  }

  /**
   * Get shops due for restock based on interval
   */
  async getShopsDueForRestock(interval: 'DAWN' | 'WEEKLY' | 'MONTHLY'): Promise<string[]> {
    const shops = await this.prisma.shop.findMany({
      where: {
        isActive: true,
        restockRule: {
          path: ['interval'],
          equals: interval,
        },
      },
      select: { id: true },
    });

    return shops.map(s => s.id);
  }

  /**
   * Manual restock trigger (DM button)
   */
  async manualRestock(shopId: string, itemIds?: string[]): Promise<RestockOutcome> {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      return { success: false, results: [], error: 'Shop not found' };
    }

    if (!shop.restockRule) {
      return { success: false, results: [], error: 'No restock rule configured' };
    }

    if (!isRestockRule(shop.restockRule)) {
      return { success: false, results: [], error: 'Invalid restock rule' };
    }
    const rule = shop.restockRule;
    const items = await this.prisma.shopItem.findMany({ where: { shopId } });
    const itemsToRestock = itemIds
      ? items.filter(i => itemIds.includes(i.id))
      : items.filter(i => i.stock !== -1 && i.currentStock < (i.maxStock === -1 ? 999999 : i.maxStock));

    const results: RestockItemResult[] = [];

    for (const item of itemsToRestock) {
      // Manual restock ignores chance, always restocks up to maxRestock
      const maxStock = item.maxStock === -1 ? 999999 : item.maxStock;
      const spaceAvailable = maxStock - item.currentStock;
      const restockAmount = Math.min(rule.maxRestock || 3, spaceAvailable);

      if (restockAmount <= 0) {
        results.push({ itemId: item.id, restocked: 0, reason: 'Already at max stock' });
        continue;
      }

      await this.prisma.shopItem.update({
        where: { id: item.id },
        data: { currentStock: { increment: restockAmount } },
      });

      // Log restock event
      await this.prisma.shopTransaction.create({
        data: {
          shopId,
          userId: shop.createdById,
          type: 'BUY',
          items: [{
            itemId: item.id,
            itemName: item.itemName,
            qty: restockAmount,
            unitPrice: { gp: 0 },
            totalPrice: { gp: 0 },
            restock: true,
            manual: true,
          }],
          currency: { gp: 0 },
        },
      });

      results.push({ itemId: item.id, restocked: restockAmount });
    }

    return { success: true, results };
  }
}

// ============================================
// Cron Job Setup
// ============================================

/**
 * Initialize scheduled restock jobs
 * Call this during app startup
 */
export function initializeRestockJobs(prisma: PrismaClient): void {
  const restockService = new ShopRestockService(prisma);

  // Daily at dawn (6 AM server time) - DAWN interval
  // Using setInterval for simplicity; in production use node-cron or similar
  setInterval(async () => {
    try {
      console.log('[ShopRestock] Running DAWN restock...');
      const results = await restockService.runScheduledRestock('DAWN');
      console.log(`[ShopRestock] DAWN restock completed for ${results.length} shops`);
    } catch (error) {
      console.error('[ShopRestock] DAWN restock failed:', error);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours

  // Weekly (Sunday 6 AM) - WEEKLY interval
  setInterval(async () => {
    try {
      const now = new Date();
      if (now.getDay() === 0 && now.getHours() === 6) { // Sunday 6 AM
        console.log('[ShopRestock] Running WEEKLY restock...');
        const results = await restockService.runScheduledRestock('WEEKLY');
        console.log(`[ShopRestock] WEEKLY restock completed for ${results.length} shops`);
      }
    } catch (error) {
      console.error('[ShopRestock] WEEKLY restock failed:', error);
    }
  }, 60 * 60 * 1000); // Check every hour

  // Monthly (1st of month 6 AM) - MONTHLY interval
  setInterval(async () => {
    try {
      const now = new Date();
      if (now.getDate() === 1 && now.getHours() === 6) { // 1st of month 6 AM
        console.log('[ShopRestock] Running MONTHLY restock...');
        const results = await restockService.runScheduledRestock('MONTHLY');
        console.log(`[ShopRestock] MONTHLY restock completed for ${results.length} shops`);
      }
    } catch (error) {
      console.error('[ShopRestock] MONTHLY restock failed:', error);
    }
  }, 60 * 60 * 1000); // Check every hour
}
