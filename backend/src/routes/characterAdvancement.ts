/**
 * Character Advancement Routes
 * API endpoints for XP tracking, milestone levels, and level-up workflows.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { campaignMember, campaignDM } from '../middleware/compose';
import { AuthenticatedRequest } from '../middleware/rbac';
import { prisma } from '../config/database';
import {
  getAdvancement,
  awardXp,
  awardMilestone,
  getLevelUpPreview,
  confirmLevelUp,
  rollHitPoints,
  getAdvancementLog,
} from '../services/characterAdvancement';
import { broadcastToCampaign } from '../websocket/utils';

const router = Router();

// UUID validation schema
const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

// All routes require authentication
router.use(requireAuth);

// Validation schemas
const awardXpSchema = z.object({
  characterId: uuidSchema,
  amount: z.number().int().min(1).max(1000000),
  reason: z.string().max(500),
});

const bulkAwardXpSchema = z.object({
  awards: z.array(z.object({
    characterId: uuidSchema,
    amount: z.number().int().min(1).max(1000000),
  })).min(1).max(20),
  reason: z.string().max(500),
});

const awardMilestoneSchema = z.object({
  characterId: uuidSchema,
  newLevel: z.number().int().min(1).max(20),
  reason: z.string().max(500),
});

const confirmLevelUpSchema = z.object({
  choices: z.object({
    hpRoll: z.number().int().min(1).optional(),
    classFeatures: z.array(z.string()).optional(),
    feats: z.array(z.string()).optional(),
    asi: z.object({
      ability1: z.string().optional(),
      ability2: z.string().optional(),
      feat: z.string().optional(),
    }).optional(),
    spells: z.array(z.string()).optional(),
  }),
});

const hpRollSchema = z.object({
  className: z.string().min(1),
});

function handleZodError(error: unknown, res: Response): boolean {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', details: error.issues });
    return true;
  }
  return false;
}

// ============================================
// ADVANCEMENT DATA
// ============================================

/**
 * GET /api/campaigns/:campaignId/characters/:characterId/advancement
 * Get character advancement data
 * Requires: Campaign membership (owner or DM)
 */
router.get('/:campaignId/characters/:characterId/advancement', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { characterId } = req.params;
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Verify character belongs to this campaign and user owns it (or is DM)
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { campaignId: true, userId: true },
    });

    if (!character || character.campaignId !== req.params.campaignId) {
      return res.status(404).json({ error: 'Character not found in this campaign' });
    }

    if (character.userId !== userId && userRole !== 'DM') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only view your own character\'s advancement' });
    }

    const advancement = await getAdvancement(characterId);
    if (!advancement) {
      // Create default advancement record if it doesn't exist
      await prisma.characterAdvancement.create({
        data: { characterId },
      });
      const newAdvancement = await getAdvancement(characterId);
      return res.json({ advancement: newAdvancement });
    }

    return res.json({ advancement });
  } catch (error) {
    console.error('Get advancement error:', error);
    return res.status(500).json({ error: 'Failed to get advancement data' });
  }
});

/**
 * POST /api/campaigns/:campaignId/characters/:characterId/advancement/xp
 * Award XP to a character
 * Requires: Campaign DM role
 */
router.post('/:campaignId/characters/:characterId/advancement/xp', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const validated = awardXpSchema.parse(req.body);
    const userId = req.session.userId!;

    // Verify character belongs to this campaign
    const character = await prisma.character.findUnique({
      where: { id: validated.characterId },
      select: { campaignId: true },
    });

    if (!character || character.campaignId !== campaignId) {
      return res.status(404).json({ error: 'Character not found in this campaign' });
    }

    const advancement = await awardXp(validated.characterId, validated.amount, validated.reason, userId);

    // Broadcast update
    broadcastToCampaign(campaignId, 'character.advancement', { advancement });

    return res.json({ advancement });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Award XP error:', error);
    return res.status(500).json({ error: 'Failed to award XP' });
  }
});

/**
 * POST /api/campaigns/:campaignId/characters/advancement/xp/bulk
 * Award XP to multiple characters at once
 * Requires: Campaign DM role
 */
router.post('/:campaignId/characters/advancement/xp/bulk', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const validated = bulkAwardXpSchema.parse(req.body);
    const userId = req.session.userId!;

    // Verify all characters belong to this campaign
    const characters = await prisma.character.findMany({
      where: { id: { in: validated.awards.map(a => a.characterId) } },
      select: { id: true, campaignId: true },
    });

    if (characters.some(c => c.campaignId !== campaignId)) {
      return res.status(404).json({ error: 'One or more characters not found in this campaign' });
    }

    const results = await Promise.all(
      validated.awards.map(a => awardXp(a.characterId, a.amount, validated.reason, userId))
    );

    // Broadcast updates
    for (const advancement of results) {
      broadcastToCampaign(campaignId, 'character.advancement', { advancement });
    }

    return res.json({ advancements: results });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Bulk award XP error:', error);
    return res.status(500).json({ error: 'Failed to award XP' });
  }
});

