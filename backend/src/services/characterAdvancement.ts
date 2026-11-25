/**
 * Character Advancement Service
 * Handles XP tracking, milestone levels, and level-up workflows for all game systems.
 */

import { CharacterAdvancement, GameSystem, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

interface CharacterData {
  classLevels?: Record<string, number>;
  abilities?: Record<string, number>;
  hitDice?: { total: number; used: number; sides: number };
  advancement?: { proficiencyBonus?: number };
  [key: string]: unknown;
}

// D&D 5e XP thresholds by level (PHB p.15)
const DND5E_XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
];

// PF2e XP per level (always 1000)
const PF2E_XP_PER_LEVEL = 1000;

// Hit die sizes by class (D&D 5e)
const HIT_DICE_BY_CLASS: Record<string, number> = {
  barbarian: 12,
  fighter: 10,
  paladin: 10,
  ranger: 10,
  bard: 8,
  cleric: 8,
  druid: 8,
  monk: 8,
  rogue: 8,
  warlock: 8,
  sorcerer: 6,
  wizard: 6,
};

// Proficiency bonus by level (D&D 5e)
const PROFICIENCY_BONUS_BY_LEVEL = [
  0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6
];

export interface CharacterAdvancementData {
  currentXp: number;
  lifetimeXp: number;
  level: number;
  xpToNextLevel: number;
  progressPercent: number;
  classLevels?: Record<string, number>;
  hitDice?: { total: number; used: number; sides: number };
  proficiencyBonus: number;
  pendingLevelUp: boolean;
  pendingChoices?: {
    newLevel: number;
    hpOptions: { roll: string; average: number };
    classFeatures: string[];
    featOptions: string[];
    asiOptions: string[];
    spellOptions: string[];
  };
  advancementLog: Array<{
    level: number;
    xpAtLevel: number;
    date: string;
    choices?: Record<string, unknown>;
  }>;
}

export interface LevelUpPreview {
  newLevel: number;
  hpOptions: { roll: string; average: number; conMod: number };
  classFeatures: Array<{ name: string; description: string }>;
  featOptions: string[];
  asiOptions: string[];
  spellOptions: string[];
  proficiencyBonus: number;
}

export interface HPOptions {
  roll: string;
  average: number;
  conMod: number;
}

/**
 * Get advancement data for a character
 */
export async function getAdvancement(characterId: string): Promise<CharacterAdvancementData | null> {
  const advancement = await prisma.characterAdvancement.findUnique({
    where: { characterId },
  });

  if (!advancement) return null;

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { gameSystem: true, data: true },
  });

  if (!character) return null;

  const gameSystem = character.gameSystem || GameSystem.DND_5E;
  const currentXp = Number(advancement.currentXp);
  const level = advancement.level;
  const { xpToNextLevel, progressPercent } = calculateXpProgress(currentXp, level, gameSystem);

  // Parse character data for class levels, hit dice
  const charData = character.data as Record<string, unknown> | null;
  const classLevels = (charData?.classLevels as Record<string, number>) || {};
  const hitDice = charData?.hitDice as { total: number; used: number; sides: number } | undefined;

  return {
    currentXp,
    lifetimeXp: Number(advancement.lifetimeXp),
    level,
    xpToNextLevel,
    progressPercent,
    classLevels,
    hitDice,
    proficiencyBonus: calculateProficiencyBonus(level, gameSystem),
    pendingLevelUp: advancement.pendingLevelUp,
    pendingChoices: advancement.pendingChoices as CharacterAdvancementData['pendingChoices'] || undefined,
    advancementLog: (advancement.advancementLog as CharacterAdvancementData['advancementLog']) || [],
  };
}

/**
 * Calculate XP progress to next level
 */
