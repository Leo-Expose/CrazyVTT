import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { rollDice } from '../utils/dice-parser';

interface DamageRoll {
  targetId: string;
  expression: string;
  type?: string;
  applied?: boolean;
}

interface SaveRoll {
  targetId: string;
  success: boolean;
}

interface ConditionEffect {
  targetId: string;
  name: string;
  duration: string;
  saveEnds: boolean;
  saveDC?: number;
}

interface ResourceCost {
  type: ConsumedResource['type'];
  amount: number;
  details: string;
}

interface ActionData {
  reactionUsed?: boolean;
}

interface TokenCondition {
  name: string;
  duration: string;
  saveEnds: boolean;
  saveDC?: number;
}

interface ActionToken {
  id: string;
  name: string;
  hp?: { current: number; max: number; temp?: number };
  conditions?: TokenCondition[];
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
  statBlock?: {
    level?: number;
    proficiencyBonus?: number;
    spellcastingAbility?: string;
    spellAttackBonus?: number;
    spellSaveDC?: number;
    savingThrows?: Record<string, number>;
  };
}

interface CharacterActionData {
  hp?: { current: number; max: number; temp?: number };
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
  conditions?: TokenCondition[];
  spellSlots?: Record<string, { used: number; max: number }>;
  hitDice?: Array<{ remaining: number }>;
  superiorityDice?: { current: number };
  ki?: { current: number };
  channelDivinity?: { current: number };
  proficiencyBonus?: number;
  stats?: Record<string, { modifier: number }>;
  savingThrows?: Record<string, { proficient: boolean }>;
}

/**
 * Action Apply Engine
 * Applies the results of an action resolution to targets
 */

export interface ApplyResult {
  success: boolean;
  appliedDamage: AppliedDamage[];
  appliedConditions: AppliedCondition[];
  consumedResources: ConsumedResource[];
  deathSavesTriggered: DeathSaveTrigger[];
  messages: string[];
}

export interface AppliedDamage {
  targetId: string;
  targetName: string;
  damage: number;
  damageType: string;
  previousHP: number;
  newHP: number;
  tempHP: number;
  killed: boolean;
  unconscious: boolean;
}

export interface AppliedCondition {
  targetId: string;
  targetName: string;
  condition: string;
  duration: string;
  saveEnds: boolean;
  saveDC?: number;
  added: boolean; // false if already had condition
}

export interface ConsumedResource {
  characterId: string;
  type: 'spell_slot' | 'charge' | 'use' | 'hit_dice' | 'superiority_dice' | 'ki' | 'channel_divinity';
  details: string;
  amount: number;
}

export interface DeathSaveTrigger {
  targetId: string;
  targetName: string;
  reason: 'damage_at_0hp' | 'critical_hit_at_0hp' | 'massive_damage';
  autoFailures: number; // 1 for damage, 2 for crit
}

