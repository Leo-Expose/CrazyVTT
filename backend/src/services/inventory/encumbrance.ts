/**
 * Encumbrance Calculator
 * Calculates encumbrance status per game system (D&D 5e, PF2e, CoC, Shadowrun)
 */

import { GameSystem } from '@prisma/client';
import { prisma } from '../../config/database';

export interface EncumbranceStatus {
  currentWeight: number;      // or Bulk
  maxWeight: number;
  pushDragLift: number;
  status: 'NORMAL' | 'ENCUMBERED' | 'HEAVILY_ENCUMBERED';
  speedPenalty: number;
  dexCheckDisadvantage: boolean;
  strDexCheckPenalty: number;
  // PF2e specific
  bulk?: number;
  maxBulk?: number;
  checkPenalty?: number;
  // System info
  system: GameSystem;
}

export interface WeightBreakdown {
  equipped: number;
  carried: number;
  stowed: number;
  containers: { [containerId: string]: number };
  total: number;
}

interface CharacterEncumbranceData {
  stats?: Record<string, { score?: number; modifier?: number }>;
  attributes?: {
    strength?: { score?: number; modifier?: number };
    physical?: {
      body?: { base?: number };
      strength?: { base?: number };
    };
  };
  characteristics?: Record<string, { regular?: number }>;
}

/**
 * Calculate encumbrance for D&D 5e
 * Max weight = Str × 15
 * Push/Drag/Lift = Str × 30
 * Encumbered: weight > Max → speed -10, disadvantage on Dex checks
 * Heavily Encumbered: weight > 2×Max → speed -20, disadvantage on Str/Dex checks
 */
export function calculateDnD5eEncumbrance(
  totalWeight: number,
  strengthScore: number
): EncumbranceStatus {
  const maxWeight = strengthScore * 15;
  const pushDragLift = strengthScore * 30;
  const heavilyEncumberedThreshold = maxWeight * 2;

  let status: EncumbranceStatus['status'] = 'NORMAL';
  let speedPenalty = 0;
  let dexCheckDisadvantage = false;
  let strDexCheckPenalty = 0;

  if (totalWeight > heavilyEncumberedThreshold) {
    status = 'HEAVILY_ENCUMBERED';
    speedPenalty = 20;
    dexCheckDisadvantage = true;
    strDexCheckPenalty = -5; // Disadvantage on Str/Dex checks
  } else if (totalWeight > maxWeight) {
    status = 'ENCUMBERED';
    speedPenalty = 10;
    dexCheckDisadvantage = true;
    strDexCheckPenalty = 0;
  }

  return {
    currentWeight: totalWeight,
    maxWeight,
    pushDragLift,
    status,
    speedPenalty,
    dexCheckDisadvantage,
    strDexCheckPenalty,
    system: GameSystem.DND_5E,
  };
}

/**
 * Calculate encumbrance for Pathfinder 2e
 * Bulk = item Bulk, 10 light = 1 Bulk, 1000 coins = 1 Bulk
 * Max Bulk = 5 + Str mod
 * Encumbered: Bulk > Max → speed -10, check penalty
 * Can't exceed Max + Str mod
 */
export function calculatePF2eEncumbrance(
  totalBulk: number,
  strengthModifier: number
): EncumbranceStatus {
  const maxBulk = 5 + strengthModifier;
  const absoluteMaxBulk = maxBulk + strengthModifier; // Can't exceed this

  let status: EncumbranceStatus['status'] = 'NORMAL';
  let speedPenalty = 0;
  let dexCheckDisadvantage = false;
  let strDexCheckPenalty = 0;
  let checkPenalty = 0;

  if (totalBulk > absoluteMaxBulk) {
    // Over maximum - treat as heavily encumbered
    status = 'HEAVILY_ENCUMBERED';
    speedPenalty = 20;
    dexCheckDisadvantage = true;
    strDexCheckPenalty = -2;
    checkPenalty = -2;
  } else if (totalBulk > maxBulk) {
    status = 'ENCUMBERED';
    speedPenalty = 10;
    dexCheckDisadvantage = false;
    strDexCheckPenalty = 0;
    checkPenalty = -1;
  }

  return {
    currentWeight: totalBulk,
    maxWeight: maxBulk,
    pushDragLift: absoluteMaxBulk,
    status,
    speedPenalty,
    dexCheckDisadvantage,
    strDexCheckPenalty,
    system: GameSystem.PATHFINDER_2E,
    bulk: totalBulk,
    maxBulk,
    checkPenalty,
  };
}

/**
 * Calculate encumbrance for Call of Cthulhu
 * Optional encumbrance rules based on STR
 * Not typically used but we provide a simple calculation
 */
export function calculateCoCEncumbrance(
  totalWeight: number,
  strength: number
): EncumbranceStatus {
  // CoC doesn't have standard encumbrance rules
  // Using a simple STR-based calculation
  const maxWeight = strength * 10; // Approximate
  const pushDragLift = strength * 20;

  let status: EncumbranceStatus['status'] = 'NORMAL';
  let speedPenalty = 0;
  let dexCheckDisadvantage = false;
  let strDexCheckPenalty = 0;

  if (totalWeight > maxWeight * 2) {
    status = 'HEAVILY_ENCUMBERED';
    speedPenalty = 10;
    dexCheckDisadvantage = true;
    strDexCheckPenalty = -1;
  } else if (totalWeight > maxWeight) {
    status = 'ENCUMBERED';
    speedPenalty = 5;
    dexCheckDisadvantage = false;
    strDexCheckPenalty = 0;
  }

  return {
    currentWeight: totalWeight,
    maxWeight,
    pushDragLift,
    status,
    speedPenalty,
    dexCheckDisadvantage,
    strDexCheckPenalty,
    system: GameSystem.CALL_OF_CTHULHU_7E,
  };
}

