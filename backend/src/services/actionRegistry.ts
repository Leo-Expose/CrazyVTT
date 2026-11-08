import { Prisma, CharacterAction } from '@prisma/client';
import { prisma } from '../config/database';
import type { DnD5eCharacterData } from '../validators/game-systems';

/**
 * Action Registry Service
 * Builds and caches the list of available actions for a character
 * from their sheet data (attacks, spells, features, items, etc.)
 */

interface CachedActions {
  actions: CharacterAction[];
  version: number;
  updatedAt: Date;
}

const actionCache = new Map<string, CachedActions>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type ActionRecord = Omit<CharacterAction, 'id' | 'characterId' | 'data' | 'recharge'> & {
  data: Prisma.JsonValue;
  recharge?: Prisma.JsonValue | null;
};

/**
 * Build action list from character sheet data
 */
export async function buildActionRegistry(characterId: string): Promise<CharacterAction[]> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, gameSystem: true, data: true },
  });

  if (!character) {
    throw new Error(`Character ${characterId} not found`);
  }

  const actions: ActionRecord[] = [];
  if (character.gameSystem === 'DND_5E') {
    const data = character.data as unknown as RegistryCharacterData;
    actions.push(...extractDnd5eActions(data, 0));
  }
  // Add other game systems as needed

  // Sort by cost priority (ACTION first) then sortOrder
  actions.sort((a, b) => {
    const costPriority: Record<string, number> = {
      ACTION: 0,
      BONUS_ACTION: 1,
      REACTION: 2,
      FREE: 3,
      MOVEMENT: 4,
      LEGENDARY: 5,
      MYTHIC: 6,
      OTHER: 7,
    };
    const costDiff = (costPriority[a.cost] ?? 99) - (costPriority[b.cost] ?? 99);
    if (costDiff !== 0) return costDiff;
    return a.sortOrder - b.sortOrder;
  });

  // Update sortOrder after sorting
  actions.forEach((action, index) => {
    action.sortOrder = index;
  });

  // Delete existing actions and create new ones
  await prisma.characterAction.deleteMany({ where: { characterId } });
  
  const createdActions = await Promise.all(
    actions.map(action => prisma.characterAction.create({
      data: {
        ...action,
        characterId,
        data: action.data === null ? Prisma.JsonNull : action.data as Prisma.InputJsonValue,
        recharge: action.recharge == null ? Prisma.JsonNull : action.recharge as Prisma.InputJsonValue,
      },
    }))
  );

  // Update cache
  actionCache.set(characterId, {
    actions: createdActions,
    version: Date.now(),
    updatedAt: new Date(),
  });

  return createdActions;
}

/**
 * Extract D&D 5e actions from character data
 */
interface LegacyActionSpell {
  name: string;
  prepared?: boolean;
  level?: number;
  castingTime?: string;
  save?: string;
  area?: { shape?: string; size?: number };
  attackType?: string;
  damageRoll?: string;
  damageType?: string;
  range?: string | number;
  duration?: string;
  concentration?: boolean;
  ritual?: boolean;
  components?: string[];
  description?: string;
  higherLevels?: string;
  school?: string;
}

interface LegacyActionFeature {
  name: string;
  description?: string;
  actionCost?: string;
  source?: string;
  recharge?: string;
  rechargeCount?: number;
  uses?: number;
  maxUses?: number;
}

interface LegacyActionItem {
  name: string;
  type?: string;
  useAsBonusAction?: boolean;
  description?: string;
  effect?: unknown;
  quantity?: number;
  charges?: { current: number; max: number; recharge?: string };
  chargeEffect?: unknown;
}

type RegistryCharacterData = Omit<DnD5eCharacterData, 'inventory'> & {
  spells?: LegacyActionSpell[];
  features?: LegacyActionFeature[];
  inventory?: LegacyActionItem[];
  spellcastingAbility?: string;
  proficiencyBonus?: number;
};

