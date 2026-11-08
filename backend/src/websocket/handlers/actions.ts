// ============================================
// Action Resolution handlers
// ============================================

import { Server } from 'socket.io';
import { ActionType, Prisma } from '@prisma/client';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { withinCeiling } from '../shared';
import { ackFrom, refuseRequest } from '../ack';
import { 
  getCharacterActions, 
  setActionUsed,
  resetUsedActions 
} from '../../services/actionRegistry';
import { generateActionPreview, type ActionData, type ActionCondition } from '../../services/actionPreview';
import { applyActionResolution } from '../../services/actionApply';
import logger from '../../utils/logger';

interface ActionPreviewData {
  actionId?: string;
  actionType: ActionType;
  actionData: ActionData;
  initiatorId: string;
  targetIds?: string[];
}

interface ActionRollData {
  resolutionId: string;
  attackRolls?: ActionRoll[];
  saveRolls?: SaveRoll[];
}

interface DiceBreakdown {
  rolls?: Array<{ sides?: number; results?: number[] }>;
}

interface ActionRoll {
  targetId?: string;
  expression: string;
  result: number;
  breakdown: DiceBreakdown;
  vsAC?: number;
}

interface SaveRoll extends ActionRoll {
  targetId: string;
  vsDC: number;
  success: boolean;
}

interface ActionReviewData {
  resolutionId: string;
  action: 'apply' | 'modify' | 'cancel';
  modifications?: {
    damage?: Record<string, number>;
    conditions?: ActionCondition[];
    hp?: Record<string, number>;
  };
  dmNotes?: string;
}

interface ReactionPromptData {
  reactionId: string;
  triggerType: 'opportunity_attack' | 'shield' | 'counterspell' | 'uncanny_dodge' | 'custom';
  triggerData: Record<string, unknown>;
  responderId: string;
  initiatorId: string;
  targetId: string;
}