/**
 * Calculate encumbrance for Shadowrun
 * Based on Body + Strength, with penalties for exceeding limits
 */
export function calculateShadowrunEncumbrance(
  totalWeight: number, // in kg
  body: number,
  strength: number
): EncumbranceStatus {
  // Shadowrun 6e: Carry capacity = (Body + Strength) * 10 kg
  const maxWeight = (body + strength) * 10;
  const pushDragLift = maxWeight * 2;

  let status: EncumbranceStatus['status'] = 'NORMAL';
  let speedPenalty = 0;
  let dexCheckDisadvantage = false;
  let strDexCheckPenalty = 0;

  if (totalWeight > maxWeight * 2) {
    status = 'HEAVILY_ENCUMBERED';
    speedPenalty = 10; // meters per combat turn
    dexCheckDisadvantage = true;
    strDexCheckPenalty = -2;
  } else if (totalWeight > maxWeight) {
    status = 'ENCUMBERED';
    speedPenalty = 5;
    dexCheckDisadvantage = false;
    strDexCheckPenalty = -1;
  }

  return {
    currentWeight: totalWeight,
    maxWeight,
    pushDragLift,
    status,
    speedPenalty,
    dexCheckDisadvantage,
    strDexCheckPenalty,
    system: GameSystem.SHADOWRUN_6E,
  };
}

/**
 * Main function to calculate encumbrance based on game system
 */
export async function calculateEncumbrance(characterId: string): Promise<EncumbranceStatus> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true, gameSystem: true },
  });

  if (!character) {
    throw new Error('Character not found');
  }

  const gameSystem = character.gameSystem || GameSystem.DND_5E;
  const data = character.data as unknown as CharacterEncumbranceData;

  // Get weight breakdown from container service
  const { getWeightBreakdown } = await import('./containers.js');
  const weightBreakdown = await getWeightBreakdown(characterId);

  // Get ability scores based on game system
  let strengthScore = 10;
  let strengthModifier = 0;
  let body = 3;

  if (data.stats) {
    // D&D 5e style
    if (data.stats.strength) {
      strengthScore = data.stats.strength.score || 10;
      strengthModifier = data.stats.strength.modifier || 0;
    }
    // Not currently used but kept for potential future CoC encumbrance rules
    // _constitution = data.stats.constitution.score || 10;
  } else if (data.attributes?.strength) {
    // PF2e style
    if (data.attributes.strength) {
      strengthScore = data.attributes.strength.score || 10;
      strengthModifier = data.attributes.strength.modifier || 0;
    }
    // Not currently used but kept for potential future CoC encumbrance rules
    // _constitution = data.attributes.constitution.score || 10;
  } else if (data.characteristics) {
    // CoC style
    if (data.characteristics.STR) {
      strengthScore = data.characteristics.STR.regular || 10;
    }
    // Not currently used but kept for potential future CoC encumbrance rules
      // _constitution = data.characteristics.CON.regular || 10;
  } else if (data.attributes?.physical) {
    // Shadowrun style
    if (data.attributes.physical.body) {
      body = data.attributes.physical.body.base || 3;
    }
    if (data.attributes.physical.strength) {
      strengthScore = data.attributes.physical.strength.base || 3;
    }
  }

  const totalWeight = weightBreakdown.total;

  switch (gameSystem) {
    case GameSystem.DND_5E:
      return calculateDnD5eEncumbrance(totalWeight, strengthScore);
    case GameSystem.PATHFINDER_2E:
      return calculatePF2eEncumbrance(totalWeight / 10, strengthModifier); // Convert lbs to approximate bulk
    case GameSystem.CALL_OF_CTHULHU_7E:
      return calculateCoCEncumbrance(totalWeight, strengthScore);
    case GameSystem.SHADOWRUN_6E:
      return calculateShadowrunEncumbrance(totalWeight / 2.2, body, strengthScore); // Convert lbs to kg
    default:
      return calculateDnD5eEncumbrance(totalWeight, strengthScore);
  }
}

/**
 * Get encumbrance status with additional details for UI
 */
export async function getEncumbranceStatus(characterId: string) {
  const encumbrance = await calculateEncumbrance(characterId);
  
  return {
    ...encumbrance,
    // Human-readable status
    statusLabel: getStatusLabel(encumbrance.status),
    // Color for UI badge
    statusColor: getStatusColor(encumbrance.status),
    // Percentage of capacity used
    capacityPercent: encumbrance.maxWeight > 0 
      ? Math.min(100, Math.round((encumbrance.currentWeight / encumbrance.maxWeight) * 100))
      : 0,
    // Remaining capacity
    remainingCapacity: Math.max(0, encumbrance.maxWeight - encumbrance.currentWeight),
  };
}

function getStatusLabel(status: EncumbranceStatus['status']): string {
  switch (status) {
    case 'NORMAL': return 'Normal';
    case 'ENCUMBERED': return 'Encumbered';
    case 'HEAVILY_ENCUMBERED': return 'Heavily Encumbered';
  }
}

function getStatusColor(status: EncumbranceStatus['status']): string {
  switch (status) {
    case 'NORMAL': return 'green';
    case 'ENCUMBERED': return 'yellow';
    case 'HEAVILY_ENCUMBERED': return 'red';
  }
}

export default {
  calculateDnD5eEncumbrance,
  calculatePF2eEncumbrance,
  calculateCoCEncumbrance,
  calculateShadowrunEncumbrance,
  calculateEncumbrance,
  getEncumbranceStatus,
};