function extractDnd5eActions(data: RegistryCharacterData, baseSortOrder: number): ActionRecord[] {
  const actions: ActionRecord[] = [];
  let sortOrder = baseSortOrder;

  // Attacks (from combat section)
  for (const attack of data.attacks ?? []) {
      actions.push({
        name: attack.name,
        type: 'ATTACK_MELEE', // Could be RANGED based on weapon properties
        cost: 'ACTION',
        data: {
          attackBonus: attack.attackBonus,
          damageExpression: attack.damageRoll,
          damageType: attack.damageType ?? extractDamageType(attack.damageRoll),
          range: attack.range ? { normal: attack.range } : undefined,
          reach: 5, // Default reach
        } as Prisma.JsonValue,
        source: 'CLASS_FEATURE', // Could be ITEM, FEAT, etc. based on source
        sourceRef: `attack:${attack.name.toLowerCase().replace(/\s+/g, '-')}`,
        used: false,
        sortOrder: sortOrder++,
      });
  }

  // Spells
  if (data.spells && Array.isArray(data.spells)) {
    for (const spell of data.spells) {
      if (!spell.name || !spell.prepared) continue;
      
      const spellAction = extractSpellAction(spell, data, sortOrder++);
      if (spellAction) actions.push(spellAction);
    }
  }

  // Class Features / Feats / Racial Traits that grant actions
  if (data.features && Array.isArray(data.features)) {
    for (const feature of data.features) {
      if (!feature.name) continue;
      
      const featureActions = extractFeatureActions(feature, data, sortOrder);
      actions.push(...featureActions);
      sortOrder += featureActions.length;
    }
  }

  // Items with uses (potions, scrolls, etc.)
  if (data.inventory && Array.isArray(data.inventory)) {
    for (const item of data.inventory) {
      if (!item.name) continue;
      
      const itemActions = extractItemActions(item, data, sortOrder);
      actions.push(...itemActions);
      sortOrder += itemActions.length;
    }
  }

  // Reactions (Shield, Counterspell, Opportunity Attack, etc.)
  const reactionActions = extractReactionActions(data, sortOrder);
  actions.push(...reactionActions);

  return actions;
}

/**
 * Extract spell action from spell data
 */
function extractSpellAction(spell: LegacyActionSpell, data: RegistryCharacterData, sortOrder: number): ActionRecord | null {
  const spellLevel = spell.level ?? 0;
  
  // Determine spell attack bonus / save DC
  const spellcastingAbility = data.spellcastingAbility || 'intelligence';
  const proficiencyBonus = data.proficiencyBonus ?? 2;
  const abilityKey = spellcastingAbility as keyof typeof data.stats;
  const abilityMod = data.stats?.[abilityKey]?.modifier ?? 0;
  const spellAttackBonus = proficiencyBonus + abilityMod;
  const spellSaveDC = 8 + proficiencyBonus + abilityMod;

  let type: 'SPELL_ATTACK' | 'SPELL_SAVE' | 'SPELL_AOE' = 'SPELL_ATTACK';
  let cost: 'ACTION' | 'BONUS_ACTION' | 'REACTION' = 'ACTION';
  
  if (spell.castingTime?.includes('Bonus Action')) cost = 'BONUS_ACTION';
  if (spell.castingTime?.includes('Reaction')) cost = 'REACTION';

  // Determine type based on spell properties
  if (spell.save) {
    type = spell.area ? 'SPELL_AOE' : 'SPELL_SAVE';
  } else if (spell.attackType === 'ranged' || spell.attackType === 'melee') {
    type = 'SPELL_ATTACK';
  } else if (spell.area) {
    type = 'SPELL_AOE';
  }

  return {
    name: spell.name,
    type,
    cost,
    data: {
      spellLevel,
      spellAttackBonus,
      spellSaveDC,
      saveAbility: spell.save,
      damageExpression: spell.damageRoll,
      damageType: spell.damageType,
      area: spell.area ? { shape: spell.area.shape, size: spell.area.size } : undefined,
      range: spell.range,
      duration: spell.duration,
      concentration: spell.concentration,
      ritual: spell.ritual,
      components: spell.components,
      description: spell.description,
      higherLevels: spell.higherLevels,
      school: spell.school,
    } as Prisma.JsonValue,
    source: 'SPELL',
    sourceRef: `spell:${spell.name.toLowerCase().replace(/\s+/g, '-')}`,
    recharge: spellLevel > 0 ? { type: 'LONG_REST', value: 1 } : undefined,
    used: false,
    sortOrder,
  };
}

/**
 * Extract feature actions (class features, feats, racial traits)
 */
