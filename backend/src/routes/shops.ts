// ============================================
// Shop System Routes (Phase 7)
// ============================================

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { campaignMember, campaignDM } from '../middleware/compose';
import { prisma } from '../config/database';
import { ShopTransactionEngine } from '../services/shop/transactionEngine';
import { ShopRestockService } from '../services/shop/restock';
import {
  CreateShopSchema,
  UpdateShopSchema,
  CreateShopItemSchema,
  UpdateShopItemSchema,
  BuyItemsSchema,
  SellItemsSchema,
  RestockShopSchema,
} from '../validators/shops';
import { getSocketInstance } from '../websocket/utils';
import { jsonOrNull, toJson } from '../utils/prisma-json';
import { shopTransactionLimiter } from '../middleware/phaseFeatureLimiters';

const router = Router();
const transactionEngine = new ShopTransactionEngine(prisma);
const restockService = new ShopRestockService(prisma);

// ============================================
// Shop CRUD (DM only)
// ============================================

/**
 * GET /api/campaigns/:campaignId/shops
 * List all shops in campaign
 * DM sees all, players see only active shops
 */
router.get('/:campaignId/shops', ...campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { role } = req.campaignMembership!;
    const isDM = role === 'DM';

    const shops = await prisma.shop.findMany({
      where: {
        campaignId,
        ...(isDM ? {} : { isActive: true }),
      },
      include: {
        items: {
          where: isDM ? {} : { isVisible: true },
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
        },
        _count: { select: { items: true, visits: true, transactions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // For players, remove DM notes from items
    const responseShops = isDM ? shops : shops.map(shop => ({
      ...shop,
      items: shop.items.map(item => ({ ...item, notes: undefined })),
    }));

    return res.json({ shops: responseShops });
  } catch (error) {
    console.error('Error fetching shops:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch shops' });
  }
});

/**
 * GET /api/campaigns/:campaignId/shops/:shopId
 * Get single shop with items
 */
router.get('/:campaignId/shops/:shopId', ...campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, shopId } = req.params;
    const { role } = req.campaignMembership!;
    const isDM = role === 'DM';

    const shop = await prisma.shop.findFirst({
      where: { id: shopId, campaignId },
      include: {
        items: {
          where: isDM ? {} : { isVisible: true },
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { itemName: 'asc' }],
        },
        map: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });

    if (!shop) {
      return res.status(404).json({ error: 'Not Found', message: 'Shop not found' });
    }

    // For players, remove DM notes and filter inactive
    if (!isDM && !shop.isActive) {
      return res.status(404).json({ error: 'Not Found', message: 'Shop not found' });
    }

    const responseShop = isDM ? shop : {
      ...shop,
      items: shop.items.map(item => ({ ...item, notes: undefined })),
    };

    return res.json({ shop: responseShop });
  } catch (error) {
    console.error('Error fetching shop:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch shop' });
  }
});

/**
 * POST /api/campaigns/:campaignId/shops
 * Create a new shop (DM only)
 */
router.post('/:campaignId/shops', ...campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = req.session.userId!;

    const validation = CreateShopSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.issues[0].message,
      });
    }

    const data = validation.data;

    // Verify map exists if provided
    if (data.mapId) {
      const map = await prisma.map.findFirst({ where: { id: data.mapId, campaignId } });
      if (!map) {
        return res.status(400).json({ error: 'Validation Error', message: 'Map not found in this campaign' });
      }
    }

    // Create shop with items in transaction
    const shop = await prisma.$transaction(async (tx) => {
      const newShop = await tx.shop.create({
        data: {
          campaignId,
          name: data.name,
          description: data.description,
          type: data.type,
          mapId: data.mapId,
          tokenId: data.tokenId,
          buyModifier: data.buyModifier,
          sellModifier: data.sellModifier,
          currency: toJson(data.currency),
          restockRule: jsonOrNull(data.restockRule),
          isActive: data.isActive,
          createdById: userId,
        },
      });

      // Create shop items
      if (data.items.length > 0) {
        await tx.shopItem.createMany({
          data: data.items.map((item, index) => ({
            shopId: newShop.id,
            itemType: item.itemType,
            itemRef: item.itemRef,
            itemName: item.itemName,
            itemData: toJson(item.itemData),
            stock: item.stock,
            maxStock: item.maxStock,
            currentStock: item.currentStock,
            priceOverride: jsonOrNull(item.priceOverride),
            category: item.category,
            sortOrder: item.sortOrder ?? index,
            isVisible: item.isVisible,
            notes: item.notes,
          })),
        });
      }

      return newShop;
    });

    // Fetch created shop with items
    const createdShop = await prisma.shop.findUnique({
      where: { id: shop.id },
      include: {
        items: { orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] },
        map: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });

    return res.status(201).json({ shop: createdShop });
  } catch (error) {
    console.error('Error creating shop:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create shop' });
  }
});