/**
 * POST /api/campaigns/:campaignId/characters/:characterId/advancement/milestone
 * Award milestone level (bypass XP)
 * Requires: Campaign DM role
 */
router.post('/:campaignId/characters/:characterId/advancement/milestone', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const validated = awardMilestoneSchema.parse(req.body);
    const userId = req.session.userId!;

    // Verify character belongs to this campaign
    const character = await prisma.character.findUnique({
      where: { id: validated.characterId },
      select: { campaignId: true },
    });

    if (!character || character.campaignId !== campaignId) {
      return res.status(404).json({ error: 'Character not found in this campaign' });
    }

    const advancement = await awardMilestone(validated.characterId, validated.newLevel, validated.reason, userId);

    // Broadcast update
    broadcastToCampaign(campaignId, 'character.advancement', { advancement });

    return res.json({ advancement });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Award milestone error:', error);
    return res.status(500).json({ error: 'Failed to award milestone level' });
  }
});

/**
 * GET /api/campaigns/:campaignId/characters/:characterId/advancement/level-up/preview
 * Get level-up preview with all choices
 * Requires: Campaign membership (owner or DM)
 */
router.get('/:campaignId/characters/:characterId/advancement/level-up/preview', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { characterId } = req.params;
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Verify character belongs to this campaign and user owns it (or is DM)
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { campaignId: true, userId: true },
    });

    if (!character || character.campaignId !== req.params.campaignId) {
      return res.status(404).json({ error: 'Character not found in this campaign' });
    }

    if (character.userId !== userId && userRole !== 'DM') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only view your own character\'s level-up preview' });
    }

    const preview = await getLevelUpPreview(characterId);
    if (!preview) {
      return res.status(404).json({ error: 'No pending level up for this character' });
    }

    return res.json({ preview });
  } catch (error) {
    console.error('Get level-up preview error:', error);
    return res.status(500).json({ error: 'Failed to get level-up preview' });
  }
});

/**
 * POST /api/campaigns/:campaignId/characters/:characterId/advancement/level-up/confirm
 * Confirm level-up choices
 * Requires: Campaign membership (owner or DM)
 */
router.post('/:campaignId/characters/:characterId/advancement/level-up/confirm', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, characterId } = req.params;
    const validated = confirmLevelUpSchema.parse(req.body);
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Verify character belongs to this campaign and user owns it (or is DM)
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { campaignId: true, userId: true },
    });

    if (!character || character.campaignId !== campaignId) {
      return res.status(404).json({ error: 'Character not found in this campaign' });
    }

    if (character.userId !== userId && userRole !== 'DM') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only confirm level up for your own character' });
    }

    const advancement = await confirmLevelUp(characterId, validated.choices, userId);

    // Broadcast update
    broadcastToCampaign(campaignId, 'character.advancement', { advancement });

    return res.json({ advancement });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Confirm level up error:', error);
    return res.status(500).json({ error: 'Failed to confirm level up' });
  }
});

/**
 * POST /api/campaigns/:campaignId/characters/:characterId/advancement/hp-roll
 * Roll hit points for level up
 * Requires: Campaign membership (owner or DM)
 */
router.post('/:campaignId/characters/:characterId/advancement/hp-roll', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { characterId } = req.params;
    const validated = hpRollSchema.parse(req.body);
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Verify character belongs to this campaign and user owns it (or is DM)
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { campaignId: true, userId: true },
    });

    if (!character || character.campaignId !== req.params.campaignId) {
      return res.status(404).json({ error: 'Character not found in this campaign' });
    }

    if (character.userId !== userId && userRole !== 'DM') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only roll HP for your own character' });
    }

    const result = await rollHitPoints(characterId, validated.className);

    return res.json({ result });
  } catch (error) {
    if (handleZodError(error, res)) return;
    console.error('Roll HP error:', error);
    return res.status(500).json({ error: 'Failed to roll hit points' });
  }
});

/**
 * GET /api/campaigns/:campaignId/characters/:characterId/advancement/log
 * Get advancement log
 * Requires: Campaign membership (owner or DM)
 */
router.get('/:campaignId/characters/:characterId/advancement/log', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { characterId } = req.params;
    const userId = req.session.userId!;
    const userRole = req.campaignMembership!.role;

    // Verify character belongs to this campaign and user owns it (or is DM)
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { campaignId: true, userId: true },
    });

    if (!character || character.campaignId !== req.params.campaignId) {
      return res.status(404).json({ error: 'Character not found in this campaign' });
    }

    if (character.userId !== userId && userRole !== 'DM') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only view your own character\'s advancement log' });
    }

    const log = await getAdvancementLog(characterId);

    return res.json({ log });
  } catch (error) {
    console.error('Get advancement log error:', error);
    return res.status(500).json({ error: 'Failed to get advancement log' });
  }
});

export default router;