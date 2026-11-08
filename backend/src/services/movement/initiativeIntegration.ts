// ============================================
// Movement Initiative Integration (Phase 6)
// Handles movement reset on turn start/end
// ============================================

import { readTokens, toJson } from '../../utils/prisma-json';
import { withMapsLocked } from '../../utils/mapTokens';
import type { Token, MovementMode } from '../../types/index.js';

export interface MovementState {
  speed: number;
  flySpeed?: number;
  swimSpeed?: number;
  climbSpeed?: number;
  burrowSpeed?: number;
  movementMode: MovementMode;
  remainingThisTurn: number;
  usedThisTurn: number;
  difficultTerrainMultiplier: number;
  threatenedSquares: number[];
  reach: number;
}

/**
 * Get the base speed for a movement mode
 */
function getBaseSpeedForMode(token: Token, mode: MovementMode): number {
  const movement = token.movement;
  if (!movement) return 30;
  
  switch (mode) {
    case 'fly': return movement.flySpeed ?? movement.speed;
    case 'swim': return movement.swimSpeed ?? Math.floor(movement.speed / 2);
    case 'climb': return movement.climbSpeed ?? Math.floor(movement.speed / 2);
    case 'burrow': return movement.burrowSpeed ?? Math.floor(movement.speed / 2);
    case 'teleport': return movement.speed;
    case 'walk':
    default: return movement.speed;
  }
}

/**
 * Apply condition modifiers to speed
 */
function applyConditionModifiers(token: Token, baseSpeed: number): number {
  let speed = baseSpeed;
  
  const conditions = token.conditions ?? [];
  
  if (conditions.includes('prone')) {
    // Prone: crawling costs extra movement
    speed = Math.floor(speed / 2);
  }
  if (conditions.includes('restrained') || conditions.includes('grappled')) {
    speed = 0;
  }
  if (conditions.includes('paralyzed') || conditions.includes('stunned') || conditions.includes('unconscious')) {
    speed = 0;
  }
  if (conditions.includes('exhaustion')) {
    // Exhaustion levels would reduce speed - simplified
  }
  
  // Encumbrance from Phase 5 would be checked here
  // If heavily encumbered: speed - 10 (min 0)
  // If encumbered: speed - 10
  
  return Math.max(0, speed);
}

/**
 * Reset a token's movement for a new turn
 * @param campaignId - Campaign ID
 * @param tokenId - Token ID
 * @param mapId - Map ID
 * @param isTurnStart - If true, reset to full speed. If false, clear remaining.
 */
export async function resetTokenMovement(
  _campaignId: string,
  tokenId: string,
  mapId: string,
  isTurnStart: boolean = true
): Promise<void> {
  try {
    await withMapsLocked([mapId], async (tx) => {
      const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      const tokens = readTokens(fresh.tokens);
      const index = tokens.findIndex(t => t.id === tokenId);
      
      if (index === -1) return;
      
      const token = tokens[index];
      
      // Initialize movement if not present
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
      
      const movement = token.movement;
      const baseSpeed = getBaseSpeedForMode(token, movement.movementMode);
      const effectiveSpeed = applyConditionModifiers(token, baseSpeed);
      
      if (isTurnStart) {
        // New turn: reset to full speed
        movement.remainingThisTurn = effectiveSpeed;
        movement.usedThisTurn = 0;
      } else {
        // Turn ending: clear remaining
        movement.remainingThisTurn = 0;
      }
      
      // Reset reaction availability (handled by Phase 4 reaction system)
      // This would integrate with the reaction system
      
      tokens[index] = { ...token, movement };
      await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
    });
  } catch (error) {
    console.error('[Movement] Failed to reset token movement:', error);
  }
}

/**
 * Apply Dash action: double speed for this turn
 */
export async function applyDashAction(
  _campaignId: string,
  tokenId: string,
  mapId: string
): Promise<void> {
  await withMapsLocked([mapId], async (tx) => {
    const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const tokens = readTokens(fresh.tokens);
    const index = tokens.findIndex(t => t.id === tokenId);
    
    if (index === -1) return;
    
    const token = tokens[index];
    
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
    
    // Dash doubles the remaining movement
    token.movement.remainingThisTurn *= 2;
    
    tokens[index] = { ...token, movement: token.movement };
    await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
  });
}

/**
 * Apply Disengage action: no opportunity attacks this turn
 */
export async function applyDisengageAction(
  _campaignId: string,
  tokenId: string,
  mapId: string
): Promise<void> {
  // This would be a flag on the token or in combat state
  // For now, we'll store it in metadata
  await withMapsLocked([mapId], async (tx) => {
    const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const tokens = readTokens(fresh.tokens);
    const index = tokens.findIndex(t => t.id === tokenId);
    
    if (index === -1) return;
    
    const token = tokens[index];
    token.metadata = {
      ...token.metadata,
      disengagedThisTurn: true,
    };
    
    tokens[index] = token;
    await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
  });
}

/**
 * Check if token has Disengage active
 */
export function hasDisengage(token: Token): boolean {
  return token.metadata?.disengagedThisTurn === true;
}

/**
 * Clear Disengage flag
 */
export async function clearDisengage(
  _campaignId: string,
  tokenId: string,
  mapId: string
): Promise<void> {
  await withMapsLocked([mapId], async (tx) => {
    const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const tokens = readTokens(fresh.tokens);
    const index = tokens.findIndex(t => t.id === tokenId);
    
    if (index === -1) return;
    
    const token = tokens[index];
    const { disengagedThisTurn, ...restMetadata } = token.metadata ?? {};
    token.metadata = restMetadata;
    
    tokens[index] = token;
    await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
  });
}

/**
 * Get movement speed for bonus action movement (Cunning Action, Step of the Wind, etc.)
 */
export function getBonusActionMovementSpeed(token: Token): number {
  if (!token.movement) return 0;
  
  const baseSpeed = getBaseSpeedForMode(token, token.movement.movementMode);
  const effectiveSpeed = applyConditionModifiers(token, baseSpeed);
  
  // Bonus action movement typically allows full speed
  return effectiveSpeed;
}

/**
 * Spend bonus action movement
 */
export async function spendBonusActionMovement(
  _campaignId: string,
  tokenId: string,
  mapId: string,
  feet: number
): Promise<boolean> {
  try {
    await withMapsLocked([mapId], async (tx) => {
      const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      const tokens = readTokens(fresh.tokens);
      const index = tokens.findIndex(t => t.id === tokenId);
      
      if (index === -1) return;
      
      const token = tokens[index];
      
      if (!token.movement) return;
      
      // Check if we have enough bonus action movement
      const bonusSpeed = getBonusActionMovementSpeed(token);
      const remaining = Math.max(0, bonusSpeed - (token.movement.usedThisTurn - token.movement.speed));
      
      if (feet > remaining) return;
      
      token.movement.usedThisTurn += feet;
      token.movement.remainingThisTurn = Math.max(0, token.movement.remainingThisTurn - feet);
      
      tokens[index] = { ...token, movement: token.movement };
      await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
    });
    return true;
  } catch (error) {
    console.error('[Movement] Failed to spend bonus action movement:', error);
    return false;
  }
}