function jsonForPrisma(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Apply action resolution results
 */
export async function applyActionResolution(
  resolutionId: string,
  dmOverride = false
): Promise<ApplyResult> {
  const resolution = await prisma.actionResolution.findUnique({
    where: { id: resolutionId },
    include: { campaign: true },
  });

  if (!resolution) {
    throw new Error(`Resolution ${resolutionId} not found`);
  }

  if (resolution.status === 'APPLIED' && !dmOverride) {
    throw new Error('Resolution already applied');
  }

  const result: ApplyResult = {
    success: true,
    appliedDamage: [],
    appliedConditions: [],
    consumedResources: [],
    deathSavesTriggered: [],
    messages: [],
  };

  // Get initiator (for resource consumption)
  const initiator = await getInitiator(resolution.initiatorId);

  // Apply damage rolls
  const damageRolls = resolution.damageRolls as DamageRoll[] | null;
  if (damageRolls && Array.isArray(damageRolls)) {
    for (const damageRoll of damageRolls) {
      const applied = await applyDamage(
        damageRoll.targetId,
        damageRoll.expression,
        damageRoll.type || 'untyped',
        damageRoll.applied ?? true,
        initiator?.name || 'Unknown'
      );
      if (applied) {
        result.appliedDamage.push(applied);
        
        // Check for death saves
        if (applied.unconscious || applied.killed) {
          result.deathSavesTriggered.push({
            targetId: damageRoll.targetId,
            targetName: applied.targetName,
            reason: applied.killed ? 'massive_damage' : 'damage_at_0hp',
            autoFailures: applied.killed ? 2 : 1,
          });
        }
      }
    }
  }

  // Apply save roll results (for half damage, conditions)
  const saveRolls = resolution.saveRolls as SaveRoll[] | null;
  const conditions = resolution.conditions as ConditionEffect[] | null;
  if (saveRolls && Array.isArray(saveRolls)) {
    for (const saveRoll of saveRolls) {
      // Save rolls are informational; damage already applied via damageRolls
      // But we might need to apply conditions on failed saves
      if (!saveRoll.success && conditions) {
        const targetConditions = conditions.filter((c) => c.targetId === saveRoll.targetId);
        for (const cond of targetConditions) {
          const applied = await applyCondition(
            saveRoll.targetId,
            cond.name,
            cond.duration,
            cond.saveEnds,
            cond.saveDC
          );
          if (applied) result.appliedConditions.push(applied);
        }
      }
    }
  }

  // Apply conditions directly (for non-save-based effects)
  if (conditions && Array.isArray(conditions)) {
    for (const cond of conditions) {
      // Skip if already handled by save roll
      const alreadyHandled = saveRolls?.some((s) =>
        s.targetId === cond.targetId && !s.success
      );
      if (!alreadyHandled) {
        const applied = await applyCondition(
          cond.targetId,
          cond.name,
          cond.duration,
          cond.saveEnds,
          cond.saveDC
        );
        if (applied) result.appliedConditions.push(applied);
      }
    }
  }

  // Consume resources
  const resources = resolution.resources as ResourceCost[] | null;
  if (resources && Array.isArray(resources)) {
    for (const resource of resources) {
      const consumed = await consumeResource(
        resolution.initiatorId,
        resource.type,
        resource.amount,
        resource.details
      );
      if (consumed) result.consumedResources.push(consumed);
    }
  }

  // Handle reactions (e.g., Shield spell used)
  const actionData = resolution.actionData as ActionData;
  if (actionData.reactionUsed) {
    // Mark reaction as used on the target's turn
    // This would integrate with initiative tracker
  }

  // Update resolution status
  await prisma.actionResolution.update({
    where: { id: resolutionId },
    data: {
      status: 'APPLIED',
      resolvedAt: new Date(),
      dmOverride,
    },
  });

  // Broadcast resolution applied event
  // This would be done via WebSocket in the handler

  return result;
}

/**
 * Apply damage to a token/character
 */
async function applyDamage(
  targetId: string,
  damageExpression: string,
  damageType: string,
  shouldApply: boolean,
  _sourceName: string
): Promise<AppliedDamage | null> {
  // Find the token on the map
  const maps = await prisma.map.findMany({
    where: { tokens: { path: '$[*].id', equals: targetId } },
    select: { id: true, tokens: true },
  });

  if (maps.length === 0) {
    // Try to find as character
    return applyDamageToCharacter(targetId, damageExpression, damageType, shouldApply, _sourceName);
  }

  const map = maps[0];
  const tokens = map.tokens as unknown as ActionToken[];
  const tokenIndex = tokens.findIndex((token) => token.id === targetId);
  
  if (tokenIndex === -1) return null;

  const token = tokens[tokenIndex];
  const previousHP = token.hp?.current ?? 0;
  const maxHP = token.hp?.max ?? 0;
  const tempHP = token.hp?.temp ?? 0;

  if (!shouldApply) {
    return {
      targetId,
      targetName: token.name,
      damage: 0,
      damageType,
      previousHP,
      newHP: previousHP,
      tempHP,
      killed: false,
      unconscious: false,
    };
  }

  // Roll damage
  const damageResult = rollDice(damageExpression);
  let damage = damageResult.total;

  // Apply resistance/immunity/vulnerability (simplified)
  const resistances = token.resistances || [];
  const immunities = token.immunities || [];
  const vulnerabilities = token.vulnerabilities || [];

  if (immunities.includes(damageType)) {
    damage = 0;
  } else if (resistances.includes(damageType)) {
    damage = Math.floor(damage / 2);
  } else if (vulnerabilities.includes(damageType)) {
    damage *= 2;
  }

  // Apply to temp HP first
  let remainingDamage = damage;
  let newTempHP = tempHP;
  
  if (tempHP > 0) {
    if (tempHP >= remainingDamage) {
      newTempHP = tempHP - remainingDamage;
      remainingDamage = 0;
    } else {
      remainingDamage -= tempHP;
      newTempHP = 0;
    }
  }

  // Apply to actual HP
  let newHP = previousHP - remainingDamage;
  let killed = false;
  let unconscious = false;

  if (newHP <= 0) {
    newHP = 0;
    unconscious = true;
    
    // Check for massive damage (instant death)
    if (remainingDamage >= maxHP) {
      killed = true;
    }
  }

  // Update token
  tokens[tokenIndex] = {
    ...token,
    hp: {
      current: newHP,
      max: maxHP,
      temp: newTempHP,
    },
  };

  await prisma.map.update({
    where: { id: map.id },
      data: { tokens: jsonForPrisma(tokens) },
  });

  return {
    targetId,
    targetName: token.name,
    damage,
    damageType,
    previousHP,
    newHP,
    tempHP: newTempHP,
    killed,
    unconscious,
  };
}

/**
 * Apply damage to a character (not on map)
 */
async function applyDamageToCharacter(
  characterId: string,
  damageExpression: string,
  damageType: string,
  shouldApply: boolean,
  _sourceName: string
): Promise<AppliedDamage | null> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true, name: true },
  });

  if (!character) return null;

  const data = character.data as unknown as CharacterActionData;
  const hp = data.hp || { current: 0, max: 0, temp: 0 };
  const previousHP = hp.current;
  const maxHP = hp.max;
  const tempHP = hp.temp ?? 0;

  if (!shouldApply) {
    return {
      targetId: characterId,
      targetName: character.name,
      damage: 0,
      damageType,
      previousHP,
      newHP: previousHP,
      tempHP,
      killed: false,
      unconscious: false,
    };
  }

  const damageResult = rollDice(damageExpression);
  let damage = damageResult.total;

  // Apply resistances/immunities from character data
  const resistances = data.resistances || [];
  const immunities = data.immunities || [];
  const vulnerabilities = data.vulnerabilities || [];

  if (immunities.includes(damageType)) damage = 0;
  else if (resistances.includes(damageType)) damage = Math.floor(damage / 2);
  else if (vulnerabilities.includes(damageType)) damage *= 2;

  // Apply to temp HP first
  let remainingDamage = damage;
  let newTempHP = tempHP;
  
  if (tempHP > 0) {
    if (tempHP >= remainingDamage) {
      newTempHP = tempHP - remainingDamage;
      remainingDamage = 0;
    } else {
      remainingDamage -= tempHP;
      newTempHP = 0;
    }
  }

  let newHP = previousHP - remainingDamage;
  let killed = false;
  let unconscious = false;

  if (newHP <= 0) {
    newHP = 0;
    unconscious = true;
    if (remainingDamage >= maxHP) killed = true;
  }

  // Update character
  const updatedData = { ...data, hp: { current: newHP, max: maxHP, temp: newTempHP } };
  await prisma.character.update({
    where: { id: characterId },
    data: { data: jsonForPrisma(updatedData) },
  });

  return {
    targetId: characterId,
    targetName: character.name,
    damage,
    damageType,
    previousHP,
    newHP,
    tempHP: newTempHP,
    killed,
    unconscious,
  };
}