function calculateXpProgress(currentXp: number, level: number, gameSystem: GameSystem): { xpToNextLevel: number; progressPercent: number } {
  let xpForCurrentLevel: number;
  let xpForNextLevel: number;

  switch (gameSystem) {
    case GameSystem.DND_5E: {
      xpForCurrentLevel = DND5E_XP_THRESHOLDS[level - 1] || 0;
      xpForNextLevel = DND5E_XP_THRESHOLDS[level] || DND5E_XP_THRESHOLDS[DND5E_XP_THRESHOLDS.length - 1];
      break;
    }
    case GameSystem.PATHFINDER_2E: {
      xpForCurrentLevel = (level - 1) * PF2E_XP_PER_LEVEL;
      xpForNextLevel = level * PF2E_XP_PER_LEVEL;
      break;
    }
    default: {
      xpForCurrentLevel = DND5E_XP_THRESHOLDS[level - 1] || 0;
      xpForNextLevel = DND5E_XP_THRESHOLDS[level] || DND5E_XP_THRESHOLDS[DND5E_XP_THRESHOLDS.length - 1];
    }
  }

  const xpInCurrentLevel = currentXp - xpForCurrentLevel;
  const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
  const progressPercent = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNext) * 100));

  return {
    xpToNextLevel: Math.max(0, xpForNextLevel - currentXp),
    progressPercent,
  };
}

/**
 * Calculate proficiency bonus for level
 */
function calculateProficiencyBonus(level: number, gameSystem: GameSystem): number {
  if (gameSystem === GameSystem.PATHFINDER_2E) {
    return level; // PF2e uses level as proficiency
  }
  // D&D 5e
  if (level >= 1 && level <= 20) {
    return PROFICIENCY_BONUS_BY_LEVEL[level] || 2;
  }
  return 2;
}

/**
 * Award XP to a character, check for level up
 */
export async function awardXp(
  characterId: string,
  amount: number,
  reason: string,
  _userId: string
): Promise<CharacterAdvancement> {
  const advancement = await prisma.characterAdvancement.findUnique({
    where: { characterId },
  });

  if (!advancement) {
    throw new Error('Character advancement not found');
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { gameSystem: true },
  });

  if (!character) throw new Error('Character not found');

  const gameSystem = character.gameSystem || GameSystem.DND_5E;
  const newCurrentXp = Number(advancement.currentXp) + amount;
  const newLifetimeXp = Number(advancement.lifetimeXp) + amount;

  // Check for level up (D&D 5e only for now)
  let pendingLevelUp = advancement.pendingLevelUp;
  let newLevel = advancement.level;

  if (gameSystem === GameSystem.DND_5E) {
    // Find new level based on XP
    for (let l = advancement.level + 1; l < DND5E_XP_THRESHOLDS.length; l++) {
      if (newCurrentXp >= DND5E_XP_THRESHOLDS[l - 1]) {
        newLevel = l;
      } else {
        break;
      }
    }

    if (newLevel > advancement.level && !advancement.pendingLevelUp) {
      pendingLevelUp = true;
    }
  }

  const updated = await prisma.characterAdvancement.update({
    where: { characterId },
    data: {
      currentXp: newCurrentXp,
      lifetimeXp: newLifetimeXp,
      level: newLevel,
      pendingLevelUp,
      advancementLog: {
        push: {
          type: 'xp_award',
          amount,
          reason,
          date: new Date().toISOString(),
          xpAfter: newCurrentXp,
          levelAfter: newLevel,
        } as Prisma.JsonObject,
      },
    },
  });

  // Log to character's change history
  await prisma.characterAction.create({
    data: {
      characterId,
      name: 'XP Awarded',
      type: 'FEATURE',
      cost: 'FREE',
      data: { amount, reason, newXp: newCurrentXp, newLevel },
      source: 'FEAT',
    },
  });

  return updated;
}

/**
 * Award milestone level (bypass XP)
 */