function extractFeatureActions(feature: LegacyActionFeature, _data: RegistryCharacterData, sortOrder: number): ActionRecord[] {
  const actions: ActionRecord[] = [];
  
  // Check if feature has action cost and effect
  if (feature.actionCost && feature.description) {
    let cost: 'ACTION' | 'BONUS_ACTION' | 'REACTION' | 'FREE' = 'ACTION';
    const costLower = feature.actionCost.toLowerCase();
    if (costLower.includes('bonus')) cost = 'BONUS_ACTION';
    else if (costLower.includes('reaction')) cost = 'REACTION';
    else if (costLower.includes('free') || costLower.includes('no action')) cost = 'FREE';

    // Determine source
    let source: 'CLASS' | 'FEAT' | 'RACE' | 'BACKGROUND' | 'CLASS_FEATURE' = 'CLASS_FEATURE';
    if (feature.source?.includes('Feat')) source = 'FEAT';
    else if (feature.source?.includes('Race') || feature.source?.includes('Racial')) source = 'RACE';
    else if (feature.source?.includes('Background')) source = 'BACKGROUND';
    else if (feature.source?.includes('Class')) source = 'CLASS';

    // Check for recharge
    let recharge: { type: string; value: number } | undefined;
    if (feature.recharge) {
      if (feature.recharge.includes('Short Rest')) recharge = { type: 'SHORT_REST', value: feature.rechargeCount || 1 };
      else if (feature.recharge.includes('Long Rest')) recharge = { type: 'LONG_REST', value: feature.rechargeCount || 1 };
      else if (feature.recharge.includes('Turn')) recharge = { type: 'TURN_START', value: feature.rechargeCount || 1 };
    }

    actions.push({
      name: feature.name,
      type: 'FEATURE',
      cost,
      data: {
        description: feature.description,
        recharge: feature.recharge,
        uses: feature.uses,
        maxUses: feature.maxUses,
      } as Prisma.JsonValue,
      source,
      sourceRef: `feature:${feature.name.toLowerCase().replace(/\s+/g, '-')}`,
      recharge,
      used: false,
      sortOrder,
    });
  }

  return actions;
}

/**
 * Extract item actions (potions, scrolls, magic items with charges)
 */
function extractItemActions(item: LegacyActionItem, _data: RegistryCharacterData, sortOrder: number): ActionRecord[] {
  const actions: ActionRecord[] = [];
  
  // Consumables (potions, scrolls)
  if (item.type === 'consumable' || item.type === 'potion' || item.type === 'scroll') {
    let cost: 'ACTION' | 'BONUS_ACTION' = 'ACTION';
    if (item.useAsBonusAction) cost = 'BONUS_ACTION';

    actions.push({
      name: item.name,
      type: 'ITEM_USE',
      cost,
      data: {
        description: item.description,
        effect: item.effect,
        quantity: item.quantity,
      } as Prisma.JsonValue,
      source: 'ITEM',
      sourceRef: `item:${item.name.toLowerCase().replace(/\s+/g, '-')}`,
      recharge: undefined, // Consumables don't recharge
      used: false,
      sortOrder: sortOrder++,
    });
  }

  // Magic items with charges
  if (item.charges && item.charges.max > 0) {
    actions.push({
      name: `${item.name} (${item.charges.current}/${item.charges.max} charges)`,
      type: 'ITEM_USE',
      cost: 'ACTION', // Could vary
      data: {
        description: item.description,
        effect: item.chargeEffect,
        charges: item.charges,
        recharge: item.charges.recharge,
      } as Prisma.JsonValue,
      source: 'MAGIC_ITEM',
      sourceRef: `item:${item.name.toLowerCase().replace(/\s+/g, '-')}`,
      recharge: item.charges.recharge ? parseRecharge(item.charges.recharge) : undefined,
      used: false,
      sortOrder,
    });
  }

  return actions;
}

/**
 * Extract reaction actions
 */