/**
 * Apply a condition to a target
 */
async function applyCondition(
  targetId: string,
  conditionName: string,
  duration: string,
  saveEnds: boolean,
  saveDC?: number
): Promise<AppliedCondition | null> {
  // Try token first
  const maps = await prisma.map.findMany({
    where: { tokens: { path: '$[*].id', equals: targetId } },
    select: { id: true, tokens: true },
  });

  if (maps.length > 0) {
    return applyConditionToToken(maps[0], targetId, conditionName, duration, saveEnds, saveDC);
  }

  // Try character
  return applyConditionToCharacter(targetId, conditionName, duration, saveEnds, saveDC);
}

async function applyConditionToToken(
  map: { id: string; tokens: Prisma.JsonValue },
  targetId: string,
  conditionName: string,
  duration: string,
  saveEnds: boolean,
  saveDC?: number
): Promise<AppliedCondition | null> {
  const tokens = map.tokens as unknown as ActionToken[];
  const tokenIndex = tokens.findIndex((token) => token.id === targetId);
  
  if (tokenIndex === -1) return null;

  const token = tokens[tokenIndex];
  const conditions = token.conditions || [];
  
  // Check if already has condition
  const existingIndex = conditions.findIndex((condition) => condition.name === conditionName);
  if (existingIndex >= 0) {
    // Update duration if new one is longer
    return {
      targetId,
      targetName: token.name,
      condition: conditionName,
      duration,
      saveEnds,
      saveDC,
      added: false,
    };
  }

  conditions.push({ name: conditionName, duration, saveEnds, saveDC });
  tokens[tokenIndex] = { ...token, conditions };

  await prisma.map.update({
    where: { id: map.id },
      data: { tokens: jsonForPrisma(tokens) },
  });

  return {
    targetId,
    targetName: token.name,
    condition: conditionName,
    duration,
    saveEnds,
    saveDC,
    added: true,
  };
}

