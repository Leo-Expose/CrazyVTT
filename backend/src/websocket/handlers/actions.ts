// ============================================
// Action Resolution handlers
// ============================================

import { Server } from 'socket.io';
import { ActionType, Prisma } from '@prisma/client';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { withinCeiling } from '../shared';
import { ackFrom, refuseRequest } from '../ack';
import { withMapsLocked } from '../../utils/mapTokens';
import { canControlToken, canReadMap } from '../../services/permissions';
import { tokenForRecipient, getSpiritVisibilityBatch, filterTokensByRole, playerSightOnLitMap, viewerIdFor } from '../../utils/spirit-layer';
import { campaignSockets, stillInCampaign } from '../utils';
import type { Token } from '../shared';
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
      if (!socket.campaignId || !socket.userId) {
        refuse('Not authenticated to a campaign');
        return;
      }

      if (!withinCeiling(socket, 'action:getRegistry', ack)) return;

      if (!data || typeof data !== 'object' || Array.isArray(data) || !data.characterId) {
        refuse('characterId is required');
        return;
      }

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
      if (!socket.campaignId || !socket.userId) {
        refuse('Not authenticated to a campaign');
        return;
      }

      if (!withinCeiling(socket, 'action:preview', ack)) return;

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        refuse('Invalid payload');
        return;
      }

      const { actionId, actionType, actionData, initiatorId, targetIds } = data;
      if (!initiatorId || typeof initiatorId !== 'string') {
        refuse('initiatorId is required');
        return;
      }

      // Get initiator stats for preview (scoped to campaign)
      const initiator = await getInitiatorStats(initiatorId, socket.campaignId);
      if (!initiator) {
        refuse('Initiator not found in this campaign');
        return;
      }

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
      if (!socket.campaignId || !socket.userId) {
        refuse('Not authenticated to a campaign');
        return;
      }

      if (!withinCeiling(socket, 'action:startResolution', ack)) return;

      if (socket.role === 'SPECTATOR') {
        refuse('Spectators cannot perform actions');
        return;
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        refuse('Invalid payload');
        return;
      }

      const { actionId, actionType, actionData, initiatorId, targetIds } = data;
      if (!initiatorId || typeof initiatorId !== 'string') {
        refuse('initiatorId is required');
        return;
      }

      // Verify initiator belongs to this campaign and this user may act for it
      const authorized = await canActAsInitiator(socket, socket.campaignId, initiatorId);
      if (!authorized.ok) {
        refuse(authorized.error);
        return;
      }

      if (actionId) {
        const action = await prisma.characterAction.findUnique({
          where: { id: actionId },
          select: { character: { select: { userId: true, campaignId: true } } },
        });
        if (!action || action.character.campaignId !== socket.campaignId ||
            (socket.role !== 'DM' && action.character.userId !== socket.userId)) {
          refuse('Action not found or not authorized');
          return;
        }
      }

      // Create resolution record in PREVIEW state
      const resolution = await prisma.actionResolution.create({
        data: {
          campaignId: socket.campaignId,
          initiatorId,
          targetIds: Array.isArray(targetIds) ? targetIds : [],
          actionId,
          actionType,
          actionData: JSON.parse(JSON.stringify(actionData ?? {})) as Prisma.InputJsonValue,
          status: 'PREVIEW',
        },
      });

      // If action has a cost, mark it as used (tentatively)
      if (actionId) {
        await setActionUsed(actionId, true).catch(() => {});
      }

      // Broadcast to campaign
      io.to(socket.campaignId).emit('action:resolutionStarted', {
        resolutionId: resolution.id,
        initiatorId,
        actionType,
        actionData,
        targetIds: Array.isArray(targetIds) ? targetIds : [],
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
      if (!socket.campaignId || !socket.userId) {
        refuse('Not authenticated to a campaign');
        return;
      }

      if (!withinCeiling(socket, 'action:roll', ack)) return;

      if (socket.role === 'SPECTATOR') {
        refuse('Spectators cannot roll actions');
        return;
      }

      if (!data || typeof data !== 'object' || Array.isArray(data) || !data.resolutionId) {
        refuse('resolutionId is required');
        return;
      }

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

      const authorized = await canActAsInitiator(socket, socket.campaignId, resolution.initiatorId);
      if (!authorized.ok) {
        refuse(authorized.error);
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
      if (!socket.campaignId || !socket.userId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      if (!withinCeiling(socket, 'action:reactionPrompt', ack)) return;
      if (socket.role === 'SPECTATOR') {
        refuse('Spectators cannot prompt reactions');
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || !data.responderId || !data.reactionId) {
        refuse('responderId and reactionId are required');
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
      if (!socket.campaignId || !socket.userId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      if (!withinCeiling(socket, 'action:reactionResponse', ack)) return;
      if (socket.role === 'SPECTATOR') {
        refuse('Spectators cannot respond to reactions');
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || !data.reactionId) {
        refuse('reactionId is required');
        return;
      }

      // Broadcast response
      io.to(socket.campaignId).emit('action:reactionResolved', {
        reactionId: data.reactionId,
        responderId: socket.userId,
        use: Boolean(data.use),
        actionData: data.actionData,
      });

      // If reaction used, mark it as used (only if owned by user/DM in this campaign)
      if (data.use && data.actionData?.actionId) {
        const action = await prisma.characterAction.findUnique({
          where: { id: data.actionData.actionId },
          select: { character: { select: { userId: true, campaignId: true } } },
        });
        if (action?.character?.campaignId === socket.campaignId && (socket.role === 'DM' || action.character.userId === socket.userId)) {
          await setActionUsed(data.actionData.actionId, true);
        }
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
      if (!socket.campaignId || !socket.userId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      if (!withinCeiling(socket, 'action:resetUsed', ack)) return;
      if (socket.role === 'SPECTATOR') {
        refuse('Spectators cannot reset actions');
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || !data.characterId || !data.restType) {
        refuse('characterId and restType are required');
        return;
      }

      const { characterId, restType } = data;

      // Verify permissions
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { userId: true, campaignId: true },
      });

      if (!character || character.campaignId !== socket.campaignId) {
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

  /**
   * ACTION.RESOLVE - Direct effect resolution (PRD §10.3)
   * Direct apply of damage, healing, resource deduction, and conditions to target tokens/characters
   */
  socket.on('action:resolve', async (data: {
    actionId?: string;
    actionName?: string;
    initiatorId?: string;
    targets: Array<{ id: string; name?: string }>;
    effects?: {
      damage?: number;
      damageType?: string;
      healing?: number;
      tempHP?: number;
      conditions?: Array<{ name: string; duration?: string }>;
      resourceCost?: { type: string; amount: number };
    };
    dmModifications?: Record<string, unknown>;
  }, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);

    try {
      if (!socket.campaignId || !socket.userId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      if (!withinCeiling(socket, 'action:resolve', ack)) return;
      if (socket.role === 'SPECTATOR') {
        refuse('Spectators cannot resolve actions');
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.targets)) {
        refuse('targets array is required');
        return;
      }

      const { actionId, actionName, initiatorId, targets, effects, dmModifications } = data;

      if (socket.role !== 'DM') {
        if (!initiatorId || typeof initiatorId !== 'string') {
          refuse('initiatorId is required');
          return;
        }
        const authorized = await canActAsInitiator(socket, socket.campaignId, initiatorId);
        if (!authorized.ok) {
          refuse(authorized.error);
          return;
        }
      }

      const appliedResults: Array<{
        targetId: string;
        previousHP?: number;
        newHP?: number;
        appliedConditions?: string[];
      }> = [];

      // 1. If an action is identified, mark it as used (verify campaign & ownership)
      if (actionId) {
        const action = await prisma.characterAction.findUnique({
          where: { id: actionId },
          select: { character: { select: { userId: true, campaignId: true } } },
        });
        if (action?.character?.campaignId === socket.campaignId && (socket.role === 'DM' || action.character.userId === socket.userId)) {
          await setActionUsed(actionId, true).catch(() => {});
        }
      }

      const campaign = await prisma.campaign.findUnique({
        where: { id: socket.campaignId },
        select: { currentMapId: true },
      });
      const currentMapId = campaign?.currentMapId ?? null;

      // 2. Apply effects to each target token under map lock
      const campaignMaps = await prisma.map.findMany({
        where: { campaignId: socket.campaignId },
        select: { id: true, tokens: true, lightingEnabled: true, globalIllumination: true, wallSegments: true, lights: true },
      });

      const readableMaps = campaignMaps.filter((m) => canReadMap(socket.role, m.id, currentMapId));
      const targetIds = new Set(targets.map((t) => t.id));
      const affectedMapIds = readableMaps
        .filter((m) => {
          const toks = Array.isArray(m.tokens) ? (m.tokens as Array<Record<string, unknown>>) : [];
          return toks.some((tok) => typeof tok.id === 'string' && targetIds.has(tok.id));
        })
        .map((m) => m.id);

      const updatedBroadcasts: Array<{ mapId: string; tokens: Array<Record<string, unknown>> }> = [];

      if (affectedMapIds.length > 0) {
        await withMapsLocked(affectedMapIds, async (tx) => {
          for (const mapId of affectedMapIds) {
            const freshMap = await tx.map.findUnique({
              where: { id: mapId },
              select: { id: true, tokens: true },
            });
            if (!freshMap) continue;
            const mapTokens = Array.isArray(freshMap.tokens)
              ? [...(freshMap.tokens as Array<Record<string, unknown>>)]
              : [];
            const changedTokens: Array<Record<string, unknown>> = [];

            for (const target of targets) {
              const tokenIndex = mapTokens.findIndex((tok) => tok.id === target.id);
              if (tokenIndex === -1) continue;

              const token = { ...mapTokens[tokenIndex] };
              const hp = (token.hp as { current: number; max?: number; maximum?: number; temp?: number; temporary?: number }) || null;
              const newHP = hp ? { ...hp } : null;

              if (newHP) {
                const maxVal = newHP.maximum ?? newHP.max ?? newHP.current;
                let tempVal = newHP.temporary ?? newHP.temp ?? 0;

                if (typeof effects?.damage === 'number' && Number.isFinite(effects.damage) && effects.damage > 0) {
                  let damageRemaining = effects.damage;
                  if (tempVal > 0) {
                    const absorbed = Math.min(tempVal, damageRemaining);
                    tempVal -= absorbed;
                    damageRemaining -= absorbed;
                  }
                  newHP.current = Math.max(0, newHP.current - damageRemaining);
                }
                if (typeof effects?.healing === 'number' && Number.isFinite(effects.healing) && effects.healing > 0) {
                  newHP.current = Math.min(maxVal, newHP.current + effects.healing);
                }
                if (typeof effects?.tempHP === 'number' && Number.isFinite(effects.tempHP) && effects.tempHP > 0) {
                  tempVal = Math.max(tempVal, effects.tempHP);
                }
                if (newHP.temporary !== undefined) newHP.temporary = tempVal;
                else newHP.temp = tempVal;
                token.hp = newHP;
              }

              const conditions = Array.isArray(token.conditions) ? [...(token.conditions as string[])] : [];
              if (Array.isArray(effects?.conditions)) {
                for (const c of effects.conditions) {
                  if (c?.name && !conditions.includes(c.name)) {
                    conditions.push(c.name);
                  }
                }
                token.conditions = conditions;
              }

              mapTokens[tokenIndex] = token;
              changedTokens.push(token);

              appliedResults.push({
                targetId: target.id,
                previousHP: hp?.current,
                newHP: newHP?.current,
                appliedConditions: effects?.conditions?.map((c) => c.name),
              });
            }

            if (changedTokens.length > 0) {
              await tx.map.update({
                where: { id: mapId },
                data: { tokens: mapTokens as unknown as Prisma.InputJsonValue },
              });
              updatedBroadcasts.push({ mapId, tokens: changedTokens });
            }
          }
        });
      }

      // Broadcast each updated token masked per recipient role, plane, and sight
      if (updatedBroadcasts.length > 0) {
        const sockets = await campaignSockets(io, socket.campaignId);
        const visibility = await getSpiritVisibilityBatch(
          socket.campaignId,
          sockets.map((s) => (s as unknown as AuthenticatedSocket).userId).filter((id): id is string => !!id)
        );
        const fullMaps = await prisma.map.findMany({
          where: { id: { in: updatedBroadcasts.map((u) => u.mapId) } },
          select: { id: true, tokens: true, width: true, height: true, gridSize: true, lightingEnabled: true, globalIllumination: true, wallSegments: true, lights: true },
        });
        const mapById = new Map(fullMaps.map((m) => [m.id, m]));

        for (const broadcast of updatedBroadcasts) {
          const mapMeta = mapById.get(broadcast.mapId);
          for (const s of stillInCampaign(sockets, socket.campaignId)) {
            const member = s as unknown as AuthenticatedSocket;
            if (!canReadMap(member.role, broadcast.mapId, currentMapId)) continue;
            const spiritVisible = member.role === 'DM' ? true : member.userId ? (visibility.get(member.userId) ?? false) : false;
            const viewer = viewerIdFor(member.role, member.userId);
            const roleTokens = filterTokensByRole(mapMeta?.tokens ?? [], member.role || 'PLAYER', spiritVisible, member.userId);
            const sight = (member.role !== 'DM' && mapMeta?.lightingEnabled)
              ? playerSightOnLitMap(
                  roleTokens,
                  viewer,
                  mapMeta.wallSegments,
                  mapMeta.width,
                  mapMeta.height,
                  mapMeta.gridSize,
                  mapMeta.lights,
                  mapMeta.globalIllumination ?? true
                )
              : null;

            for (const rawTok of broadcast.tokens) {
              const tok = rawTok as unknown as Token;
              if (member.role !== 'DM') {
                if (tok.visible === false) continue;
                if (spiritVisible && tok.layer !== 'spirit') continue;
                if (!spiritVisible && tok.layer !== 'token') continue;
                if (sight && !sight.seesToken(tok)) continue;
              }
              s.emit('token:updated', {
                mapId: broadcast.mapId,
                token: tokenForRecipient(tok, viewer),
              });
            }
          }
        }
      }

      // Broadcast action resolved event
      io.to(socket.campaignId).emit('action:resolved', {
        actionId,
        actionName,
        initiatorId,
        targets,
        effects,
        dmModifications,
        results: appliedResults,
        resolvedBy: socket.userId,
      });

      ack?.({ ok: true, results: appliedResults });
      logger.info('action:resolve direct effect applied', {
        campaignId: socket.campaignId,
        targetsCount: targets.length,
        actionName,
      });
    } catch (error) {
      logger.error('action:resolve failed', { err: error });
      refuse('Failed to resolve action effects');
    }
  });
}

async function canActAsInitiator(
  socket: AuthenticatedSocket,
  campaignId: string,
  initiatorId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const character = await prisma.character.findUnique({
    where: { id: initiatorId },
    select: { userId: true, campaignId: true },
  });
  if (character) {
    if (character.campaignId !== campaignId) {
      return { ok: false, error: 'Initiator is not in this campaign' };
    }
    if (socket.role === 'DM' || character.userId === socket.userId) {
      return { ok: true };
    }
    return { ok: false, error: 'You do not control this character' };
  }

  const maps = await prisma.map.findMany({
    where: { campaignId },
    select: { tokens: true },
  });
  for (const m of maps) {
    const tokens = Array.isArray(m.tokens) ? (m.tokens as Array<{ id?: string; controlledBy?: string | null }>) : [];
    const token = tokens.find((t) => t.id === initiatorId);
    if (token) {
      if (canControlToken(socket.role, token.controlledBy, socket.userId)) {
        return { ok: true };
      }
      return { ok: false, error: 'You do not control this token' };
    }
  }

  return { ok: false, error: 'Initiator not found' };
}

/**
 * Get initiator stats for preview calculations
 */
async function getInitiatorStats(initiatorId: string, campaignId: string) {
  // Try character first (scoped to campaign)
  const character = await prisma.character.findUnique({
    where: { id: initiatorId },
    select: { data: true, gameSystem: true, campaignId: true },
  });

  if (character && character.campaignId === campaignId && character.gameSystem === 'DND_5E') {
    const data = character.data as unknown as { level?: number; proficiencyBonus?: number; spellcastingAbility?: string; spellAttackBonus?: number; spellSaveDC?: number };
    return {
      level: data.level || 1,
      proficiencyBonus: data.proficiencyBonus || 2,
      spellcastingAbility: data.spellcastingAbility,
      spellAttackBonus: data.spellAttackBonus,
      spellSaveDC: data.spellSaveDC,
    };
  }

  // Try token (scoped to campaign)
  const maps = await prisma.map.findMany({
    where: { campaignId, tokens: { path: '$[*].id', equals: initiatorId } },
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
    return { level: 1, proficiencyBonus: 2 };
  }

  return null;
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