export function registerActionHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * ACTION.GET_REGISTRY - Get character's available actions
   */
  socket.on('action:getRegistry', async (data: { characterId: string; forceRefresh?: boolean }, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      
      if (!withinCeiling(socket, 'action:getRegistry', ack)) return;

      const { characterId, forceRefresh } = data;
      
      // Verify character belongs to campaign or user
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { id: true, userId: true, campaignId: true },
      });

      if (!character) {
        refuse('Character not found');
        return;
      }

      // Check permissions - owner, DM, or character in same campaign
      const isOwner = character.userId === socket.userId;
      const isDM = socket.role === 'DM';
      const inCampaign = character.campaignId === socket.campaignId;
      
      if (!isOwner && !isDM && !inCampaign) {
        refuse('Not authorized to view this character\'s actions');
        return;
      }

      const actions = await getCharacterActions(characterId, forceRefresh);
      ack?.({ ok: true, actions });
      
      logger.debug('action:getRegistry', { characterId, count: actions.length });
    } catch (error) {
      logger.error('action:getRegistry failed', { err: error });
      refuse('Failed to get action registry');
    }
  });

  /**
   * ACTION.PREVIEW - Generate preview for an action
   */
  socket.on('action:preview', async (data: ActionPreviewData, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      
      if (!withinCeiling(socket, 'action:preview', ack)) return;

      const { actionId, actionType, actionData, initiatorId, targetIds } = data;

      // Get initiator stats for preview
      const initiator = await getInitiatorStats(initiatorId, socket.campaignId);
      
      const preview = await generateActionPreview({
        actionId,
        actionType,
        actionData,
        initiatorId,
        targetIds,
        initiatorStats: initiator,
      });

      ack?.({ ok: true, preview });
      
      logger.debug('action:preview', { actionType, initiatorId });
    } catch (error) {
      logger.error('action:preview failed', { err: error });
      refuse('Failed to generate preview');
    }
  });

  /**
   * ACTION.START_RESOLUTION - Create a new action resolution (enters PREVIEW state)
   */
  socket.on('action:startResolution', async (data: ActionPreviewData, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      
      if (!withinCeiling(socket, 'action:startResolution', ack)) return;

      const { actionId, actionType, actionData, initiatorId, targetIds } = data;

      // Verify initiator can act
      const initiator = await getInitiatorStats(initiatorId, socket.campaignId);
      if (!initiator) {
        refuse('Initiator not found');
        return;
      }

      // Check if it's the initiator's turn (if in combat)
      await prisma.campaign.findUnique({
        where: { id: socket.campaignId },
        select: { id: true },
      });
      
      // Create resolution record in PREVIEW state
      const resolution = await prisma.actionResolution.create({
        data: {
          campaignId: socket.campaignId,
          initiatorId,
          targetIds: targetIds || [],
          actionId,
          actionType,
          actionData: JSON.parse(JSON.stringify(actionData)) as Prisma.InputJsonValue,
          status: 'PREVIEW',
        },
      });

      // If action has a cost, mark it as used (tentatively)
      if (actionId) {
        await setActionUsed(actionId, true);
      }

      // Broadcast to campaign
      io.to(socket.campaignId).emit('action:resolutionStarted', {
        resolutionId: resolution.id,
        initiatorId,
        actionType,
        actionData,
        targetIds: targetIds || [],
        status: 'PREVIEW',
      });

      ack?.({ ok: true, resolutionId: resolution.id });
      
      logger.info('action:startResolution', { resolutionId: resolution.id, actionType });
    } catch (error) {
      logger.error('action:startResolution failed', { err: error });
      refuse('Failed to start resolution');
    }
  });

  /**
   * ACTION.ROLL - Roll dice for an action (enters ROLLING state)
   */
  socket.on('action:roll', async (data: ActionRollData, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      
      if (!withinCeiling(socket, 'action:roll', ack)) return;

      const { resolutionId, attackRolls, saveRolls } = data;

      const resolution = await prisma.actionResolution.findUnique({
        where: { id: resolutionId },
      });

      if (!resolution) {
        refuse('Resolution not found');
        return;
      }

      if (resolution.campaignId !== socket.campaignId) {
        refuse('Resolution not in this campaign');
        return;
      }

      // Update status to ROLLING
      await prisma.actionResolution.update({
        where: { id: resolutionId },
        data: { 
          status: 'ROLLING',
          attackRolls: attackRolls as unknown as Prisma.InputJsonValue,
          saveRolls: saveRolls as unknown as Prisma.InputJsonValue,
        },
      });

      // Broadcast roll results
      io.to(socket.campaignId).emit('action:rolled', {
        resolutionId,
        attackRolls,
        saveRolls,
        initiatorId: resolution.initiatorId,
      });

      // Check if DM review is needed
      const campaignSettings = await getCampaignDiceSettings(socket.campaignId);
      const needsReview = shouldTriggerDMReview(attackRolls ?? [], saveRolls ?? [], campaignSettings);

      if (needsReview) {
        // Enter DM_REVIEW state
        await prisma.actionResolution.update({
          where: { id: resolutionId },
          data: { status: 'DM_REVIEW' },
        });
        
        io.to(socket.campaignId).emit('action:dmReviewRequired', { resolutionId });
      } else {
        // Auto-apply
        await autoApplyResolution(io, socket.campaignId, resolutionId);
      }

      ack?.({ ok: true, needsReview });
      
      logger.info('action:roll', { resolutionId, needsReview });
    } catch (error) {
      logger.error('action:roll failed', { err: error });
      refuse('Failed to process roll');
    }
  });

  /**
   * ACTION.DM_REVIEW - DM approves/modifies/cancels resolution
   */
  socket.on('action:dmReview', async (data: ActionReviewData, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    
    try {
      if (!socket.campaignId || socket.role !== 'DM') {
        refuse('DM only');
        return;
      }
      
      if (!withinCeiling(socket, 'action:dmReview', ack)) return;

      const { resolutionId, action, modifications, dmNotes } = data;

      const resolution = await prisma.actionResolution.findUnique({
        where: { id: resolutionId },
      });

      if (!resolution || resolution.campaignId !== socket.campaignId) {
        refuse('Resolution not found');
        return;
      }

      if (action === 'cancel') {
        // Mark resolution as cancelled
        await prisma.actionResolution.update({
          where: { id: resolutionId },
          data: { 
            status: 'CANCELLED', 
            dmOverride: true,
            dmNotes,
            resolvedAt: new Date(),
            resolvedById: socket.userId,
          },
        });

        // Refund used action
        if (resolution.actionId) {
          await setActionUsed(resolution.actionId, false);
        }

        io.to(socket.campaignId).emit('action:resolutionCancelled', { resolutionId });
        ack?.({ ok: true });
        return;
      }

      if (action === 'modify' && modifications) {
        // Apply modifications to resolution data
        const updateData: Prisma.ActionResolutionUpdateInput = {
          dmOverride: true, 
          dmNotes,
          status: 'DM_REVIEW',
        };

        if (modifications.damage) {
          updateData.damageRolls = applyDamageModifications(resolution.damageRolls, modifications.damage) as Prisma.InputJsonValue;
        }
        if (modifications.conditions) {
          updateData.conditions = JSON.parse(JSON.stringify(modifications.conditions)) as Prisma.InputJsonValue;
        }

        await prisma.actionResolution.update({
          where: { id: resolutionId },
          data: updateData,
        });
      }

      // Apply the resolution
      const result = await applyActionResolution(resolutionId, true);
      
      await prisma.actionResolution.update({
        where: { id: resolutionId },
        data: { 
          status: 'APPLIED', 
          resolvedAt: new Date(),
          resolvedById: socket.userId,
        },
      });

      // Broadcast result
      io.to(socket.campaignId).emit('action:resolutionApplied', {
        resolutionId,
        result,
        dmOverride: true,
        dmNotes,
      });

      ack?.({ ok: true, result });
      
      logger.info('action:dmReview', { resolutionId, action, dmOverride: true });
    } catch (error) {
      logger.error('action:dmReview failed', { err: error });
      refuse('Failed to process DM review');
    }
  });

  /**
   * ACTION.REACTION_PROMPT - Request a reaction from a player/DM
   */
  socket.on('action:reactionPrompt', async (data: ReactionPromptData, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }

      // Send reaction prompt to the responder
      const responderSocket = await getUserSocket(io, socket.campaignId, data.responderId);
      if (responderSocket) {
        responderSocket.emit('action:reactionRequested', {
          reactionId: data.reactionId,
          triggerType: data.triggerType,
          triggerData: data.triggerData,
          initiatorId: data.initiatorId,
          targetId: data.targetId,
          timeout: 30000, // 30 seconds
        });
      }

      ack?.({ ok: true });
      
      logger.debug('action:reactionPrompt', { reactionId: data.reactionId, responderId: data.responderId });
    } catch (error) {
      logger.error('action:reactionPrompt failed', { err: error });
      refuse('Failed to send reaction prompt');
    }
  });

  /**
   * ACTION.REACTION_RESPONSE - Player responds to reaction prompt
   */
  socket.on('action:reactionResponse', async (data: { reactionId: string; use: boolean; actionData?: { actionId?: string } }, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }

      // Broadcast response
      io.to(socket.campaignId).emit('action:reactionResolved', {
        reactionId: data.reactionId,
        responderId: socket.userId,
        use: data.use,
        actionData: data.actionData,
      });

      // If reaction used, mark it as used
      if (data.use && data.actionData?.actionId) {
        await setActionUsed(data.actionData.actionId, true);
      }

      ack?.({ ok: true });
      
      logger.debug('action:reactionResponse', { reactionId: data.reactionId, use: data.use });
    } catch (error) {
      logger.error('action:reactionResponse failed', { err: error });
      refuse('Failed to process reaction response');
    }
  });

  /**
   * ACTION.RESET_USED - Reset used actions (short/long rest)
   */
  socket.on('action:resetUsed', async (data: { characterId: string; restType: 'SHORT_REST' | 'LONG_REST' | 'TURN_START' }, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      
      if (!withinCeiling(socket, 'action:resetUsed', ack)) return;

      const { characterId, restType } = data;

      // Verify permissions
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { userId: true, campaignId: true },
      });

      if (!character) {
        refuse('Character not found');
        return;
      }

      const isOwner = character.userId === socket.userId;
      const isDM = socket.role === 'DM';
      
      if (!isOwner && !isDM) {
        refuse('Not authorized');
        return;
      }

      await resetUsedActions(characterId, restType);

      io.to(socket.campaignId).emit('action:usedReset', { characterId, restType });

      ack?.({ ok: true });
      
      logger.info('action:resetUsed', { characterId, restType });
    } catch (error) {
      logger.error('action:resetUsed failed', { err: error });
      refuse('Failed to reset used actions');
    }
  });
}