async function applyConditionToCharacter(
  characterId: string,
  conditionName: string,
  duration: string,
  saveEnds: boolean,
  saveDC?: number
): Promise<AppliedCondition | null> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true, name: true },
  });

  if (!character) return null;

  const data = character.data as unknown as CharacterActionData;
  const conditions = data.conditions || [];
  
  const existingIndex = conditions.findIndex((condition) => condition.name === conditionName);
  if (existingIndex >= 0) {
    return {
      targetId: characterId,
      targetName: character.name,
      condition: conditionName,
      duration,
      saveEnds,
      saveDC,
      added: false,
    };
  }

  conditions.push({ name: conditionName, duration, saveEnds, saveDC });
  const updatedData = { ...data, conditions };

  await prisma.character.update({
    where: { id: characterId },
    data: { data: jsonForPrisma(updatedData) },
  });

  return {
    targetId: characterId,
    targetName: character.name,
    condition: conditionName,
    duration,
    saveEnds,
    saveDC,
    added: true,
  };
}

/**
 * Consume a resource (spell slot, charge, etc.)
 */
async function consumeResource(
  characterId: string,
  type: ConsumedResource['type'],
  amount: number,
  details: string
): Promise<ConsumedResource | null> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true },
  });

  if (!character) return null;

  const data = character.data as unknown as CharacterActionData;
  let consumed = false;

  switch (type) {
    case 'spell_slot': {
      const slots = data.spellSlots || {};
      const level = parseInt(details.match(/(\d+)/)?.[1] || '1', 10);
      if (slots[level] && slots[level].used < slots[level].max) {
        slots[level].used += amount;
        consumed = true;
      }
      break;
    }
    case 'charge': {
      // For items with charges - would need to find specific item
      consumed = true; // Simplified
      break;
    }
    case 'use': {
      // For features with limited uses
      consumed = true; // Simplified
      break;
    }
    case 'hit_dice': {
      const hitDice = data.hitDice || [];
      // Find first pool with remaining dice
      for (const hd of hitDice) {
        if (hd.remaining > 0) {
          hd.remaining -= amount;
          consumed = true;
          break;
        }
      }
      break;
    }
    case 'superiority_dice': {
      if (data.superiorityDice && data.superiorityDice.current >= amount) {
        data.superiorityDice.current -= amount;
        consumed = true;
      }
      break;
    }
    case 'ki': {
      if (data.ki && data.ki.current >= amount) {
        data.ki.current -= amount;
        consumed = true;
      }
      break;
    }
    case 'channel_divinity': {
      if (data.channelDivinity && data.channelDivinity.current >= amount) {
        data.channelDivinity.current -= amount;
        consumed = true;
      }
      break;
    }
  }

  if (consumed) {
    await prisma.character.update({
      where: { id: characterId },
      data: { data: jsonForPrisma(data) },
    });
  }

  return consumed ? { characterId, type, details, amount } : null;
}

