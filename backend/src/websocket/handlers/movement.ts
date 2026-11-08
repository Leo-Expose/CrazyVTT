// ============================================
// Movement Handlers (Phase 6)
// WebSocket events for movement system
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { ackFrom, type AckAnswer } from '../ack';
import { prisma } from '../../config/database';
import { readTokens, toJson } from '../../utils/prisma-json';
import { withMapsLocked, clampTokenPosition } from '../../utils/mapTokens';
import { canControlToken, canMoveTokensNow, canReadMap, PAUSED_MOVE_REFUSAL } from '../../services/permissions';
import { withinCeiling, limiterKey, tokenMoveLimiter } from '../shared';
import { calculateReachableArea, type MovementCalculationOptions, type TerrainGrid, type ReachableAreaResult } from '../../services/movement/reachableArea';
import { recordMovement } from '../../services/movement/history';
import { 
  applyDashAction, 
  applyDisengageAction, 
  spendBonusActionMovement,
  getBonusActionMovementSpeed,
} from '../../services/movement';
import logger from '../../utils/logger';
import type { Token, MovementMode } from '../../types/index.js';

interface DragMovementState {
  tokenId: string;
  mapId: string;
  startPosition: { x: number; y: number };
  reachableResult: ReachableAreaResult | null;
  pathSoFar: { x: number; y: number }[];
  speedUsed: number;
  opportunityAttacksTriggered: OpportunityAttackTrigger[];
  dmOverrides: string[];
  decidedAt: number;
}

interface OpportunityAttackTrigger {
  tokenId: string;
  attackerId: string;
  position: { x: number; y: number };
}

const movementDrags = new Map<string, DragMovementState>();