export async function awardMilestone(
  characterId: string,
  newLevel: number,
  reason: string,
  _userId: string
): Promise<CharacterAdvancement> {
  const advancement = await prisma.characterAdvancement.findUnique({
    where: { characterId },
  });

  if (!advancement) throw new Error('Character advancement not found');

  if (newLevel <= advancement.level) {
    throw new Error('New level must be higher than current level');
  }

  // Check if level up is pending
  let pendingLevelUp = advancement.pendingLevelUp;
  if (newLevel > advancement.level && !advancement.pendingLevelUp) {
    pendingLevelUp = true;
  }

  const updated = await prisma.characterAdvancement.update({
    where: { characterId },
    data: {
      level: newLevel,
      pendingLevelUp,
      milestones: {
        push: {
          name: `Level ${newLevel}`,
          description: reason,
          date: new Date().toISOString(),
          xpAwarded: 0,
        } as Prisma.JsonObject,
      },
      advancementLog: {
        push: {
          type: 'milestone',
          newLevel,
          reason,
          date: new Date().toISOString(),
        } as Prisma.JsonObject,
      },
    },
  });

  await prisma.characterAction.create({
    data: {
      characterId,
      name: 'Milestone Level Up',
      type: 'FEATURE',
      cost: 'FREE',
      data: { newLevel, reason },
      source: 'FEAT',
    },
  });

  return updated;
}

/**
 * Get level-up preview with all choices
 */
export async function getLevelUpPreview(characterId: string): Promise<LevelUpPreview | null> {
  const advancement = await prisma.characterAdvancement.findUnique({
    where: { characterId },
  });

  if (!advancement || !advancement.pendingLevelUp) return null;

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { gameSystem: true, data: true },
  });

  if (!character) return null;

  const gameSystem = character.gameSystem || GameSystem.DND_5E;
  const newLevel = advancement.level + 1;

  const charData = (character.data as CharacterData) || {};
  const classLevels = charData.classLevels || {};

  // Determine primary class (highest level)
  const primaryClass = Object.entries(classLevels).sort((a, b) => b[1] - a[1])[0]?.[0] || 'fighter';

  // Get HP options
  const conMod = Math.floor(((charData.abilities?.con as number) || 10) - 10) / 2;
  const hitDie = HIT_DICE_BY_CLASS[primaryClass] || 8;
  const hpOptions: HPOptions = {
    roll: `1d${hitDie}`,
    average: Math.ceil(hitDie / 2) + 1,
    conMod: Math.floor(conMod),
  };

  // Get class features for new level
  const classFeatures = getClassFeaturesForLevel(primaryClass, newLevel, gameSystem);

  // Get feat options (if ASI level)
  const featOptions = newLevel % 4 === 0 ? getFeatOptions(gameSystem) : [];

  // Get ASI options
  const asiOptions = newLevel % 4 === 0 ? getAbilityScoreOptions() : [];

  // Get spell options
  const spellOptions = getSpellOptionsForLevel(primaryClass, newLevel, gameSystem);

  return {
    newLevel,
    hpOptions,
    classFeatures,
    featOptions,
    asiOptions,
    spellOptions,
    proficiencyBonus: calculateProficiencyBonus(newLevel, gameSystem),
  };
}

/**
 * Confirm level-up choices and apply them
 */