/**
 * Get initiator (character or token)
 */
async function getInitiator(initiatorId: string): Promise<{ id: string; name: string; type: 'character' | 'token' } | null> {
  // Try character first
  const character = await prisma.character.findUnique({
    where: { id: initiatorId },
    select: { id: true, name: true },
  });
  if (character) return { id: character.id, name: character.name, type: 'character' };

  // Try token on map
  const maps = await prisma.map.findMany({
    where: { tokens: { path: '$[*].id', equals: initiatorId } },
    select: { tokens: true },
  });
  if (maps.length > 0) {
    const tokens = maps[0].tokens as unknown as ActionToken[];
    const token = tokens.find((candidate) => candidate.id === initiatorId);
    if (token) return { id: token.id, name: token.name, type: 'token' };
  }

  return null;
}

/**
 * Roll saving throws for multiple targets
 */
export async function rollSavingThrows(
  targets: string[],
  saveDC: number,
  ability: string,
  damageExpression: string,
  halfOnSave: boolean,
  damageType: string
): Promise<Array<{ targetId: string; expression: string; result: number; breakdown: ReturnType<typeof rollDice>; vsDC: number; success: boolean; damage: number; damageType: string }>> {
  const results = [];
  
  for (const targetId of targets) {
    // Get target's save bonus
    const saveBonus = await getSaveBonus(targetId, ability);
    const saveExpr = `1d20${saveBonus >= 0 ? '+' : ''}${saveBonus}`;
    const saveResult = rollDice(saveExpr);
    const success = saveResult.total >= saveDC;
    
    const damageResult = rollDice(damageExpression);
    const damage = success && halfOnSave
      ? Math.floor(damageResult.total / 2)
      : damageResult.total;

    results.push({
      targetId,
      expression: saveExpr,
      result: saveResult.total,
      breakdown: saveResult,
      vsDC: saveDC,
      success,
      damage,
      damageType,
    });
  }

  return results;
}

/**
 * Get a target's saving throw bonus for an ability
 */
async function getSaveBonus(targetId: string, ability: string): Promise<number> {
  // Try character first
  const character = await prisma.character.findUnique({
    where: { id: targetId },
    select: { data: true, gameSystem: true },
  });

  if (character && character.gameSystem === 'DND_5E') {
    const data = character.data as unknown as CharacterActionData;
    const profBonus = data.proficiencyBonus ?? 2;
    const abilityMod = data.stats?.[ability.toLowerCase()]?.modifier ?? 0;
    const isProficient = data.savingThrows?.[ability.toLowerCase()]?.proficient ?? false;
    return abilityMod + (isProficient ? profBonus : 0);
  }

  // Try token
  const maps = await prisma.map.findMany({
    where: { tokens: { path: '$[*].id', equals: targetId } },
    select: { tokens: true },
  });
  if (maps.length > 0) {
    const tokens = maps[0].tokens as unknown as ActionToken[];
    const token = tokens.find((candidate) => candidate.id === targetId);
    if (token?.statBlock?.savingThrows) {
      const save = token.statBlock.savingThrows[ability.toLowerCase()];
      if (save !== undefined) return save;
    }
  }

  // Default: just ability modifier (assume 0)
  return 0;
}