/**
 * PUT /api/campaigns/:campaignId/shops/:shopId
 * Update shop (DM only)
 */
router.put('/:campaignId/shops/:shopId', ...campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, shopId } = req.params;

    const validation = UpdateShopSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.issues[0].message,
      });
    }

    const data = validation.data;

    // Verify shop exists in campaign
    const existingShop = await prisma.shop.findFirst({ where: { id: shopId, campaignId } });
    if (!existingShop) {
      return res.status(404).json({ error: 'Not Found', message: 'Shop not found' });
    }

    // Verify map exists if provided
    if (data.mapId) {
      const map = await prisma.map.findFirst({ where: { id: data.mapId, campaignId } });
      if (!map) {
        return res.status(400).json({ error: 'Validation Error', message: 'Map not found in this campaign' });
      }
    }

    const updatedShop = await prisma.shop.update({
      where: { id: shopId },
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        mapId: data.mapId,
        tokenId: data.tokenId,
        buyModifier: data.buyModifier,
        sellModifier: data.sellModifier,
        currency: data.currency ? toJson(data.currency) : undefined,
        restockRule: jsonOrNull(data.restockRule),
        isActive: data.isActive,
      },
      include: {
        items: { orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] },
        map: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });

    return res.json({ shop: updatedShop });
    return;
  } catch (error) {
    console.error('Error updating shop:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update shop' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/shops/:shopId
 * Delete shop (DM only)
 */
router.delete('/:campaignId/shops/:shopId', ...campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, shopId } = req.params;

    const existingShop = await prisma.shop.findFirst({ where: { id: shopId, campaignId } });
    if (!existingShop) {
      return res.status(404).json({ error: 'Not Found', message: 'Shop not found' });
    }

    await prisma.shop.delete({ where: { id: shopId } });

    return res.json({ success: true, message: 'Shop deleted' });
  } catch (error) {
    console.error('Error deleting shop:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete shop' });
  }
});

// ============================================
// Shop Items (DM only)
// ============================================

/**
 * POST /api/campaigns/:campaignId/shops/:shopId/items
 * Add item to shop (DM only)
 */
router.post('/:campaignId/shops/:shopId/items', ...campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, shopId } = req.params;

    const validation = CreateShopItemSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.issues[0].message,
      });
    }

    const data = validation.data;

    // Verify shop exists in campaign
    const shop = await prisma.shop.findFirst({ where: { id: shopId, campaignId } });
    if (!shop) {
      return res.status(404).json({ error: 'Not Found', message: 'Shop not found' });
    }

    // Get max sortOrder for default
    const maxSort = await prisma.shopItem.aggregate({
      where: { shopId },
      _max: { sortOrder: true },
    });

    const item = await prisma.shopItem.create({
      data: {
        shopId,
        itemType: data.itemType,
        itemRef: data.itemRef,
        itemName: data.itemName,
        itemData: toJson(data.itemData),
        stock: data.stock,
        maxStock: data.maxStock,
        currentStock: data.currentStock,
        priceOverride: jsonOrNull(data.priceOverride),
        category: data.category,
        sortOrder: data.sortOrder ?? (maxSort._max.sortOrder || 0) + 1,
        isVisible: data.isVisible,
        notes: data.notes,
      },
    });

    return res.status(201).json({ item });
    return;
  } catch (error) {
    console.error('Error creating shop item:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create shop item' });
  }
});