/**
 * Get initiator stats for preview calculations
 */
async function getInitiatorStats(initiatorId: string, _campaignId: string) {
  // Try character first
  const character = await prisma.character.findUnique({
    where: { id: initiatorId },
    select: { data: true, gameSystem: true },
  });

  if (character && character.gameSystem === 'DND_5E') {
    const data = character.data as unknown as { level?: number; proficiencyBonus?: number; spellcastingAbility?: string; spellAttackBonus?: number; spellSaveDC?: number };
    return {
      level: data.level || 1,
      proficiencyBonus: data.proficiencyBonus || 2,
      spellcastingAbility: data.spellcastingAbility,
      spellAttackBonus: data.spellAttackBonus,
      spellSaveDC: data.spellSaveDC,
    };
  }

  // Try token
  const maps = await prisma.map.findMany({
    where: { tokens: { path: '$[*].id', equals: initiatorId } },
    select: { tokens: true },
  });

  if (maps.length > 0) {
    const tokens = maps[0].tokens as unknown as Array<{ id: string; statBlock?: { level?: number; proficiencyBonus?: number; spellcastingAbility?: string; spellAttackBonus?: number; spellSaveDC?: number } }>;
    const token = tokens.find((candidate) => candidate.id === initiatorId);
    if (token?.statBlock) {
      return {
        level: token.statBlock.level || 1,
        proficiencyBonus: token.statBlock.proficiencyBonus || 2,
        spellcastingAbility: token.statBlock.spellcastingAbility,
        spellAttackBonus: token.statBlock.spellAttackBonus,
        spellSaveDC: token.statBlock.spellSaveDC,
      };
    }
  }

  return {
    level: 1,
    proficiencyBonus: 2,
  };
}

