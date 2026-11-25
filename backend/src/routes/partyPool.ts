/**
 * Party Resource Pool Routes
 * API endpoints for campaign-level shared resources
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { GameSystem } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { campaignMember, campaignDM } from '../middleware/compose';
import { AuthenticatedRequest } from '../middleware/rbac';
import { prisma } from '../config/database';
import {
  getCampaignPools,
  getPool,
  getPoolTransactions,
  createPool,
  updatePool,
  deletePool,
  contributeToPool,
  withdrawFromPool,
  adjustPool,
  spendFromPool,
  depositLootToPool,
  formatPoolCurrency,
  PoolCurrencyAmount,
} from '../services/inventory/partyPool';
import { broadcastToCampaign } from '../websocket/utils';

// Helper function to handle Zod errors
function handleZodError(error: unknown, res: Response): boolean {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', details: error.issues });
    return true;
  }
  return false;
}

const router = Router();

// UUID validation schema
const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

// All routes require authentication
router.use(requireAuth);

// Validation schemas
const createPoolSchema = z.object({
  name: z.string().min(1, 'Pool name is required').max(100, 'Name must be 100 characters or fewer'),
  description: z.string().max(1000).optional(),
  // D&D currencies
  cp: z.number().int().min(0).default(0),
  sp: z.number().int().min(0).default(0),
  ep: z.number().int().min(0).default(0),
  gp: z.number().int().min(0).default(0),
  pp: z.number().int().min(0).default(0),
  // Shadowrun
  nuyen: z.number().int().min(0).default(0),
  // Call of Cthulhu
  cash: z.number().min(0).default(0),
  // Custom currency
  custom: z.record(z.string(), z.number()).optional(),
  // Settings
  isDefault: z.boolean().default(false),
  allowPlayerWithdraw: z.boolean().default(true),
});

const updatePoolSchema = createPoolSchema.partial();

const poolCurrencySchema = z.object({
  cp: z.number().int().min(0).default(0),
  sp: z.number().int().min(0).default(0),
  ep: z.number().int().min(0).default(0),
  gp: z.number().int().min(0).default(0),
  pp: z.number().int().min(0).default(0),
  nuyen: z.number().int().min(0).default(0),
  cash: z.number().min(0).default(0),
  custom: z.record(z.string(), z.number()).optional(),
});

const contributeSchema = z.object({
  characterId: uuidSchema,
  amounts: poolCurrencySchema,
  description: z.string().min(1, 'Description is required').max(500),
});

const withdrawSchema = z.object({
  characterId: uuidSchema,
  amounts: poolCurrencySchema,
  description: z.string().min(1, 'Description is required').max(500),
});

const adjustSchema = z.object({
  amounts: poolCurrencySchema,
  description: z.string().min(1, 'Description is required').max(500),
  sourceType: z.enum(['MANUAL', 'QUEST_REWARD', 'SHOP']).optional(),
  sourceId: z.string().optional(),
});

const spendSchema = z.object({
  amounts: poolCurrencySchema,
  description: z.string().min(1, 'Description is required').max(500),
  sourceType: z.enum(['SHOP', 'SERVICE', 'MANUAL', 'QUEST_REWARD']),
  sourceId: z.string().optional(),
});

const lootDepositSchema = z.object({
  distributionId: uuidSchema,
  poolId: uuidSchema,
});

const transactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================
// POOL CRUD
// ============================================

/**
 * GET /api/campaigns/:campaignId/pool
 * List all resource pools for a campaign
 * Requires: Campaign membership (any role)
 */
router.get('/:campaignId/pool', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const pools = await getCampaignPools(campaignId);
    
    // Add formatted currency for each pool
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { gameSystem: true },
    });
    const gameSystem = campaign?.gameSystem || GameSystem.DND_5E;

    const poolsWithFormat = pools.map(pool => ({
      ...pool,
      formatted: formatPoolCurrency({
        cp: pool.cp, sp: pool.sp, ep: pool.ep, gp: pool.gp, pp: pool.pp,
        nuyen: pool.nuyen, cash: pool.cash, custom: pool.custom as PoolCurrencyAmount['custom'],
      }, gameSystem),
    }));

    return res.json({ pools: poolsWithFormat });
  } catch (error) {
    console.error('Get campaign pools error:', error);
    return res.status(500).json({ error: 'Failed to get pools' });
  }
});

/**
 * POST /api/campaigns/:campaignId/pool
 * Create a new resource pool
 * Requires: Campaign DM role
 */