/**
 * PUT /api/campaigns/:campaignId/shops/:shopId/items/:itemId
 * Update shop item (DM only)
 */
router.put('/:campaignId/shops/:shopId/items/:itemId', ...campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, shopId, itemId } = req.params;

    const validation = UpdateShopItemSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.issues[0].message,
      });
    }

    const data = validation.data;

    // Verify item exists in shop
    const item = await prisma.shopItem.findFirst({
      where: { id: itemId, shopId, shop: { campaignId } },
    });

    if (!item) {
      return res.status(404).json({ error: 'Not Found', message: 'Shop item not found' });
    }

    const updatedItem = await prisma.shopItem.update({
      where: { id: itemId },
      data: {
        itemType: data.itemType,
        itemRef: data.itemRef,
        itemName: data.itemName,
        itemData: data.itemData ? toJson(data.itemData) : undefined,
        stock: data.stock,
        maxStock: data.maxStock,
        currentStock: data.currentStock,
        priceOverride: jsonOrNull(data.priceOverride),
        category: data.category,
        sortOrder: data.sortOrder,
        isVisible: data.isVisible,
        notes: data.notes,
      },
    });

    return res.json({ item: updatedItem });
    return;
  } catch (error) {
    console.error('Error updating shop item:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update shop item' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/shops/:shopId/items/:itemId
 * Delete shop item (DM only)
 */
router.delete('/:campaignId/shops/:shopId/items/:itemId', ...campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, shopId, itemId } = req.params;

    const item = await prisma.shopItem.findFirst({
      where: { id: itemId, shopId, shop: { campaignId } },
    });

    if (!item) {
      return res.status(404).json({ error: 'Not Found', message: 'Shop item not found' });
    }

    await prisma.shopItem.delete({ where: { id: itemId } });

    return res.json({ success: true, message: 'Shop item deleted' });
  } catch (error) {
    console.error('Error deleting shop item:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete shop item' });
  }
});

/**
 * POST /api/campaigns/:campaignId/shops/:shopId/items/reorder
 * Reorder shop items (DM only)
 */
router.post('/:campaignId/shops/:shopId/items/reorder', ...campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, shopId } = req.params;
    const { itemOrders } = req.body as { itemOrders: Array<{ id: string; sortOrder: number; category?: string }> };

    const shop = await prisma.shop.findFirst({ where: { id: shopId, campaignId } });
    if (!shop) {
      return res.status(404).json({ error: 'Not Found', message: 'Shop not found' });
    }

    await prisma.$transaction(
      itemOrders.map(({ id, sortOrder, category }) =>
        prisma.shopItem.update({
          where: { id, shopId },
          data: { sortOrder, category },
        })
      )
    );

    return res.json({ success: true });
    return;
  } catch (error) {
    console.error('Error reordering shop items:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to reorder items' });
  }
});

// ============================================
// Player Shop Interactions
// ============================================

/**
 * POST /api/campaigns/:campaignId/shops/:shopId/buy
 * Buy items from shop
 */
router.post('/:campaignId/shops/:shopId/buy', ...campaignMember, shopTransactionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, shopId } = req.params;
    const userId = req.session.userId!;
    const { characterIds } = req.campaignMembership!;

    const validation = BuyItemsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.issues[0].message,
      });
    }

    const { items, currencyContainerId } = validation.data;

    // Get the first character (or require character selection)
    const characterId = characterIds[0];
    if (!characterId) {
      return res.status(400).json({ error: 'Bad Request', message: 'No character assigned to this campaign' });
    }

    const result = await transactionEngine.buyItems(shopId, userId, characterId, items, currencyContainerId);

    if (!result.success) {
      return res.status(400).json({ error: 'Transaction Failed', message: result.error });
    }

    // Broadcast shop update to campaign
    const io = getSocketInstance();
    if (io) {
      const updatedShop = await prisma.shop.findUnique({
        where: { id: shopId },
        include: { items: true },
      });
      io.to(campaignId).emit('shop:updated', { shop: updatedShop });
      io.to(campaignId).emit('shop:transaction', { shopId, transaction: result });
    }

    return res.json({ success: true, transaction: result });
    return;
  } catch (error) {
    console.error('Error buying items:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to process purchase' });
  }
});