export async function confirmLevelUp(
  characterId: string,
  choices: {
    hpRoll?: number;
    classFeatures?: string[];
    feats?: string[];
    asi?: { ability1?: string; ability2?: string; feat?: string };
    spells?: string[];
  },
  _userId: string
): Promise<CharacterAdvancement> {
  const advancement = await prisma.characterAdvancement.findUnique({
    where: { characterId },
  });

  if (!advancement || !advancement.pendingLevelUp) {
    throw new Error('No pending level up');
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { gameSystem: true, data: true },
  });

  if (!character) throw new Error('Character not found');

  const gameSystem = character.gameSystem || GameSystem.DND_5E;
  const newLevel = advancement.level + 1;
  const charData = character.data as Record<string, unknown> | null;

  // Apply HP
  let hpGain = 0;
  if (choices.hpRoll) {
    hpGain = choices.hpRoll;
  }

  // Build advancement log entry
  const logEntry = {
    type: 'level_up',
    level: newLevel,
    date: new Date().toISOString(),
    choices: {
      hpGain,
      classFeatures: choices.classFeatures || [],
      feats: choices.feats || [],
      asi: choices.asi || {},
      spells: choices.spells || [],
    },
  } as Prisma.JsonObject;

  // Update character data with new level info
  const updatedCharData: CharacterData = { ...charData };
  if (updatedCharData.classLevels) {
    // Increment primary class level
    const primaryClass = Object.entries(updatedCharData.classLevels)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'fighter';
    updatedCharData.classLevels[primaryClass] = (updatedCharData.classLevels[primaryClass] || 1) + 1;
  }
  if (updatedCharData.hitDice) {
    updatedCharData.hitDice.total += 1;
    const primaryClassForHitDice = Object.entries(updatedCharData.classLevels || {})
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'fighter';
    updatedCharData.hitDice.sides = HIT_DICE_BY_CLASS[primaryClassForHitDice] || 8;
  }

  // Update proficiency bonus
  if (updatedCharData.advancement) {
    updatedCharData.advancement.proficiencyBonus = calculateProficiencyBonus(newLevel, gameSystem);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Update advancement
    const updatedAdvancement = await tx.characterAdvancement.update({
      where: { characterId },
      data: {
        level: newLevel,
        pendingLevelUp: false,
        pendingChoices: undefined,
        advancementLog: {
          push: logEntry,
        },
      },
    });

    // Update character data
    await tx.character.update({
      where: { id: characterId },
      data: {
        data: updatedCharData as Prisma.InputJsonValue,
      },
    });

    return updatedAdvancement;
  });

  await prisma.characterAction.create({
    data: {
      characterId,
      name: 'Level Up',
      type: 'FEATURE',
      cost: 'FREE',
      data: { newLevel, choices },
      source: 'FEAT',
    },
  });

  return updated;
}

/**
 * Roll hit points for level up
 */
export async function rollHitPoints(_characterId: string, className: string): Promise<{ roll: number; average: number; sides: number }> {
  const sides = HIT_DICE_BY_CLASS[className.toLowerCase()] || 8;
  const roll = Math.floor(Math.random() * sides) + 1;
  const average = Math.ceil(sides / 2) + 1;

  return { roll, average, sides };
}

/**
 * Get advancement log
 */
export async function getAdvancementLog(characterId: string): Promise<Array<{
  type: string;
  level?: number;
  amount?: number;
  reason?: string;
  date: string;
  xpAfter?: number;
  levelAfter?: number;
  choices?: Record<string, unknown>;
}>> {
  const advancement = await prisma.characterAdvancement.findUnique({
    where: { characterId },
    select: { advancementLog: true },
  });

  return (advancement?.advancementLog as Array<{
    type: string;
    level?: number;
    amount?: number;
    reason?: string;
    date: string;
    xpAfter?: number;
    levelAfter?: number;
    choices?: Record<string, unknown>;
  }>) || [];
}