router.post('/:campaignId/pool', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const validated = createPoolSchema.parse(req.body);
    
    // Check if default pool already exists
    if (validated.isDefault) {
      const existingDefault = await prisma.partyResourcePool.findFirst({
        where: { campaignId, isDefault: true },
      });
      if (existingDefault) {
        return res.status(400).json({ 
          error: 'Validation Error', 
          message: 'A default pool already exists for this campaign' 
        });
      }
    }

    const pool = await createPool({
      ...validated,
      campaignId,
      createdById: req.session.userId!,
    });

    // Broadcast update
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { gameSystem: true },
    });
    const gameSystem = campaign?.gameSystem || GameSystem.DND_5E;

    const formatted = formatPoolCurrency({
      cp: pool.cp, sp: pool.sp, ep: pool.ep, gp: pool.gp, pp: pool.pp,
      nuyen: pool.nuyen, cash: pool.cash, custom: pool.custom as PoolCurrencyAmount['custom'],
    }, gameSystem);

    broadcastToCampaign(campaignId, 'pool.created', { pool: { ...pool, formatted } });

    return res.status(201).json({ pool: { ...pool, formatted } });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Create pool error:', error);
    return res.status(500).json({ error: 'Failed to create pool' });
  }
});

/**
 * GET /api/campaigns/:campaignId/pool/:poolId
 * Get pool details with recent transactions
 * Requires: Campaign membership (any role)
 */
router.get('/:campaignId/pool/:poolId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { poolId } = req.params;
    const pool = await getPool(poolId);
    
    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Verify pool belongs to this campaign
    if (pool.campaignId !== req.params.campaignId) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.campaignId },
      select: { gameSystem: true },
    });
    const gameSystem = campaign?.gameSystem || GameSystem.DND_5E;

    const formatted = formatPoolCurrency({
      cp: pool.cp, sp: pool.sp, ep: pool.ep, gp: pool.gp, pp: pool.pp,
      nuyen: pool.nuyen, cash: pool.cash, custom: pool.custom as PoolCurrencyAmount['custom'],
    }, gameSystem);

    return res.json({ pool: { ...pool, formatted } });
  } catch (error) {
    console.error('Get pool error:', error);
    return res.status(500).json({ error: 'Failed to get pool' });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/pool/:poolId
 * Update pool settings (name, description, allowPlayerWithdraw, isDefault)
 * Requires: Campaign DM role
 */
router.patch('/:campaignId/pool/:poolId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { poolId } = req.params;
    const validated = updatePoolSchema.parse(req.body);
    
    // If setting as default, check for existing default
    if (validated.isDefault === true) {
      const existingDefault = await prisma.partyResourcePool.findFirst({
        where: { campaignId: req.params.campaignId, isDefault: true, NOT: { id: poolId } },
      });
      if (existingDefault) {
        return res.status(400).json({ 
          error: 'Validation Error', 
          message: 'Another pool is already the default. Unset it first.' 
        });
      }
    }

    const pool = await updatePool(poolId, validated);

    // Broadcast update
    broadcastToCampaign(req.params.campaignId, 'pool.updated', { pool });

    return res.json({ pool });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Update pool error:', error);
    return res.status(500).json({ error: 'Failed to update pool' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/pool/:poolId
 * Delete a pool (must be empty or force=true)
 * Requires: Campaign DM role
 */
router.delete('/:campaignId/pool/:poolId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { poolId } = req.params;
    const force = req.query.force === 'true';
    
    await deletePool(poolId, force);

    // Broadcast deletion
    broadcastToCampaign(req.params.campaignId, 'pool.deleted', { poolId });

    return res.json({ message: 'Pool deleted successfully' });
  } catch (error) {
    console.error('Delete pool error:', error);
    if (error instanceof Error && error.message.includes('has currency')) {
      return res.status(400).json({ error: 'Validation Error', message: error.message });
    }
    return res.status(500).json({ error: 'Failed to delete pool' });
  }
});

// ============================================
// POOL TRANSACTIONS
// ============================================

/**
 * GET /api/campaigns/:campaignId/pool/:poolId/transactions
 * Get paginated transaction history
 * Requires: Campaign membership (any role)
 */
router.get('/:campaignId/pool/:poolId/transactions', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { poolId } = req.params;
    const query = transactionQuerySchema.parse(req.query);
    
    const pool = await getPool(poolId);
    if (!pool || pool.campaignId !== req.params.campaignId) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const result = await getPoolTransactions(poolId, query);
    
    return res.json({
      transactions: result.transactions,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Get pool transactions error:', error);
    return res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// ============================================
// CONTRIBUTE / WITHDRAW / ADJUST / SPEND
// ============================================

/**
 * POST /api/campaigns/:campaignId/pool/:poolId/contribute
 * Character contributes currency to pool
 * Requires: Campaign membership (character owner or DM)
 */
router.post('/:campaignId/pool/:poolId/contribute', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, poolId } = req.params;
    const validated = contributeSchema.parse(req.body);
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Verify character belongs to this campaign and user owns it (or is DM)
    const character = await prisma.character.findUnique({
      where: { id: validated.characterId },
      select: { campaignId: true, userId: true },
    });

    if (!character || character.campaignId !== campaignId) {
      return res.status(404).json({ error: 'Character not found in this campaign' });
    }

    // Only character owner or DM can contribute
    if (character.userId !== userId && userRole !== 'DM') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only contribute your own character\'s currency' });
    }

    const pool = await contributeToPool(
      poolId,
      validated.characterId,
      validated.amounts,
      userId,
      validated.description
    );

    // Broadcast update
    broadcastToCampaign(campaignId, 'pool.updated', { pool });

    return res.json({ pool });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Contribute to pool error:', error);
    if (error instanceof Error && error.message.includes('Insufficient funds')) {
      return res.status(400).json({ error: 'Validation Error', message: error.message });
    }
    return res.status(500).json({ error: 'Failed to contribute to pool' });
  }
});