/**
 * POST /api/campaigns/:campaignId/shops/:shopId/sell
 * Sell items to shop
 */
router.post('/:campaignId/shops/:shopId/sell', ...campaignMember, shopTransactionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, shopId } = req.params;
    const userId = req.session.userId!;
    const { characterIds } = req.campaignMembership!;

    const validation = SellItemsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.issues[0].message,
      });
    }

    const { items, currencyContainerId } = validation.data;

    const characterId = characterIds[0];
    if (!characterId) {
      return res.status(400).json({ error: 'Bad Request', message: 'No character assigned to this campaign' });
    }

    const result = await transactionEngine.sellItems(shopId, userId, characterId, items, currencyContainerId);

    if (!result.success) {
      return res.status(400).json({ error: 'Transaction Failed', message: result.error });
    }

    // Broadcast shop update to campaign
    const io = getSocketInstance();
    if (io) {
      const updatedShop = await prisma.shop.findUnique({
        where: { id: shopId },
        include: { items: true },
      });
      io.to(campaignId).emit('shop:updated', { shop: updatedShop });
      io.to(campaignId).emit('shop:transaction', { shopId, transaction: result });
    }

    return res.json({ success: true, transaction: result });
    return;
  } catch (error) {
    console.error('Error selling items:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to process sale' });
  }
});

// ============================================
// Shop Visit History
// ============================================

/**
 * GET /api/campaigns/:campaignId/shops/:shopId/visits
 * Get visit history (DM sees all, player sees own)
 */
router.get('/:campaignId/shops/:shopId/visits', ...campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId: _campaignId, shopId } = req.params;
    const userId = req.session.userId!;
    const { role } = req.campaignMembership!;
    const isDM = role === 'DM';

    const visits = await prisma.shopVisit.findMany({
      where: {
        shopId,
        ...(isDM ? {} : { userId }),
      },
      include: {
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { visitedAt: 'desc' },
    });

    return res.json({ visits });
    return;
  } catch (error) {
    console.error('Error fetching shop visits:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch visit history' });
  }
});

/**
 * GET /api/campaigns/:campaignId/shops/:shopId/transactions
 * Get transaction history (DM sees all, player sees own)
 */
router.get('/:campaignId/shops/:shopId/transactions', ...campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId: _campaignId, shopId } = req.params;
    const userId = req.session.userId!;
    const { role } = req.campaignMembership!;
    const isDM = role === 'DM';

    const transactions = await prisma.shopTransaction.findMany({
      where: {
        shopId,
        ...(isDM ? {} : { userId }),
      },
      include: {
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ transactions });
    return;
  } catch (error) {
    console.error('Error fetching shop transactions:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch transactions' });
  }
});

// ============================================
// Restock
// ============================================

/**
 * POST /api/campaigns/:campaignId/shops/:shopId/restock
 * Manual restock trigger (DM only)
 */
router.post('/:campaignId/shops/:shopId/restock', ...campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId: _campaignId, shopId } = req.params;

    const validation = RestockShopSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.issues[0].message,
      });
    }

    const { itemIds } = validation.data;

    const shop = await prisma.shop.findFirst({ where: { id: shopId, campaignId: _campaignId } });
    if (!shop) {
      return res.status(404).json({ error: 'Not Found', message: 'Shop not found' });
    }

    const result = await restockService.manualRestock(shopId, itemIds);

    if (!result.success) {
      return res.status(400).json({ error: 'Restock Failed', message: result.error });
    }

    // Broadcast update
    const io = getSocketInstance();
    if (io) {
      const updatedShop = await prisma.shop.findUnique({
        where: { id: shopId },
        include: { items: true },
      });
      io.to(_campaignId).emit('shop:updated', { shop: updatedShop });
    }

    return res.json({ success: true, results: result.results });
    return;
    return;
  } catch (error) {
    console.error('Error restocking shop:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to restock shop' });
  }
});

export default router;
