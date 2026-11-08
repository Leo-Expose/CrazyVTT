import { ActionType } from '@prisma/client';
import { prisma } from '../config/database';
import { rollDice } from '../utils/dice-parser';

/**
 * Action Preview Service
 * Calculates preview data for an action before rolling
 */

export interface AttackPreview {
  attackRoll: {
    expression: string;
    breakdown: string;
    vsAC?: number;
    advantage?: boolean;
    disadvantage?: boolean;
  };
  damageRoll?: {
    expression: string;
    breakdown: string;
    damageType?: string;
  };
  saveDC?: {
    ability: string;
    dc: number;
    halfOnSuccess: boolean;
  };
  area?: {
    shape: string;
    size: number;
    units: 'feet' | 'squares';
  };
  range?: {
    normal: number;
    long?: number;
    units: 'feet';
  };
  resourceCost?: {
    type: 'spell_slot' | 'charge' | 'use' | 'superiority_dice' | 'ki' | 'channel_divinity';
    amount: number;
    details: string;
  }[];
  conditions?: {
    name: string;
    duration: string;
    saveEnds: boolean;
    saveDC?: number;
  }[];
  description: string;
  warnings?: string[];
}

export interface ActionPreviewInput {
  actionId?: string;
  actionType: ActionType;
  actionData: ActionData;
  initiatorId: string;
  targetIds?: string[];
  initiatorStats?: {
    level: number;
    proficiencyBonus: number;
    spellcastingAbility?: string;
    spellAttackBonus?: number;
    spellSaveDC?: number;
  };
}

export interface ActionData {
  name?: string;
  description?: string;
  attackBonus?: number;
  spellAttackBonus?: number;
  spellSaveDC?: number;
  targetAC?: number;
  damageExpression?: string;
  damageType?: string;
  range?: { normal: number; long?: number };
  reach?: number;
  spellLevel?: number;
  saveAbility?: string;
  halfOnSave?: boolean;
  area?: { shape: string; size: number };
  concentration?: boolean;
  usesAmmo?: boolean;
  uses?: number;
  maxUses?: number;
  charges?: { current: number; max: number };
  recharge?: string;
  conditions?: ActionCondition[];
}

export interface ActionCondition {
  name: string;
  duration: string;
  saveEnds: boolean;
  saveDC?: number;
}

/**
 * Generate preview for an action
 */
export async function generateActionPreview(input: ActionPreviewInput): Promise<AttackPreview> {
  const { actionType, actionData, initiatorStats } = input;
  switch (actionType) {
    case 'ATTACK_MELEE':
    case 'ATTACK_RANGED':
      return generateAttackPreview(actionData, initiatorStats, actionType);
    case 'SPELL_ATTACK':
      return generateSpellAttackPreview(actionData, initiatorStats);
    case 'SPELL_SAVE':
      return generateSpellSavePreview(actionData, initiatorStats);
    case 'SPELL_AOE':
      return generateSpellAoEPreview(actionData, initiatorStats);
    case 'FEATURE':
    case 'ITEM_USE':
      return generateFeaturePreview(actionData, actionType);
    default:
      return {
        attackRoll: { expression: '', breakdown: 'Unknown action type' },
        description: 'Unknown action type',
        warnings: ['Cannot generate preview for this action type'],
      };
  }
}

/**
 * Generate preview for weapon attacks
 */
function generateAttackPreview(
  actionData: ActionData,
  _initiatorStats?: ActionPreviewInput['initiatorStats'],
  actionType: ActionType = 'ATTACK_MELEE'
): AttackPreview {
  const warnings: string[] = [];
  const attackBonus = actionData.attackBonus ?? 0;
  const damageExpression = actionData.damageExpression ?? '1d6';
  const damageType = actionData.damageType ?? 'slashing';
  const range = actionData.range;
  const reach = actionData.reach ?? 5;

  // Build attack roll expression
  const attackExpr = `1d20${attackBonus >= 0 ? '+' : ''}${attackBonus}`;
  
  // Parse damage for breakdown
  const damageBreakdown = (() => {
    try {
    const parsed = rollDice(damageExpression);
    return parsed.rolls.map(r => 
      `${r.notation}: [${r.results?.join(', ')}] = ${r.total}`
    ).join(' + ');
    } catch {
      return damageExpression;
    }
  })();

  // Build description
  let description = `Attack: ${attackExpr} vs AC`;
  if (actionType === 'ATTACK_RANGED' && range) {
    description += ` (Range: ${range.normal}/${range.long ?? range.normal} ft.)`;
  } else if (actionType === 'ATTACK_MELEE') {
    description += ` (Reach: ${reach} ft.)`;
  }
  description += `\nDamage: ${damageExpression} ${damageType}`;
  
  if (actionData.conditions?.length) {
    description += '\nOn Hit: ' + actionData.conditions.map((c) => 
      `${c.name} (${c.duration}, ${c.saveEnds ? `DC ${c.saveDC} ends` : 'no save'})`
    ).join(', ');
  }

  const resourceCost = [];
  if (actionData.usesAmmo) {
    resourceCost.push({ type: 'use' as const, amount: 1, details: 'Ammunition' });
  }

  return {
    attackRoll: {
      expression: attackExpr,
      breakdown: `1d20 + ${attackBonus}`,
      vsAC: actionData.targetAC,
    },
    damageRoll: {
      expression: damageExpression,
      breakdown: damageBreakdown,
      damageType,
    },
    range: range ? { normal: range.normal, long: range.long, units: 'feet' } : { normal: reach, units: 'feet' },
    resourceCost,
    conditions: actionData.conditions,
    description,
    warnings,
  };
}