/**
 * POST /api/campaigns/:campaignId/pool/:poolId/withdraw
 * Character withdraws currency from pool
 * Requires: Campaign membership (character owner or DM), pool allows player withdraw
 */
router.post('/:campaignId/pool/:poolId/withdraw', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, poolId } = req.params;
    const validated = withdrawSchema.parse(req.body);
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Verify pool allows player withdrawals
    const pool = await prisma.partyResourcePool.findUnique({
      where: { id: poolId },
      select: { allowPlayerWithdraw: true, campaignId: true },
    });

    if (!pool || pool.campaignId !== campaignId) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    if (!pool.allowPlayerWithdraw && userRole !== 'DM') {
      return res.status(403).json({ error: 'Forbidden', message: 'Player withdrawals are not allowed for this pool' });
    }

    // Verify character belongs to this campaign and user owns it (or is DM)
    const character = await prisma.character.findUnique({
      where: { id: validated.characterId },
      select: { campaignId: true, userId: true },
    });

    if (!character || character.campaignId !== campaignId) {
      return res.status(404).json({ error: 'Character not found in this campaign' });
    }

    // Only character owner or DM can withdraw
    if (character.userId !== userId && userRole !== 'DM') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only withdraw to your own character' });
    }

    const updatedPool = await withdrawFromPool(
      poolId,
      validated.characterId,
      validated.amounts,
      userId,
      validated.description
    );

    // Broadcast update
    broadcastToCampaign(campaignId, 'pool.updated', { pool: updatedPool });

    return res.json({ pool: updatedPool });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Withdraw from pool error:', error);
    if (error instanceof Error && (error.message.includes('Insufficient funds') || error.message.includes('not allowed'))) {
      return res.status(400).json({ error: 'Validation Error', message: error.message });
    }
    return res.status(500).json({ error: 'Failed to withdraw from pool' });
  }
});

/**
 * POST /api/campaigns/:campaignId/pool/:poolId/adjust
 * DM adjusts pool directly
 * Requires: Campaign DM role
 */
router.post('/:campaignId/pool/:poolId/adjust', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, poolId } = req.params;
    const validated = adjustSchema.parse(req.body);
    const userId = req.session.userId!;

    const pool = await adjustPool(
      poolId,
      validated.amounts,
      userId,
      validated.description,
      validated.sourceType,
      validated.sourceId
    );

    // Broadcast update
    broadcastToCampaign(campaignId, 'pool.updated', { pool });

    return res.json({ pool });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Adjust pool error:', error);
    if (error instanceof Error && error.message.includes('negative')) {
      return res.status(400).json({ error: 'Validation Error', message: error.message });
    }
    return res.status(500).json({ error: 'Failed to adjust pool' });
  }
});

/**
 * POST /api/campaigns/:campaignId/pool/:poolId/spend
 * DM spends from pool (shop, services, etc.)
 * Requires: Campaign DM role
 */
router.post('/:campaignId/pool/:poolId/spend', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, poolId } = req.params;
    const validated = spendSchema.parse(req.body);
    const userId = req.session.userId!;

    const pool = await spendFromPool(
      poolId,
      validated.amounts,
      userId,
      validated.description,
      validated.sourceType,
      validated.sourceId
    );

    // Broadcast update
    broadcastToCampaign(campaignId, 'pool.updated', { pool });

    return res.json({ pool });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Spend from pool error:', error);
    if (error instanceof Error && error.message.includes('Insufficient funds')) {
      return res.status(400).json({ error: 'Validation Error', message: error.message });
    }
    return res.status(500).json({ error: 'Failed to spend from pool' });
  }
});

/**
 * POST /api/campaigns/:campaignId/pool/loot-deposit
 * Deposit completed loot distribution into pool
 * Requires: Campaign DM role
 */
router.post('/:campaignId/pool/loot-deposit', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const validated = lootDepositSchema.parse(req.body);
    const userId = req.session.userId!;

    // Verify distribution belongs to this campaign
    const distribution = await prisma.lootDistribution.findUnique({
      where: { id: validated.distributionId },
      select: { campaignId: true, status: true },
    });

    if (!distribution || distribution.campaignId !== campaignId) {
      return res.status(404).json({ error: 'Loot distribution not found' });
    }

    if (distribution.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Validation Error', message: 'Distribution must be completed first' });
    }

    const pool = await depositLootToPool(validated.distributionId, validated.poolId, userId);

    // Broadcast update
    broadcastToCampaign(campaignId, 'pool.updated', { pool });

    return res.json({ pool });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Loot deposit error:', error);
    return res.status(500).json({ error: 'Failed to deposit loot to pool' });
  }
});

export default router;