// Helper functions for level-up options
function getClassFeaturesForLevel(className: string, level: number, _gameSystem: GameSystem): Array<{ name: string; description: string }> {
  // This would ideally query the compendium. For now, return common D&D 5e features.
  const features: Record<string, Record<number, Array<{ name: string; description: string }>>> = {
    fighter: {
      1: [{ name: 'Fighting Style', description: 'Choose a fighting style' }, { name: 'Second Wind', description: 'Regain 1d10+level HP as bonus action' }],
      2: [{ name: 'Action Surge', description: 'Take an additional action on your turn' }],
      3: [{ name: 'Martial Archetype', description: 'Choose a subclass' }],
      4: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      5: [{ name: 'Extra Attack', description: 'Attack twice when you take the Attack action' }],
      6: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      7: [{ name: 'Martial Archetype Feature', description: 'Subclass feature' }],
      8: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      9: [{ name: 'Indomitable', description: 'Reroll a failed saving throw' }],
      10: [{ name: 'Martial Archetype Feature', description: 'Subclass feature' }],
      11: [{ name: 'Extra Attack (2)', description: 'Attack three times' }],
      12: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      13: [{ name: 'Indomitable (2)', description: 'Reroll two failed saving throws' }],
      14: [{ name: 'Martial Archetype Feature', description: 'Subclass feature' }],
      15: [{ name: 'Extra Attack (3)', description: 'Attack four times' }],
      16: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      17: [{ name: 'Action Surge (2)', description: 'Use Action Surge twice' }, { name: 'Indomitable (3)', description: 'Reroll three failed saving throws' }],
      18: [{ name: 'Martial Archetype Feature', description: 'Subclass feature' }],
      19: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      20: [{ name: 'Extra Attack (3)', description: 'Attack four times (already)' }, { name: 'Martial Archetype Feature', description: 'Subclass capstone' }],
    },
    wizard: {
      1: [{ name: 'Spellcasting', description: 'Learn and cast wizard spells' }, { name: 'Arcane Recovery', description: 'Recover spell slots on short rest' }],
      2: [{ name: 'Arcane Tradition', description: 'Choose a subclass' }],
      3: [],
      4: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      5: [],
      6: [{ name: 'Arcane Tradition Feature', description: 'Subclass feature' }],
      7: [],
      8: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      9: [],
      10: [{ name: 'Arcane Tradition Feature', description: 'Subclass feature' }],
      11: [],
      12: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      13: [],
      14: [{ name: 'Arcane Tradition Feature', description: 'Subclass feature' }],
      15: [],
      16: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      17: [],
      18: [{ name: 'Spell Mastery', description: 'Cast two spells at will' }],
      19: [{ name: 'ASI/Feat', description: 'Ability Score Improvement or Feat' }],
      20: [{ name: 'Signature Spells', description: 'Two 3rd-level spells at will' }],
    },
    // Add more classes as needed
  };

  return features[className.toLowerCase()]?.[level] || [];
}

function getFeatOptions(gameSystem: GameSystem): string[] {
  if (gameSystem === GameSystem.PATHFINDER_2E) {
    return ['Ancestry Feat', 'Skill Feat', 'General Feat', 'Class Feat'];
  }
  return [
    'Actor', 'Alert', 'Athlete', 'Charger', 'Crossbow Expert', 'Defensive Duelist',
    'Dual Wielder', 'Dungeon Delver', 'Durable', 'Elemental Adept', 'Grappler',
    'Great Weapon Master', 'Heavily Armored', 'Heavy Armor Master', 'Inspiring Leader',
    'Keen Mind', 'Lightly Armored', 'Linguist', 'Lucky', 'Mage Slayer', 'Magic Initiate',
    'Martial Adept', 'Medium Armor Master', 'Mobile', 'Moderately Armored', 'Mounted Combatant',
    'Observant', 'Polearm Master', 'Resilient', 'Ritual Caster', 'Savage Attacker',
    'Sentinel', 'Sharpshooter', 'Shield Master', 'Skilled', 'Skulker', 'Spell Sniper',
    'Tavern Brawler', 'Tough', 'War Caster', 'Weapon Master'
  ];
}

function getAbilityScoreOptions(): string[] {
  return ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
}

function getSpellOptionsForLevel(_className: string, level: number, gameSystem: GameSystem): string[] {
  // This would query the spell compendium for spells of appropriate level
  const spellLevels = new Set<number>();
  if (gameSystem === GameSystem.DND_5E) {
    // Spell slot progression
    if (level >= 1) spellLevels.add(1);
    if (level >= 3) spellLevels.add(2);
    if (level >= 5) spellLevels.add(3);
    if (level >= 7) spellLevels.add(4);
    if (level >= 9) spellLevels.add(5);
    if (level >= 11) spellLevels.add(6);
    if (level >= 13) spellLevels.add(7);
    if (level >= 15) spellLevels.add(8);
    if (level >= 17) spellLevels.add(9);
  }
  return Array.from(spellLevels).map(l => `Level ${l} spell`);
}