/**
 * Generate preview for spell attacks
 */
function generateSpellAttackPreview(
  actionData: ActionData,
  initiatorStats?: ActionPreviewInput['initiatorStats']
): AttackPreview {
  const warnings: string[] = [];
  const spellAttackBonus = actionData.spellAttackBonus ?? initiatorStats?.spellAttackBonus ?? 0;
  const damageExpression = actionData.damageExpression;
  const damageType = actionData.damageType;
  const range = actionData.range;
  const spellLevel = actionData.spellLevel ?? 1;
  const saveAbility = actionData.saveAbility;
  const area = actionData.area;
  const concentration = actionData.concentration;

  const attackExpr = `1d20${spellAttackBonus >= 0 ? '+' : ''}${spellAttackBonus}`;
  
  let damageBreakdown = '';
  if (damageExpression) {
    try {
      const parsed = rollDice(damageExpression);
      damageBreakdown = parsed.rolls.map(r => 
        `${r.notation}: [${r.results?.join(', ')}] = ${r.total}`
      ).join(' + ');
    } catch {
      damageBreakdown = damageExpression;
    }
  }

  let description = `Spell Attack: ${attackExpr} vs AC`;
  if (range) {
    description += ` (Range: ${range.normal}/${range.long ?? range.normal} ft.)`;
  }
  if (damageExpression) {
    description += `\nDamage: ${damageExpression} ${damageType || ''}`;
  }
  if (saveAbility) {
    description += `\nSave: ${saveAbility} DC ${actionData.spellSaveDC ?? initiatorStats?.spellSaveDC ?? '?'}`;
  }
  if (area) {
    description += `\nArea: ${area.shape} ${area.size} ft.`;
  }
  if (concentration) {
    description += '\nConcentration: Yes';
  }
  description += `\nSpell Level: ${spellLevel}`;

  const resourceCost = [];
  if (spellLevel > 0) {
    resourceCost.push({ 
      type: 'spell_slot' as const, 
      amount: 1, 
      details: `${spellLevel}${getOrdinalSuffix(spellLevel)}-level spell slot` 
    });
  }

  return {
    attackRoll: {
      expression: attackExpr,
      breakdown: `1d20 + ${spellAttackBonus}`,
      vsAC: actionData.targetAC,
    },
    damageRoll: damageExpression ? {
      expression: damageExpression,
      breakdown: damageBreakdown,
      damageType,
    } : undefined,
    saveDC: saveAbility ? {
      ability: saveAbility,
      dc: actionData.spellSaveDC ?? initiatorStats?.spellSaveDC ?? 0,
      halfOnSuccess: actionData.halfOnSave ?? false,
    } : undefined,
    area: area ? { shape: area.shape, size: area.size, units: 'feet' } : undefined,
    range: range ? { normal: range.normal, long: range.long, units: 'feet' } : undefined,
    resourceCost,
    conditions: actionData.conditions,
    description,
    warnings,
  };
}

/**
 * Generate preview for save-based spells
 */