export function registerMovementHandlers(io: Server, socket: AuthenticatedSocket): void {
  
  /**
   * MOVEMENT.REACHABLE - Calculate reachable squares for a token
   */
  socket.on('movement:reachable', async (data: { tokenId: string; mapId: string; speed?: number; movementMode?: string; ignoreTerrain?: boolean }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      
      if (!withinCeiling(socket, 'movement:reachable')) return;
      
      const { tokenId, mapId, speed, movementMode, ignoreTerrain } = data;
      
      if (!tokenId || !mapId) {
        socket.emit('error', { message: 'tokenId and mapId required' });
        return;
      }
      
      const map = await prisma.map.findUnique({
        where: { id: mapId },
        include: { campaign: { select: { currentMapId: true, status: true } } },
      });
      
      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }
      
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const token = tokensArray.find(t => t.id === tokenId);
      
      if (!token) {
        socket.emit('error', { message: 'Token not found' });
        return;
      }
      
      // Permission check
      if (!canControlToken(socket.role, token.controlledBy, socket.userId)) {
        socket.emit('error', { message: 'You do not have permission to move this token' });
        return;
      }
      
      // Session status check
      if (!canMoveTokensNow(socket.role, map.campaign.status)) {
        socket.emit('error', { message: PAUSED_MOVE_REFUSAL });
        return;
      }
      
      // Build terrain grid from map data
      // TODO: Get from map's terrain layer when implemented
      const terrainGrid: TerrainGrid = {
        width: map.width,
        height: map.height,
        gridSize: map.gridSize,
        terrain: new Array(map.width * map.height).fill('normal'),
      };
      
      // Calculate reachable area
      const options: MovementCalculationOptions = {
        token,
        map: { width: map.width, height: map.height, gridSize: map.gridSize, feetPerSquare: map.feetPerSquare ?? 5 },
        terrainGrid,
        ignoreDifficultTerrain: ignoreTerrain ?? false,
        ignoreHazardousTerrain: ignoreTerrain ?? false,
        ignoreAllTerrain: movementMode === 'teleport',
        useSpeedOverride: speed,
      };
      
      const result = calculateReachableArea(options);
      
      socket.emit('movement:reachable:result', {
        tokenId,
        reachable: result.reachable,
        speedUsed: 0,
        movementMode: result.movementMode,
      });
      
    } catch (error) {
      logger.error('movement:reachable failed', { err: error });
      socket.emit('error', { message: 'Failed to calculate reachable area' });
    }
  });
  
  /**
   * MOVEMENT.START - Begin a movement drag with reachable area preview
   */
  socket.on('movement:start', async (data: { tokenId: string; mapId: string }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      
      if (!withinCeiling(socket, 'movement:start')) return;
      
      const { tokenId, mapId } = data;
      
      if (!tokenId || !mapId) {
        socket.emit('error', { message: 'tokenId and mapId required' });
        return;
      }
      
      const map = await prisma.map.findUnique({
        where: { id: mapId },
        include: { campaign: { select: { status: true, currentMapId: true } } },
      });
      
      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }
      
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const token = tokensArray.find(t => t.id === tokenId);
      
      if (!token) {
        socket.emit('error', { message: 'Token not found' });
        return;
      }
      
      if (!canControlToken(socket.role, token.controlledBy, socket.userId)) {
        socket.emit('error', { message: 'You do not have permission to move this token' });
        return;
      }
      
      if (!canMoveTokensNow(socket.role, map.campaign.status)) {
        socket.emit('error', { message: PAUSED_MOVE_REFUSAL });
        return;
      }
      
      // Build terrain grid
      const terrainGrid: TerrainGrid = {
        width: map.width,
        height: map.height,
        gridSize: map.gridSize,
        terrain: new Array(map.width * map.height).fill('normal'),
      };
      
      // Calculate reachable area
      const options: MovementCalculationOptions = {
        token,
        map: { width: map.width, height: map.height, gridSize: map.gridSize, feetPerSquare: map.feetPerSquare ?? 5 },
        terrainGrid,
      };
      
      const reachableResult = calculateReachableArea(options);
      
      // Store drag state
      const dragState: DragMovementState = {
        tokenId,
        mapId,
        startPosition: { x: token.position.x, y: token.position.y },
        reachableResult,
        pathSoFar: [{ x: token.position.x, y: token.position.y }],
        speedUsed: 0,
        opportunityAttacksTriggered: [],
        dmOverrides: [],
        decidedAt: Date.now(),
      };
      
      movementDrags.set(tokenId, dragState);
      
      // Broadcast to campaign
      await emitMovementStart(token, mapId, reachableResult, socket.userId ?? null);
      
      logger.debug('movement:start', { tokenId, userId: socket.userId, mapId });
    } catch (error) {
      logger.error('movement:start failed', { err: error });
      socket.emit('error', { message: 'Failed to start movement' });
    }
  });
  
  /**
   * MOVEMENT.MOVE - Update ghost token position during drag
   */
  socket.on('movement:move', async (data: { tokenId: string; mapId: string; x: number; y: number }) => {
    try {
      if (!socket.campaignId) return;
      
      // Flood ceiling for movement frames
      if (!tokenMoveLimiter.check(limiterKey(socket), 150, 1000)) {
        return;
      }
      
      const { tokenId, mapId, x, y } = data;
      
      if (!tokenId || !mapId || typeof x !== 'number' || typeof y !== 'number') return;
      
      const dragState = movementDrags.get(tokenId);
      if (!dragState) return; // No active drag
      
      const map = await prisma.map.findUnique({
        where: { id: mapId },
        select: { width: true, height: true, tokens: true, campaignId: true, campaign: { select: { status: true, currentMapId: true } } },
      });
      
      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) return;
      
      if (!canMoveTokensNow(socket.role, map.campaign.status)) return;
      
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const movingToken = tokensArray.find(t => t.id === tokenId);
      if (!movingToken) return;
      
      if (!canControlToken(socket.role, movingToken.controlledBy, socket.userId)) return;
      
      // Validate bounds
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) return;
      
      // Check if square is reachable
      const reachableResult = dragState.reachableResult;
      if (!reachableResult) return;
      
      const targetSquare = reachableResult.reachable.find(s => s.x === x && s.y === y);
      if (!targetSquare) return; // Not reachable
      
      // Update path
      dragState.pathSoFar = targetSquare.path;
      dragState.speedUsed = targetSquare.cost;
      
      // Check for opportunity attacks
      // This is a preview - we check what squares we're leaving
      // Full AoO resolution happens on commit
      
      // Broadcast ghost position
      await emitMovementFrame(tokenId, mapId, x, y, targetSquare.path, targetSquare.cost, true);
      
    } catch (error) {
      logger.error('movement:move failed', { err: error });
    }
  });
  
  /**
   * MOVEMENT.COMMIT - Finalize movement
   */
  socket.on('movement:commit', async (data: { 
    tokenId: string; 
    mapId: string; 
    x: number; 
    y: number; 
    path: { x: number; y: number }[];
    speedUsed: number;
  }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      
      if (!withinCeiling(socket, 'movement:commit')) return;
      
      const { tokenId, mapId, x: dropX, y: dropY, path, speedUsed } = data;
      
      if (!tokenId || !mapId || !Number.isInteger(dropX) || !Number.isInteger(dropY)) {
        socket.emit('error', { message: 'Invalid movement commit data' });
        return;
      }
      
      const dragState = movementDrags.get(tokenId);
      if (!dragState) {
        socket.emit('error', { message: 'No active movement to commit' });
        return;
      }
      
      const map = await prisma.map.findUnique({
        where: { id: mapId },
        include: { campaign: { select: { status: true, currentMapId: true } } },
      });
      
      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }
      
      if (dropX < 0 || dropX >= map.width || dropY < 0 || dropY >= map.height) {
        socket.emit('error', { message: 'Token position out of bounds' });
        return;
      }
      
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const tokenIndex = tokensArray.findIndex(t => t.id === tokenId);
      
      if (tokenIndex === -1) {
        socket.emit('error', { message: 'Token not found' });
        return;
      }
      
      const token = tokensArray[tokenIndex];
      
      if (!canControlToken(socket.role, token.controlledBy, socket.userId)) {
        socket.emit('error', { message: 'You do not have permission to move this token' });
        await cancelMovement(tokenId, mapId, dragState.startPosition, socket.campaignId, io);
        return;
      }
      
      if (!canMoveTokensNow(socket.role, map.campaign.status)) {
        socket.emit('error', { message: PAUSED_MOVE_REFUSAL });
        await cancelMovement(tokenId, mapId, dragState.startPosition, socket.campaignId, io);
        return;
      }
      
      // Clamp position to token footprint
      const { x, y } = clampTokenPosition({ x: dropX, y: dropY }, token.size ?? { width: 1, height: 1 }, map);
      
      // Verify the target is still reachable
      const reachableResult = dragState.reachableResult;
      if (reachableResult) {
        const targetSquare = reachableResult.reachable.find(s => s.x === x && s.y === y);
        if (!targetSquare) {
          socket.emit('error', { message: 'Target square no longer reachable' });
          await cancelMovement(tokenId, mapId, dragState.startPosition, socket.campaignId, io);
          return;
        }
      }
      
      // Check for opportunity attacks
      const opportunityAttacks = await detectOpportunityAttacks(token, map, path, socket.campaignId);
      
      if (opportunityAttacks.length > 0) {
        // Send reaction prompts before committing
        // For now, we'll auto-resolve - in full implementation this would prompt players
        for (const aoo of opportunityAttacks) {
          // TODO: Send reaction prompt to attacker
          // For now, log it
          dragState.opportunityAttacksTriggered.push(aoo);
        }
      }
      
      // Update token position
      token.position = { x, y };
      
      // Update movement data on token
      if (!token.movement) {
        token.movement = {
          speed: 30,
          movementMode: 'walk',
          remainingThisTurn: 30,
          usedThisTurn: 0,
          difficultTerrainMultiplier: 1,
          threatenedSquares: [],
          reach: 5,
        };
      }
      
      token.movement.usedThisTurn += speedUsed;
      token.movement.remainingThisTurn = Math.max(0, token.movement.remainingThisTurn - speedUsed);
      
      await withMapsLocked([mapId], async (tx) => {
        const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
        const tokens = readTokens(fresh.tokens);
        const index = tokens.findIndex(t => t.id === tokenId);
        if (index !== -1) tokens[index] = { ...tokens[index], position: { x, y }, movement: token.movement };
        await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
        return tokens;
      });
      
      // Record in history
      await recordMovement({
        tokenId,
        tokenName: token.name,
        mapId,
        campaignId: socket.campaignId,
        startPosition: dragState.startPosition,
        endPosition: { x, y },
        path,
        distance: speedUsed,
        movementMode: token.movement.movementMode,
        opportunityAttacks: dragState.opportunityAttacksTriggered.map(aoo => ({
          enemyTokenId: aoo.attackerId,
          enemyName: aoo.attackerId,
          hit: false, // Will be updated when resolved
          stoppedMovement: false,
        })),
        dmOverrides: dragState.dmOverrides,
        movedById: socket.userId ?? 'unknown',
        movedByName: socket.userId ?? 'Unknown',
      });
      
      // Broadcast final position
      await emitMovementCommit(token, mapId, x, y, path, speedUsed, dragState.opportunityAttacksTriggered, socket.userId ?? null);
      
      // Clean up drag state
      movementDrags.delete(tokenId);
      
      logger.debug('movement:commit', { tokenId, x, y, speedUsed, userId: socket.userId });
    } catch (error) {
      logger.error('movement:commit failed', { err: error });
      socket.emit('error', { message: 'Failed to commit movement' });
    }
  });
  
  /**
   * MOVEMENT.CANCEL - Cancel movement and return to start
   */
  socket.on('movement:cancel', async (data: { tokenId: string; mapId: string }) => {
    try {
      const { tokenId, mapId } = data;
      const dragState = movementDrags.get(tokenId);
      
      if (dragState) {
        await cancelMovement(tokenId, mapId, dragState.startPosition, socket.campaignId!, io);
        movementDrags.delete(tokenId);
      }
    } catch (error) {
      logger.error('movement:cancel failed', { err: error });
    }
  });
  
  /**
   * MOVEMENT.MODE_CHANGE - Change movement mode
   */
  socket.on('movement:mode_change', async (data: { tokenId: string; mapId: string; movementMode: MovementMode }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      
      if (!withinCeiling(socket, 'movement:mode_change')) return;
      
      const { tokenId, mapId, movementMode } = data;
      
      if (!tokenId || !mapId || !movementMode) {
        socket.emit('error', { message: 'tokenId, mapId, and movementMode required' });
        return;
      }
      
      // Only DM can change movement mode of tokens they don't control
      // But players can change their own token's mode
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }
      
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const token = tokensArray.find(t => t.id === tokenId);
      
      if (!token) {
        socket.emit('error', { message: 'Token not found' });
        return;
      }
      
      if (!canControlToken(socket.role, token.controlledBy, socket.userId) && socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can change movement mode for other tokens' });
        return;
      }
      
      // Update token's movement mode
      if (!token.movement) {
        token.movement = {
          speed: 30,
          movementMode: 'walk',
          remainingThisTurn: 30,
          usedThisTurn: 0,
          difficultTerrainMultiplier: 1,
          threatenedSquares: [],
          reach: 5,
        };
      }
      
      token.movement.movementMode = movementMode;
      
      // Reset remaining movement for new mode
      const speed = getMovementSpeedForMode(token, movementMode);
      token.movement.remainingThisTurn = speed;
      token.movement.usedThisTurn = 0;
      
      await withMapsLocked([mapId], async (tx) => {
        const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
        const tokens = readTokens(fresh.tokens);
        const index = tokens.findIndex(t => t.id === tokenId);
        if (index !== -1) tokens[index] = { ...tokens[index], movement: token.movement };
        await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
      });
      
      // Broadcast to campaign
      await emitMovementModeChange(io, socket.campaignId, tokenId, mapId, movementMode, socket.userId ?? null);
      
      logger.debug('movement:mode_change', { tokenId, movementMode, userId: socket.userId });
    } catch (error) {
      logger.error('movement:mode_change failed', { err: error });
      socket.emit('error', { message: 'Failed to change movement mode' });
    }
  });
  
  /**
   * MOVEMENT.DM_OVERRIDE - DM override for movement
   */
  socket.on('movement:dm_override', async (data: { 
    tokenId: string; 
    mapId: string; 
    type: 'teleport' | 'grant_extra' | 'ignore_terrain' | 'force_move' | 'reset';
    value?: number;
    position?: { x: number; y: number };
    ignoreTerrain?: boolean;
  }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can use movement overrides' });
        return;
      }
      
      if (!withinCeiling(socket, 'movement:dm_override')) return;
      
      const { tokenId, mapId, type, value, position, ignoreTerrain: _ignoreTerrain } = data;
      
      if (!tokenId || !mapId || !type) {
        socket.emit('error', { message: 'tokenId, mapId, and type required' });
        return;
      }
      
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }
      
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const tokenIndex = tokensArray.findIndex(t => t.id === tokenId);
      
      if (tokenIndex === -1) {
        socket.emit('error', { message: 'Token not found' });
        return;
      }
      
      const token = tokensArray[tokenIndex];
      
      if (!token.movement) {
        token.movement = {
          speed: 30,
          movementMode: 'walk',
          remainingThisTurn: 30,
          usedThisTurn: 0,
          difficultTerrainMultiplier: 1,
          threatenedSquares: [],
          reach: 5,
        };
      }
      
      const dmOverrides: string[] = [];
      
      switch (type) {
        case 'teleport':
          if (position) {
            const { x, y } = clampTokenPosition(position, token.size ?? { width: 1, height: 1 }, map);
            token.position = { x, y };
            dmOverrides.push(`Teleported to (${x}, ${y})`);
          }
          break;
          
        case 'grant_extra':
          if (value) {
            token.movement.remainingThisTurn += value;
            dmOverrides.push(`Granted +${value}ft movement`);
          }
          break;
          
        case 'ignore_terrain':
          // This would be applied during reachable calculation
          dmOverrides.push('Ignore difficult terrain (toggle)');
          break;
          
        case 'force_move':
          if (position) {
            const { x, y } = clampTokenPosition(position, token.size ?? { width: 1, height: 1 }, map);
            token.position = { x, y };
            dmOverrides.push(`Force moved to (${x}, ${y})`);
          }
          break;
          
        case 'reset':
          token.movement.remainingThisTurn = getMovementSpeedForMode(token, token.movement.movementMode);
          token.movement.usedThisTurn = 0;
          dmOverrides.push('Reset movement');
          break;
      }
      
      await withMapsLocked([mapId], async (tx) => {
        const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
        const tokens = readTokens(fresh.tokens);
        const index = tokens.findIndex(t => t.id === tokenId);
        if (index !== -1) tokens[index] = { ...tokens[index], position: token.position, movement: token.movement };
        await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
      });
      
      // Broadcast
      await emitDMOverride(io, socket.campaignId, tokenId, mapId, type, value, position, socket.userId ?? null);
      
      logger.debug('movement:dm_override', { tokenId, type, userId: socket.userId });
    } catch (error) {
      logger.error('movement:dm_override failed', { err: error });
      socket.emit('error', { message: 'Failed to apply DM override' });
    }
  });
  
  /**
   * MOVEMENT.REACTION - Player response to AoO prompt
   */
  socket.on('movement:reaction', async (_data: { promptId: string; action: 'take' | 'decline'; attackRoll?: { expression: string; result: number } }) => {
    try {
      // TODO: Implement reaction resolution
      // This would resolve the AoO and continue movement if not stopped
    } catch (error) {
      logger.error('movement:reaction failed', { err: error });
    }
  });
  
  /**
   * MOVEMENT.DASH - Use Dash action to double movement
   */
  socket.on('movement:dash', async (data: { tokenId: string; mapId: string }, ackArg?: unknown) => {
    const ack = ackFrom(ackArg) ?? ((response: AckAnswer) => socket.emit('movement:dash:response', response));
    
    try {
      if (!socket.campaignId) {
        ack({ ok: false, error: 'Not authenticated to a campaign' });
        return;
      }
      
      if (socket.role !== 'DM' && !withinCeiling(socket, 'movement:dash')) return;
      
      const { tokenId, mapId } = data;
      
      if (!tokenId || !mapId) {
        ack({ ok: false, error: 'tokenId and mapId required' });
        return;
      }
      
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        ack({ ok: false, error: 'Map not found' });
        return;
      }
      
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const token = tokensArray.find(t => t.id === tokenId);
      
      if (!token) {
        ack({ ok: false, error: 'Token not found' });
        return;
      }
      
      // Check permission
      if (!canControlToken(socket.role, token.controlledBy, socket.userId) && socket.role !== 'DM') {
        ack({ ok: false, error: 'Not authorized' });
        return;
      }
      
      await applyDashAction(socket.campaignId, tokenId, mapId);
      
      // Broadcast update
      io.to(socket.campaignId).emit('movement:dash:applied', { tokenId, mapId, userId: socket.userId });
      
      ack({ ok: true });
      logger.debug('movement:dash', { tokenId, userId: socket.userId });
    } catch (error) {
      logger.error('movement:dash failed', { err: error });
      ack({ ok: false, error: 'Failed to apply Dash' });
    }
  });
  
  /**
   * MOVEMENT.DISENGAGE - Use Disengage action to avoid AoO
   */
  socket.on('movement:disengage', async (data: { tokenId: string; mapId: string }, ackArg?: unknown) => {
    const ack = ackFrom(ackArg) ?? ((response: AckAnswer) => socket.emit('movement:disengage:response', response));
    
    try {
      if (!socket.campaignId) {
        ack({ ok: false, error: 'Not authenticated to a campaign' });
        return;
      }
      
      if (socket.role !== 'DM' && !withinCeiling(socket, 'movement:disengage')) return;
      
      const { tokenId, mapId } = data;
      
      if (!tokenId || !mapId) {
        ack({ ok: false, error: 'tokenId and mapId required' });
        return;
      }
      
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        ack({ ok: false, error: 'Map not found' });
        return;
      }
      
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const token = tokensArray.find(t => t.id === tokenId);
      
      if (!token) {
        ack({ ok: false, error: 'Token not found' });
        return;
      }
      
      // Check permission
      if (!canControlToken(socket.role, token.controlledBy, socket.userId) && socket.role !== 'DM') {
        ack({ ok: false, error: 'Not authorized' });
        return;
      }
      
      await applyDisengageAction(socket.campaignId, tokenId, mapId);
      
      // Broadcast update
      io.to(socket.campaignId).emit('movement:disengage:applied', { tokenId, mapId, userId: socket.userId });
      
      ack({ ok: true });
      logger.debug('movement:disengage', { tokenId, userId: socket.userId });
    } catch (error) {
      logger.error('movement:disengage failed', { err: error });
      ack({ ok: false, error: 'Failed to apply Disengage' });
    }
  });
  
  /**
   * MOVEMENT.BONUS_ACTION - Spend bonus action movement (Cunning Action, Step of the Wind)
   */
  socket.on('movement:bonus_action', async (data: { tokenId: string; mapId: string; feet: number }, ackArg?: unknown) => {
    const ack = ackFrom(ackArg) ?? ((response: AckAnswer) => socket.emit('movement:bonus_action:response', response));
    
    try {
      if (!socket.campaignId) {
        ack({ ok: false, error: 'Not authenticated to a campaign' });
        return;
      }
      
      if (!withinCeiling(socket, 'movement:bonus_action')) return;
      
      const { tokenId, mapId, feet } = data;
      
      if (!tokenId || !mapId || typeof feet !== 'number') {
        ack({ ok: false, error: 'tokenId, mapId, and feet required' });
        return;
      }
      
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        ack({ ok: false, error: 'Map not found' });
        return;
      }
      
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const token = tokensArray.find(t => t.id === tokenId);
      
      if (!token) {
        ack({ ok: false, error: 'Token not found' });
        return;
      }
      
      // Check permission
      if (!canControlToken(socket.role, token.controlledBy, socket.userId) && socket.role !== 'DM') {
        ack({ ok: false, error: 'Not authorized' });
        return;
      }
      
      const success = await spendBonusActionMovement(socket.campaignId, tokenId, mapId, feet);
      
      if (!success) {
        ack({ ok: false, error: 'Not enough bonus action movement available' });
        return;
      }
      
      // Broadcast update
      io.to(socket.campaignId).emit('movement:bonus_action:applied', { tokenId, mapId, feet, userId: socket.userId });
      
      ack({ ok: true });
      logger.debug('movement:bonus_action', { tokenId, feet, userId: socket.userId });
    } catch (error) {
      logger.error('movement:bonus_action failed', { err: error });
      ack({ ok: false, error: 'Failed to spend bonus action movement' });
    }
  });
  
  /**
   * MOVEMENT.GET_BONUS_SPEED - Get available bonus action movement speed
   */
  socket.on('movement:get_bonus_speed', async (data: { tokenId: string; mapId: string }, ackArg?: unknown) => {
    const ack = ackFrom(ackArg) ?? ((response: AckAnswer) => socket.emit('movement:get_bonus_speed:response', response));
    
    try {
      if (!socket.campaignId) {
        ack({ ok: false, error: 'Not authenticated to a campaign' });
        return;
      }
      
      const { tokenId, mapId } = data;
      
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        ack({ ok: false, error: 'Map not found' });
        return;
      }
      
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const token = tokensArray.find(t => t.id === tokenId);
      
      if (!token) {
        ack({ ok: false, error: 'Token not found' });
        return;
      }
      
      const bonusSpeed = getBonusActionMovementSpeed(token);
      
      ack({ ok: true, bonusSpeed });
    } catch (error) {
      logger.error('movement:get_bonus_speed failed', { err: error });
      ack({ ok: false, error: 'Failed to get bonus action speed' });
    }
  });
  
  // Cleanup on disconnect
  socket.on('disconnect', () => {
    for (const [tokenId, dragState] of movementDrags.entries()) {
      if (dragState.mapId) {
        // Return token to start position for this socket's drag
        cancelMovement(tokenId, dragState.mapId, dragState.startPosition, socket.campaignId!, io);
      }
    }
  });
};