/**
 * Get campaign dice settings for DM review triggers
 */
async function getCampaignDiceSettings(_campaignId: string) {
  // Could be stored in campaign settings
  return {
    dmReviewOnCrit: true,
    dmReviewOnFumble: true,
    dmReviewAlways: false,
    dmReviewNever: false,
  };
}

/**
 * Determine if DM review should be triggered
 */
function shouldTriggerDMReview(
  attackRolls: ActionRoll[],
  _saveRolls: SaveRoll[],
  settings: { dmReviewAlways: boolean; dmReviewNever: boolean; dmReviewOnCrit: boolean; dmReviewOnFumble: boolean }
): boolean {
  if (settings.dmReviewAlways) return true;
  if (settings.dmReviewNever) return false;
  
  // Check for crits/fumbles in attack rolls
  if (settings.dmReviewOnCrit) {
    for (const roll of attackRolls || []) {
      if (roll.breakdown?.rolls) {
        for (const r of roll.breakdown.rolls) {
          if (r.sides === 20 && r.results) {
            const maxRoll = Math.max(...r.results);
            const minRoll = Math.min(...r.results);
            if (maxRoll === 20 || minRoll === 1) return true;
          }
        }
      }
    }
  }
  
  return false;
}

/**
 * Auto-apply resolution without DM review
 */
async function autoApplyResolution(io: Server, campaignId: string, resolutionId: string) {
  try {
    const result = await applyActionResolution(resolutionId, false);
    
    await prisma.actionResolution.update({
      where: { id: resolutionId },
      data: { 
        status: 'APPLIED', 
        resolvedAt: new Date(),
      },
    });

    io.to(campaignId).emit('action:resolutionApplied', {
      resolutionId,
      result,
      dmOverride: false,
    });

    logger.info('action:autoApply', { resolutionId });
  } catch (error) {
    logger.error('action:autoApply failed', { err: error, resolutionId });
  }
}

/**
 * Apply damage modifications from DM review
 */
function applyDamageModifications(damageRolls: Prisma.JsonValue, modifications: Record<string, number>): Prisma.JsonValue {
  if (!damageRolls || !Array.isArray(damageRolls)) return damageRolls;
  
  return damageRolls.map((roll) => {
    if (roll === null || Array.isArray(roll) || typeof roll !== 'object') return roll;
    if (typeof roll.targetId === 'string' && modifications[roll.targetId] !== undefined) {
      return { ...roll, applied: modifications[roll.targetId] };
    }
    return roll;
  });
}

/**
 * Get user's socket in a campaign
 */
async function getUserSocket(io: Server, campaignId: string, userId: string) {
  const sockets = await io.in(campaignId).fetchSockets();
  return sockets.find((remoteSocket) =>
    (remoteSocket as unknown as AuthenticatedSocket).userId === userId
  );
}