function generateSpellSavePreview(
  actionData: ActionData,
  initiatorStats?: ActionPreviewInput['initiatorStats']
): AttackPreview {
  const warnings: string[] = [];
  const saveAbility = actionData.saveAbility ?? 'Dexterity';
  const spellSaveDC = actionData.spellSaveDC ?? initiatorStats?.spellSaveDC ?? 0;
  const damageExpression = actionData.damageExpression;
  const damageType = actionData.damageType;
  const halfOnSave = actionData.halfOnSave ?? true;
  const area = actionData.area;
  const range = actionData.range;
  const spellLevel = actionData.spellLevel ?? 1;
  const concentration = actionData.concentration;

  let description = `Spell Save: ${saveAbility} DC ${spellSaveDC}`;
  if (range) {
    description += ` (Range: ${range.normal}/${range.long ?? range.normal} ft.)`;
  }
  if (area) {
    description += `\nArea: ${area.shape} ${area.size} ft.`;
  }
  if (damageExpression) {
    description += `\nDamage: ${damageExpression} ${damageType || ''} (${halfOnSave ? 'half on save' : 'full on save'})`;
  }
  if (concentration) {
    description += '\nConcentration: Yes';
  }
  description += `\nSpell Level: ${spellLevel}`;

  let damageBreakdown = '';
  if (damageExpression) {
    try {
      const parsed = rollDice(damageExpression);
      damageBreakdown = parsed.rolls.map(r => 
        `${r.notation}: [${r.results?.join(', ')}] = ${r.total}`
      ).join(' + ');
    } catch {
      damageBreakdown = damageExpression;
    }
  }

  const resourceCost = [];
  if (spellLevel > 0) {
    resourceCost.push({ 
      type: 'spell_slot' as const, 
      amount: 1, 
      details: `${spellLevel}${getOrdinalSuffix(spellLevel)}-level spell slot` 
    });
  }

  return {
    attackRoll: { expression: '', breakdown: 'No attack roll (save-based)' },
    damageRoll: damageExpression ? {
      expression: damageExpression,
      breakdown: damageBreakdown,
      damageType,
    } : undefined,
    saveDC: {
      ability: saveAbility,
      dc: spellSaveDC,
      halfOnSuccess: halfOnSave,
    },
    area: area ? { shape: area.shape, size: area.size, units: 'feet' } : undefined,
    range: range ? { normal: range.normal, long: range.long, units: 'feet' } : undefined,
    resourceCost,
    conditions: actionData.conditions,
    description,
    warnings,
  };
}

/**
 * Generate preview for AoE spells
 */
function generateSpellAoEPreview(
  actionData: ActionData,
  initiatorStats?: ActionPreviewInput['initiatorStats']
): AttackPreview {
  // AoE spells are typically save-based or attack-based
  if (actionData.saveAbility) {
    return generateSpellSavePreview(actionData, initiatorStats);
  }
  return generateSpellAttackPreview(actionData, initiatorStats);
}

/**
 * Generate preview for features and items
 */
function generateFeaturePreview(
  actionData: ActionData,
  actionType: ActionType
): AttackPreview {
  const description = actionData.description ?? `${actionType}: ${actionData.name || 'Unknown'}`;
  
  const resourceCost = [];
  if (actionData.uses && actionData.maxUses) {
    resourceCost.push({ 
      type: 'use' as const, 
      amount: 1, 
      details: `${actionData.uses}/${actionData.maxUses} uses` 
    });
  }
  if (actionData.charges) {
    resourceCost.push({ 
      type: 'charge' as const, 
      amount: 1, 
      details: `${actionData.charges.current}/${actionData.charges.max} charges` 
    });
  }

  return {
    attackRoll: { expression: '', breakdown: 'No attack roll' },
    description,
    resourceCost: resourceCost.length > 0 ? resourceCost : undefined,
    conditions: actionData.conditions,
    warnings: actionData.recharge ? [`Recharges on ${actionData.recharge}`] : undefined,
  };
}

function getOrdinalSuffix(num: number): string {
  if (num >= 11 && num <= 13) return 'th';
  switch (num % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/**
 * Calculate which tokens are in an AoE area
 */
export async function calculateAoETargets(
  mapId: string,
  origin: { x: number; y: number },
  area: { shape: string; size: number; units: 'feet' | 'squares' },
  gridSize: number,
  feetPerSquare: number
): Promise<string[]> {
  // This would integrate with the map token system
  // For now, return empty array - implementation depends on MapCanvas token positions
  const map = await prisma.map.findUnique({
    where: { id: mapId },
    select: { tokens: true, width: true, height: true },
  });

  if (!map) return [];

  const tokens = map.tokens as Array<{ id: string; x: number; y: number; width?: number; height?: number }>;
  const sizeInSquares = area.units === 'feet' 
    ? Math.ceil(area.size / feetPerSquare) 
    : area.size;

  return tokens
    .filter(token => isTokenInArea(token, origin, area.shape, sizeInSquares, gridSize))
    .map(token => token.id);
}

/**
 * Check if a token is within an AoE area
 */
function isTokenInArea(
  token: { id: string; x: number; y: number; width?: number; height?: number },
  origin: { x: number; y: number },
  shape: string,
  size: number,
  gridSize: number
): boolean {
  const tokenCenterX = token.x + (token.width || 1) * gridSize / 2;
  const tokenCenterY = token.y + (token.height || 1) * gridSize / 2;
  const dx = tokenCenterX - origin.x;
  const dy = tokenCenterY - origin.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  switch (shape.toLowerCase()) {
    case 'circle':
    case 'sphere':
      return distance <= size * gridSize;
    case 'cone':
      // Simplified - would need direction
      return distance <= size * gridSize;
    case 'line':
      // Simplified
      return distance <= size * gridSize;
    case 'cube':
    case 'square':
      return Math.abs(dx) <= size * gridSize / 2 && Math.abs(dy) <= size * gridSize / 2;
    default:
      return distance <= size * gridSize;
  }
}