// Helper functions

function getMovementSpeedForMode(token: Token, mode: MovementMode): number {
  if (!token.movement) return 30;
  
  switch (mode) {
    case 'fly': return token.movement.flySpeed ?? token.movement.speed;
    case 'swim': return token.movement.swimSpeed ?? Math.floor(token.movement.speed / 2);
    case 'climb': return token.movement.climbSpeed ?? Math.floor(token.movement.speed / 2);
    case 'burrow': return token.movement.burrowSpeed ?? Math.floor(token.movement.speed / 2);
    case 'teleport': return token.movement.speed;
    case 'walk':
    default: return token.movement.speed;
  }
}

async function detectOpportunityAttacks(
  _token: Token,
  _map: { width: number; height: number; gridSize: number; wallSegments?: unknown; lights?: unknown; tokens?: unknown },
  _path: { x: number; y: number }[],
  _campaignId: string
): Promise<OpportunityAttackTrigger[]> {
  // Get all enemy tokens on the map
  // Find enemies that threaten squares along the path
  // This is a simplified version - full implementation would check:
  // - Enemy reach
  // - Enemy has reaction available
  // - Enemy not incapacitated
  // - Line of sight
  // - Path leaves threatened square
  
  const attacks: OpportunityAttackTrigger[] = [];
  
  // For each step in the path, check if we left a threatened square
  // This is complex and requires proper implementation
  
  return attacks;
}