function extractReactionActions(data: RegistryCharacterData, sortOrder: number): ActionRecord[] {
  const actions: ActionRecord[] = [];

  // Shield spell (if known and has spell slots)
  if (data.spells?.some((spell) => spell.name.toLowerCase() === 'shield' && spell.prepared)) {
    actions.push({
      name: 'Shield',
      type: 'REACTION',
      cost: 'REACTION',
      data: {
        description: 'When you are hit by an attack or targeted by Magic Missile, you gain +5 AC until the start of your next turn.',
        spellLevel: 1,
        acBonus: 5,
        triggers: ['hit_by_attack', 'targeted_by_magic_missile'],
      },
      source: 'SPELL',
      sourceRef: 'spell:shield',
      recharge: { type: 'LONG_REST', value: 1 }, // Uses 1st level slot
      used: false,
      sortOrder: sortOrder++,
    });
  }

  // Counterspell
  if (data.spells?.some((spell) => spell.name.toLowerCase() === 'counterspell' && spell.prepared)) {
    actions.push({
      name: 'Counterspell',
      type: 'REACTION',
      cost: 'REACTION',
      data: {
        description: 'Interrupt a creature casting a spell. Make an ability check using your spellcasting ability. DC = 10 + spell level. On success, the spell fails.',
        spellLevel: 3,
        triggers: ['creature_casting_spell'],
      },
      source: 'SPELL',
      sourceRef: 'spell:counterspell',
      recharge: { type: 'LONG_REST', value: 1 },
      used: false,
      sortOrder: sortOrder++,
    });
  }

  // Opportunity Attack (available to all melee combatants)
  actions.push({
    name: 'Opportunity Attack',
    type: 'REACTION',
    cost: 'REACTION',
    data: {
      description: 'Make a melee attack against a hostile creature that moves out of your reach.',
      triggers: ['creature_leaves_reach'],
      usesReaction: true,
    } as Prisma.JsonValue,
    source: 'CLASS_FEATURE',
    sourceRef: 'feature:opportunity-attack',
    used: false,
    sortOrder: sortOrder++,
  });

  // Uncanny Dodge (Rogue)
  if (data.class?.toLowerCase().includes('rogue') && (data.level ?? 0) >= 5) {
    actions.push({
      name: 'Uncanny Dodge',
      type: 'REACTION',
      cost: 'REACTION',
      data: {
        description: 'When an attacker you can see hits you with an attack, you can use your reaction to halve the attack\'s damage against you.',
        triggers: ['hit_by_attack'],
      } as Prisma.JsonValue,
      source: 'CLASS_FEATURE',
      sourceRef: 'feature:uncanny-dodge',
      used: false,
      sortOrder,
    });
  }

  return actions;
}

/**
 * Parse recharge string into structured data
 */
function parseRecharge(rechargeStr: string): { type: string; value: number } | undefined {
  const lower = rechargeStr.toLowerCase();
  if (lower.includes('short rest')) return { type: 'SHORT_REST', value: 1 };
  if (lower.includes('long rest')) return { type: 'LONG_REST', value: 1 };
  if (lower.includes('dawn')) return { type: 'DAWN', value: 1 };
  if (lower.includes('turn')) return { type: 'TURN_START', value: 1 };
  // Parse "1d6" style recharge
  const match = lower.match(/(\d+)d(\d+)/);
  if (match) return { type: 'CUSTOM', value: parseInt(match[1], 10) * parseInt(match[2], 10) };
  return undefined;
}

/**
 * Extract damage type from damage expression
 */
function extractDamageType(expression?: string): string | undefined {
  if (!expression) return undefined;
  // Common damage types in expressions like "1d8+3 fire" or "2d6 fire"
  const types = ['fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant', 'psychic', 'force', 'slashing', 'piercing', 'bludgeoning'];
  for (const type of types) {
    if (expression.toLowerCase().includes(type)) return type;
  }
  return undefined;
}

/**
 * Get cached actions or build fresh
 */
export async function getCharacterActions(characterId: string, forceRefresh = false): Promise<CharacterAction[]> {
  const cached = actionCache.get(characterId);
  
  if (!forceRefresh && cached && Date.now() - cached.version < CACHE_TTL_MS) {
    return cached.actions;
  }

  return buildActionRegistry(characterId);
}

/**
 * Invalidate cache for a character (call when sheet is saved)
 */
export function invalidateActionCache(characterId: string): void {
  actionCache.delete(characterId);
}

/**
 * Mark an action as used/unused
 */
export async function setActionUsed(actionId: string, used: boolean): Promise<void> {
  await prisma.characterAction.update({
    where: { id: actionId },
    data: { used },
  });
  
  // Invalidate cache to refresh used status
  const action = await prisma.characterAction.findUnique({ where: { id: actionId } });
  if (action) invalidateActionCache(action.characterId);
}

/**
 * Reset all used actions for a character (short/long rest)
 */
export async function resetUsedActions(characterId: string, restType: 'SHORT_REST' | 'LONG_REST' | 'TURN_START'): Promise<void> {
  const actions = await prisma.characterAction.findMany({
    where: { characterId, used: true },
  });

  for (const action of actions) {
    const recharge = action.recharge as { type?: string; value?: number } | null;
    if (recharge?.type === restType || (restType === 'LONG_REST' && recharge?.type === 'SHORT_REST')) {
      await prisma.characterAction.update({
        where: { id: action.id },
        data: { used: false },
      });
    }
  }

  invalidateActionCache(characterId);
}