async function emitMovementStart(
  _token: Token,
  _mapId: string,
  _reachableResult: ReachableAreaResult,
  _movedBy: string | null
): Promise<void> {
  // Implementation would broadcast to campaign
}

async function emitMovementFrame(
  _tokenId: string,
  _mapId: string,
  _x: number,
  _y: number,
  _path: { x: number; y: number }[],
  _cost: number,
  _dragging: boolean
): Promise<void> {
  // Implementation would broadcast ghost token position
}

async function emitMovementCommit(
  _token: Token,
  _mapId: string,
  _x: number,
  _y: number,
  _path: { x: number; y: number }[],
  _speedUsed: number,
  _opportunityAttacks: OpportunityAttackTrigger[],
  _movedBy: string | null
): Promise<void> {
  // Implementation would broadcast final position
}

async function cancelMovement(
  _tokenId: string,
  _mapId: string,
  _startPosition: { x: number; y: number },
  _campaignId: string,
  _io: Server
): Promise<void> {
  // Implementation would return token to start and broadcast
}

async function emitMovementModeChange(
  _io: Server,
  _campaignId: string,
  _tokenId: string,
  _mapId: string,
  _movementMode: MovementMode,
  _movedBy: string | null
): Promise<void> {
  // Implementation would broadcast mode change
}

async function emitDMOverride(
  _io: Server,
  _campaignId: string,
  _tokenId: string,
  _mapId: string,
  _type: string,
  _value: number | undefined,
  _position: { x: number; y: number } | undefined,
  _overriddenBy: string | null
): Promise<void> {
  // Implementation would broadcast DM override
}
