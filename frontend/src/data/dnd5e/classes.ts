/**
 * D&D 5e Class Data
 * Complete PHB classes with hit die, proficiencies, features by level, and spellcasting
 */

import type { DnD5eCharacterData } from '@/types/game-systems';

export interface ClassFeature {
  name: string;
  description: string;
  level: number;
  /** Optional: mechanical effect that can be applied programmatically */
  effect?: (sheet: DnD5eCharacterData) => Partial<DnD5eCharacterData>;
}

export interface SavingThrowProficiency {
  ability: keyof DnD5eCharacterData['stats'];
}

export interface SkillProficiencyOption {
  /** Number of skills to choose */
  choose: number;
  /** Skills to choose from */
  from: (keyof DnD5eCharacterData['skills'])[];
}

export interface ClassSpellcasting {
  ability: keyof DnD5eCharacterData['stats'];
  /** Whether the class is a ritual caster */
  ritual?: boolean;
  /** Spell list source */
  spellList: 'wizard' | 'cleric' | 'druid' | 'bard' | 'sorcerer' | 'warlock' | 'paladin' | 'ranger';
  /** Levels at which spell slots are gained */
  slotsPerLevel: Record<number, Record<string, number>>;
}

export interface ClassData {
  id: string;
  name: string;
  description: string;
  /** Hit die type (e.g., 'd8', 'd10', 'd12') */
  hitDie: string;
  /** Primary ability score */
  primaryAbility: (keyof DnD5eCharacterData['stats'])[];
  /** Saving throw proficiencies */
  savingThrows: SavingThrowProficiency[];
  /** Armor proficiencies */
  armorProficiencies: string[];
  /** Weapon proficiencies */
  weaponProficiencies: string[];
  /** Tool proficiencies */
  toolProficiencies: string[];
  /** Skill proficiency choices */
  skillChoices: SkillProficiencyOption[];
  /** Starting equipment options */
  startingEquipment: string[];
  /** Class features by level */
  features: Record<number, ClassFeature[]>;
  /** Spellcasting info (if applicable) */
  spellcasting?: ClassSpellcasting;
  /** Subclasses (archetypes) */
  subclasses?: SubclassData[];
  /** Source book */
  source: 'PHB' | 'EE' | 'SCAG' | 'XGtE' | 'TCE';
}

export interface SubclassData {
  id: string;
  name: string;
  description: string;
  /** Level at which subclass is chosen */
  level: number;
  /** Subclass features by level */
  features: Record<number, ClassFeature[]>;
  /** Spellcasting additions (if any) */
  spellcasting?: Partial<ClassSpellcasting>;
  source: 'PHB' | 'EE' | 'SCAG' | 'XGtE' | 'TCE';
}

// ============================================
// HELPER FUNCTIONS (prefixed with _ to indicate they're available for future use)
// ============================================

/** Create a feature that adds to proficienciesAndLanguages */
const _proficiencyFeature = (prof: string): ClassFeature => ({
  name: prof,
  description: `You gain proficiency with ${prof}.`,
  level: 1,
  effect: (sheet) => {
    const profs = sheet.proficienciesAndLanguages || [];
    if (!profs.includes(prof)) {
      return { proficienciesAndLanguages: [...profs, prof] };
    }
    return {};
  },
});

/** Create a skill choice feature */
const _skillChoiceFeature = (choose: number, from: (keyof DnD5eCharacterData['skills'])[]): ClassFeature => ({
  name: `Skill Proficiency (choose ${choose})`,
  description: `Choose ${choose} skill(s) from: ${from.join(', ')}.`,
  level: 1,
  // Would need UI for selection
});

/** Create a feature that sets spellcasting ability */
const _spellcastingFeature = (ability: keyof DnD5eCharacterData['stats'], _spellList: ClassSpellcasting['spellList']): ClassFeature => ({
  name: 'Spellcasting',
  description: `You can cast spells using ${ability}.`,
  level: 1,
  effect: (sheet) => ({
    spellcasting: {
      ...sheet.spellcasting,
      ability,
      spellSaveDC: 8 + (sheet.stats?.[ability]?.modifier || 0) + (sheet.proficiencyBonus || 2),
      spellAttackBonus: (sheet.stats?.[ability]?.modifier || 0) + (sheet.proficiencyBonus || 2),
    } as DnD5eCharacterData['spellcasting'],
  }),
});

/** Create a feature for hit point calculation */
const hpFeature = (hitDie: string): ClassFeature => ({
  name: `Hit Points (${hitDie})`,
  description: `Hit Dice: 1${hitDie} per ${hitDie === 'd12' ? 'Barbarian' : 'class'} level. Hit Points at 1st Level: ${hitDie === 'd12' ? 12 : hitDie === 'd10' ? 10 : hitDie === 'd8' ? 8 : 6} + Constitution modifier. Hit Points at Higher Levels: 1${hitDie} (or average) + Constitution modifier per level after 1st.`,
  level: 1,
  effect: (sheet) => {
    const hitDieMap: Record<string, number> = { 'd6': 6, 'd8': 8, 'd10': 10, 'd12': 12 };
    const maxHP = (hitDieMap[hitDie] || 8) + (sheet.stats?.constitution?.modifier || 0);
    return { hp: { maximum: maxHP, current: maxHP, temporary: 0 } };
  },
});

// ============================================
// PHB CLASSES
// ============================================

export const DND5E_CLASSES: ClassData[] = [
  {
    id: 'barbarian',
    name: 'Barbarian',
    description: 'A fierce warrior of primitive background who can enter a battle rage.',
    hitDie: 'd12',
    primaryAbility: ['strength'],
    savingThrows: [{ ability: 'strength' }, { ability: 'constitution' }],
    armorProficiencies: ['Light Armor', 'Medium Armor', 'Shields'],
    weaponProficiencies: ['Simple Weapons', 'Martial Weapons'],
    toolProficiencies: [],
    skillChoices: [{
      choose: 2,
      from: ['animalHandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
    }],
    startingEquipment: [
      '(a) a greataxe or (b) any martial melee weapon',
      '(a) two handaxes or (b) any simple weapon',
      'an explorer\'s pack and four javelins',
    ],
    features: {
      1: [
        hpFeature('d12'),
        {
          name: 'Rage',
          description: 'In battle, you fight with primal ferocity. On your turn, you can enter a rage as a bonus action. While raging, you gain the following benefits if you aren\'t wearing heavy armor: advantage on Strength checks and saving throws, +2 bonus to melee weapon damage rolls using Strength, resistance to bludgeoning, piercing, and slashing damage. Rage lasts 1 minute, ends early if you\'re knocked unconscious or if your turn ends and you haven\'t attacked or taken damage since your last turn. You can end it early as a bonus action. You can rage 2 times at 1st level, 3 at 3rd, 4 at 6th, 5 at 12th, and 6 at 17th.',
          level: 1,
        },
        {
          name: 'Unarmored Defense',
          description: 'While you are not wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit.',
          level: 1,
          effect: (sheet) => {
            // This is a calculation, not a static value
            return { armorClass: 10 + (sheet.stats?.dexterity?.modifier || 0) + (sheet.stats?.constitution?.modifier || 0) };
          },
        },
      ],
      2: [
        {
          name: 'Reckless Attack',
          description: 'You can throw aside all concern for defense to attack with fierce desperation. When you make your first attack on your turn, you can decide to attack recklessly. Doing so gives you advantage on melee weapon attack rolls using Strength during this turn, but attack rolls against you have advantage until your next turn.',
          level: 2,
        },
        {
          name: 'Danger Sense',
          description: 'At 2nd level, you gain an uncanny sense of when things nearby aren\'t as they should be, giving you an edge when you dodge away from danger. You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells. To gain this benefit, you can\'t be blinded, deafened, or incapacitated.',
          level: 2,
        },
      ],
      3: [
        {
          name: 'Primal Path',
          description: 'At 3rd level, you choose a path that shapes the nature of your rage. Your choice grants you features at 3rd level and again at 6th, 10th, and 14th levels.',
          level: 3,
          // Subclass choice
        },
      ],
      4: [
        {
          name: 'Ability Score Improvement',
          description: 'When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can\'t increase an ability score above 20 using this feature.',
          level: 4,
        },
      ],
      5: [
        {
          name: 'Extra Attack',
          description: 'Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn.',
          level: 5,
        },
        {
          name: 'Fast Movement',
          description: 'Your speed increases by 10 feet while you aren\'t wearing heavy armor.',
          level: 5,
          effect: (sheet) => ({ speed: (sheet.speed || 30) + 10 }),
        },
      ],
      6: [
        {
          name: 'Path Feature',
          description: 'Your chosen path grants you a feature at 6th level.',
          level: 6,
        },
      ],
      7: [
        {
          name: 'Feral Instinct',
          description: 'By 7th level, your instincts are so honed that you have advantage on initiative rolls. Additionally, if you are surprised at the beginning of combat and aren\'t incapacitated, you can act normally on your first turn, but only if you enter your rage before doing anything else on that turn.',
          level: 7,
        },
      ],
      8: [
        {
          name: 'Ability Score Improvement',
          description: 'When you reach 8th level, you can increase one ability score by 2, or two by 1.',
          level: 8,
        },
      ],
      9: [
        {
          name: 'Brutal Critical (1 die)',
          description: 'You can roll one additional weapon damage die when determining the extra damage for a critical hit with a melee attack.',
          level: 9,
        },
      ],
      10: [
        {
          name: 'Path Feature',
          description: 'Your chosen path grants you a feature at 10th level.',
          level: 10,
        },
      ],
      11: [
        {
          name: 'Relentless Rage',
          description: 'Starting at 11th level, your rage can keep you fighting despite grievous wounds. If you drop to 0 hit points while you\'re raging and don\'t die outright, you can make a DC 10 Constitution saving throw. If you succeed, you drop to 1 hit point instead. Each time you use this feature after the first, the DC increases by 5. When you finish a short or long rest, the DC resets to 10.',
          level: 11,
        },
      ],
      12: [
        {
          name: 'Ability Score Improvement',
          description: 'When you reach 12th level, you can increase one ability score by 2, or two by 1.',
          level: 12,
        },
      ],
      13: [
        {
          name: 'Brutal Critical (2 dice)',
          description: 'You can roll two additional weapon damage dice when determining the extra damage for a critical hit with a melee attack.',
          level: 13,
        },
      ],
      14: [
        {
          name: 'Path Feature',
          description: 'Your chosen path grants you a feature at 14th level.',
          level: 14,
        },
      ],
      15: [
        {
          name: 'Persistent Rage',
          description: 'Starting at 15th level, your rage is so fierce that it ends early only if you fall unconscious or if you choose to end it.',
          level: 15,
        },
      ],
      16: [
        {
          name: 'Ability Score Improvement',
          description: 'When you reach 16th level, you can increase one ability score by 2, or two by 1.',
          level: 16,
        },
      ],
      17: [
        {
          name: 'Brutal Critical (3 dice)',
          description: 'You can roll three additional weapon damage dice when determining the extra damage for a critical hit with a melee attack.',
          level: 17,
        },
      ],
      18: [
        {
          name: 'Indomitable Might',
          description: 'Beginning at 18th level, if your total for a Strength check is less than your Strength score, you can use that score in place of the total.',
          level: 18,
        },
      ],
      19: [
        {
          name: 'Ability Score Improvement',
          description: 'When you reach 19th level, you can increase one ability score by 2, or two by 1.',
          level: 19,
        },
      ],
      20: [
        {
          name: 'Primal Champion',
          description: 'At 20th level, you embody the power of the wilds. Your Strength and Constitution scores increase by 4. Your maximum for those scores is now 24.',
          level: 20,
          effect: (sheet) => {
            const stats = { ...sheet.stats };
            if (stats.strength) stats.strength.score += 4;
            if (stats.constitution) stats.constitution.score += 4;
            return { stats };
          },
        },
      ],
    },
    subclasses: [
      {
        id: 'path_of_the_berserker',
        name: 'Path of the Berserker',
        description: 'For some barbarians, rage is a means to an end—that end being violence. The Path of the Berserker is a path of untrammeled fury, slick with blood.',
        level: 3,
        features: {
          3: [
            {
              name: 'Frenzy',
              description: 'Starting when you choose this path at 3rd level, you can go into a frenzy when you rage. If you do so, for the duration of your rage you can make a single melee weapon attack as a bonus action on each of your turns after this one. When your rage ends, you suffer one level of exhaustion.',
              level: 3,
            },
          ],
          6: [
            {
              name: 'Mindless Rage',
              description: 'Beginning at 6th level, you can\'t be charmed or frightened while raging. If you are charmed or frightened when you enter your rage, the effect is suspended for the duration of the rage.',
              level: 6,
            },
          ],
          10: [
            {
              name: 'Intimidating Presence',
              description: 'Beginning at 10th level, you can use your action to frighten someone with your menacing presence. When you do so, choose one creature that you can see within 30 feet of you. If the creature can see or hear you, it must succeed on a Wisdom saving throw (DC = 8 + your proficiency bonus + your Charisma modifier) or be frightened of you until the end of your next turn.',
              level: 10,
            },
          ],
          14: [
            {
              name: 'Retaliation',
              description: 'Starting at 14th level, when you take damage from a creature that is within 5 feet of you, you can use your reaction to make a melee weapon attack against that creature.',
              level: 14,
            },
          ],
        },
        source: 'PHB',
      },
      {
        id: 'path_of_the_totem_warrior',
        name: 'Path of the Totem Warrior',
        description: 'The Path of the Totem Warrior is a spiritual journey, as the barbarian accepts a spirit animal as guide, protector, and inspiration.',
        level: 3,
        features: {
          3: [
            {
              name: 'Spirit Seeker',
              description: 'Your totem spirit guides you. You gain the ability to cast the beast sense and speak with animals spells as rituals.',
              level: 3,
            },
            {
              name: 'Totem Spirit',
              description: 'You choose a totem spirit and gain its feature. The bear, eagle, and wolf spirits are common choices.',
              level: 3,
              // Would need spirit selection
            },
          ],
          6: [
            {
              name: 'Aspect of the Beast',
              description: 'You gain a magical benefit based on a totem animal of your choice.',
              level: 6,
            },
          ],
          10: [
            {
              name: 'Spirit Walker',
              description: 'You can cast the commune with nature spell as a ritual.',
              level: 10,
            },
          ],
          14: [
            {
              name: 'Totemic Attunement',
              description: 'You gain a feature based on a totem animal of your choice.',
              level: 14,
            },
          ],
        },
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'bard',
    name: 'Bard',
    description: 'An inspiring magician whose power echoes the music of creation.',
    hitDie: 'd8',
    primaryAbility: ['charisma'],
    savingThrows: [{ ability: 'dexterity' }, { ability: 'charisma' }],
    armorProficiencies: ['Light Armor'],
    weaponProficiencies: ['Simple Weapons', 'Hand Crossbow', 'Longsword', 'Rapier', 'Shortsword'],
    toolProficiencies: ['Three musical instruments of your choice'],
    skillChoices: [{
      choose: 3,
      from: Object.keys({}) as (keyof DnD5eCharacterData['skills'])[],
    }],
    startingEquipment: [
      '(a) a rapier or (b) a longsword',
      '(a) a diplomat\'s pack or (b) an entertainer\'s pack',
      '(a) a lute or (b) any other musical instrument',
      'Leather armor and a dagger',
    ],
    features: {
      1: [
        hpFeature('d8'),
        {
          name: 'Spellcasting',
          description: 'You have learned to untangle and reshape the fabric of reality in harmony with your wishes and music. Your spells are part of your vast repertoire, magic that you can tune to different situations.',
          level: 1,
          effect: (sheet) => ({
            spellcasting: {
              ability: 'charisma',
              spellSaveDC: 8 + (sheet.stats?.charisma?.modifier || 0) + (sheet.proficiencyBonus || 2),
              spellAttackBonus: (sheet.stats?.charisma?.modifier || 0) + (sheet.proficiencyBonus || 2),
              spellSaveDCOtherBonus: 0,
              spellAttackOtherBonus: 0,
              cantrips: [],
              slots: { '1': { total: 2, expended: 0 }, '2': { total: 0, expended: 0 }, '3': { total: 0, expended: 0 }, '4': { total: 0, expended: 0 }, '5': { total: 0, expended: 0 }, '6': { total: 0, expended: 0 }, '7': { total: 0, expended: 0 }, '8': { total: 0, expended: 0 }, '9': { total: 0, expended: 0 } },
              spells: [],
            } as DnD5eCharacterData['spellcasting'],
          }),
        },
        {
          name: 'Bardic Inspiration',
          description: 'You can inspire others through stirring words or music. To do so, you use a bonus action on your turn to choose one creature other than yourself within 60 feet of you who can hear you. That creature gains one Bardic Inspiration die, a d6. Once within the next 10 minutes, the creature can roll the die and add the number rolled to one ability check, attack roll, or saving throw it makes. You can use this feature a number of times equal to your Charisma modifier (minimum once). You regain any expended uses when you finish a long rest. Your Bardic Inspiration die changes at certain levels: d6 at 1st, d8 at 5th, d10 at 10th, d12 at 15th.',
          level: 1,
        },
      ],
      2: [
        {
          name: 'Jack of All Trades',
          description: 'Starting at 2nd level, you can add half your proficiency bonus, rounded down, to any ability check you make that doesn\'t already include your proficiency bonus.',
          level: 2,
        },
        {
          name: 'Song of Rest',
          description: 'Beginning at 2nd level, you can use soothing music or oration to help revitalize your wounded allies during a short rest. If you or any friendly creatures who can hear your performance regain hit points at the end of the short rest by spending one or more Hit Dice, each of those creatures regains an extra 1d6 hit points. The extra hit points increase at certain levels: 1d6 at 2nd, 1d8 at 9th, 1d10 at 13th, 1d12 at 17th.',
          level: 2,
        },
      ],
      3: [
        {
          name: 'Bard College',
          description: 'At 3rd level, you delve into the advanced techniques of a bard college of your choice. Your choice grants you features at 3rd level and again at 6th and 14th level.',
          level: 3,
        },
      ],
      4: [
        {
          name: 'Ability Score Improvement',
          description: 'When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score by 2, or two by 1.',
          level: 4,
        },
      ],
      5: [
        {
          name: 'Bardic Inspiration (d8)',
          description: 'Your Bardic Inspiration die becomes a d8.',
          level: 5,
        },
        {
          name: 'Font of Inspiration',
          description: 'You regain all expended uses of Bardic Inspiration when you finish a short or long rest.',
          level: 5,
        },
      ],
      6: [
        {
          name: 'Countercharm',
          description: 'At 6th level, you gain the ability to use musical notes or words of power to disrupt mind-influencing effects. As an action, you can start a performance that lasts until the end of your next turn. During that time, you and any friendly creatures within 30 feet of you have advantage on saving throws against being frightened or charmed. A creature must be able to hear you to gain this benefit.',
          level: 6,
        },
        {
          name: 'College Feature',
          description: 'Your chosen college grants you a feature at 6th level.',
          level: 6,
        },
      ],
      8: [
        {
          name: 'Ability Score Improvement',
          description: 'When you reach 8th level, you can increase one ability score by 2, or two by 1.',
          level: 8,
        },
      ],
      9: [
        {
          name: 'Song of Rest (1d8)',
          description: 'Your Song of Rest die becomes a d8.',
          level: 9,
        },
      ],
      10: [
        {
          name: 'Bardic Inspiration (d10)',
          description: 'Your Bardic Inspiration die becomes a d10.',
          level: 10,
        },
        {
          name: 'Expertise',
          description: 'At 10th level, choose two of your skill proficiencies. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies.',
          level: 10,
        },
        {
          name: 'College Feature',
          description: 'Your chosen college grants you a feature at 10th level.',
          level: 10,
        },
      ],
      12: [
        {
          name: 'Ability Score Improvement',
          description: 'When you reach 12th level, you can increase one ability score by 2, or two by 1.',
          level: 12,
        },
      ],
      13: [
        {
          name: 'Song of Rest (1d10)',
          description: 'Your Song of Rest die becomes a d10.',
          level: 13,
        },
      ],
      14: [
        {
          name: 'College Feature',
          description: 'Your chosen college grants you a feature at 14th level.',
          level: 14,
        },
      ],
      15: [
        {
          name: 'Bardic Inspiration (d12)',
          description: 'Your Bardic Inspiration die becomes a d12.',
          level: 15,
        },
      ],
      16: [
        {
          name: 'Ability Score Improvement',
          description: 'When you reach 16th level, you can increase one ability score by 2, or two by 1.',
          level: 16,
        },
      ],
      17: [
        {
          name: 'Song of Rest (1d12)',
          description: 'Your Song of Rest die becomes a d12.',
          level: 17,
        },
      ],
      18: [
        {
          name: 'Magical Secrets',
          description: 'By 18th level, you have plundered magical knowledge from a wide spectrum of disciplines. Choose two spells from any class, including this one. A spell you choose must be of a level you can cast, as shown on the Bard table, or a cantrip. The chosen spells count as bard spells for you but don\'t count against the number of bard spells you know.',
          level: 18,
        },
      ],
      19: [
        {
          name: 'Ability Score Improvement',
          description: 'When you reach 19th level, you can increase one ability score by 2, or two by 1.',
          level: 19,
        },
      ],
      20: [
        {
          name: 'Superior Inspiration',
          description: 'At 20th level, when you roll initiative and have no uses of Bardic Inspiration left, you regain one use.',
          level: 20,
        },
      ],
    },
    subclasses: [
      {
        id: 'college_of_lore',
        name: 'College of Lore',
        description: 'Bards of the College of Lore know something about most things, collecting bits of knowledge from sources as diverse as scholarly tomes and peasant tales.',
        level: 3,
        features: {
          3: [
            {
              name: 'Bonus Proficiencies',
              description: 'You gain proficiency with three skills of your choice.',
              level: 3,
            },
            {
              name: 'Cutting Words',
              description: 'At 3rd level, you learn how to use your wit to distract, confuse, and otherwise sap the confidence and competence of others. When a creature that you can see within 60 feet of you makes an attack roll, an ability check, or a damage roll, you can use your reaction to expend one of your uses of Bardic Inspiration, rolling a Bardic Inspiration die and subtracting the number rolled from the creature\'s roll.',
              level: 3,
            },
          ],
          6: [
            {
              name: 'Additional Magical Secrets',
              description: 'You learn two spells of your choice from any class. A spell you choose must be of a level you can cast, as shown on the Bard table, or a cantrip.',
              level: 6,
            },
          ],
          14: [
            {
              name: 'Peerless Skill',
              description: 'When you make an ability check, you can expend one use of Bardic Inspiration. Roll a Bardic Inspiration die and add the number rolled to your ability check. You can choose to do so after you roll the die for the ability check, but before the DM tells you whether you succeed or fail.',
              level: 14,
            },
          ],
        },
        source: 'PHB',
      },
      {
        id: 'college_of_valor',
        name: 'College of Valor',
        description: 'Bards of the College of Valor are daring skalds whose tales keep alive the memory of the great heroes of the past, and thereby inspire a new generation of heroes.',
        level: 3,
        features: {
          3: [
            {
              name: 'Combat Inspiration',
              description: 'At 3rd level, you learn to inspire others in battle. A creature that has a Bardic Inspiration die from you can roll that die and add the number rolled to a weapon damage roll it just made. Alternatively, when an attack roll is made against the creature, it can use its reaction to roll the Bardic Inspiration die and add the number rolled to its AC against that attack, after seeing the roll but before knowing whether it hits or misses.',
              level: 3,
            },
          ],
          6: [
            {
              name: 'Extra Attack',
              description: 'You can attack twice, instead of once, whenever you take the Attack action on your turn.',
              level: 6,
            },
          ],
          14: [
            {
              name: 'Battle Magic',
              description: 'At 14th level, you have mastered the art of weaving spellcasting and weapon use into a single harmonious act. When you use your action to cast a bard spell, you can make one weapon attack as a bonus action.',
              level: 14,
            },
          ],
        },
        source: 'PHB',
      },
    ],
    spellcasting: {
      ability: 'charisma',
      spellList: 'bard',
      ritual: true,
      slotsPerLevel: {
        1: { '1': 2 },
        2: { '1': 3 },
        3: { '1': 4, '2': 2 },
        4: { '1': 4, '2': 3 },
        5: { '1': 4, '2': 3, '3': 2 },
        6: { '1': 4, '2': 3, '3': 3 },
        7: { '1': 4, '2': 3, '3': 3, '4': 1 },
        8: { '1': 4, '2': 3, '3': 3, '4': 2 },
        9: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 1 },
        10: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2 },
        11: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1 },
        12: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1 },
        13: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1 },
        14: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1 },
        15: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
        16: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
        17: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1, '9': 1 },
        18: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1, '9': 1 },
        19: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1, '9': 1 },
        20: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1, '9': 1 },
      },
    },
    source: 'PHB',
  },
  // ... Other classes would be defined similarly
  // For brevity, I'll add a few more key classes
];

// ============================================
// CLERIC SPELLCASTING EFFECT
// ============================================

const clericSpellcastingEffect = (sheet: DnD5eCharacterData) => ({
  spellcasting: {
    ability: 'wisdom',
    spellSaveDC: 8 + (sheet.stats?.wisdom?.modifier || 0) + (sheet.proficiencyBonus || 2),
    spellAttackBonus: (sheet.stats?.wisdom?.modifier || 0) + (sheet.proficiencyBonus || 2),
    spellSaveDCOtherBonus: 0,
    spellAttackOtherBonus: 0,
    cantrips: [],
    slots: { '1': { total: 2, expended: 0 }, '2': { total: 0, expended: 0 }, '3': { total: 0, expended: 0 }, '4': { total: 0, expended: 0 }, '5': { total: 0, expended: 0 }, '6': { total: 0, expended: 0 }, '7': { total: 0, expended: 0 }, '8': { total: 0, expended: 0 }, '9': { total: 0, expended: 0 } },
    spells: [],
  } as DnD5eCharacterData['spellcasting'],
});

// ============================================
// CLERIC
// ============================================

const clericClass: ClassData = {
  id: 'cleric',
  name: 'Cleric',
  description: 'A priestly champion who wields divine magic in service of a higher power.',
  hitDie: 'd8',
  primaryAbility: ['wisdom'],
  savingThrows: [{ ability: 'wisdom' }, { ability: 'charisma' }],
  armorProficiencies: ['Light Armor', 'Medium Armor', 'Shields'],
  weaponProficiencies: ['Simple Weapons'],
  toolProficiencies: [],
  skillChoices: [{
    choose: 2,
    from: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
  }],
  startingEquipment: [
    '(a) a mace or (b) a warhammer (if proficient)',
    '(a) scale mail, (b) leather armor, or (c) chain mail (if proficient)',
    '(a) a light crossbow and 20 bolts or (b) any simple weapon',
    '(a) a priest\'s pack or (b) an explorer\'s pack',
    'A shield and a holy symbol',
  ],
  features: {
    1: [
      hpFeature('d8'),
      {
        name: 'Spellcasting',
        description: 'As a conduit for divine power, you can cast cleric spells.',
        level: 1,
        effect: clericSpellcastingEffect,
      },
      {
        name: 'Divine Domain',
        description: 'Choose one domain related to your deity. Your choice grants you domain spells and other features at 1st, 2nd, 6th, 8th, and 17th levels.',
        level: 1,
      },
    ],
    2: [
      {
        name: 'Channel Divinity (1/rest)',
        description: 'You can channel divine energy directly from your deity, using that energy to fuel magical effects. You start with two such effects: Turn Undead and an effect determined by your domain. You can use this feature once. You regain the expended use when you finish a short or long rest.',
        level: 2,
      },
    ],
    3: [
      {
        name: 'Domain Feature',
        description: 'Your domain grants you a feature at 3rd level.',
        level: 3,
      },
    ],
    4: [
      {
        name: 'Ability Score Improvement',
        description: 'When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score by 2, or two by 1.',
        level: 4,
      },
    ],
    5: [
      {
        name: 'Destroy Undead (CR 1/2)',
        description: 'Starting at 5th level, when an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is 1/2 or lower.',
        level: 5,
      },
    ],
    6: [
      {
        name: 'Channel Divinity (2/rest)',
        description: 'You can use your Channel Divinity twice between rests.',
        level: 6,
      },
      {
        name: 'Domain Feature',
        description: 'Your domain grants you a feature at 6th level.',
        level: 6,
      },
    ],
    8: [
      {
        name: 'Ability Score Improvement',
        description: 'When you reach 8th level, you can increase one ability score by 2, or two by 1.',
        level: 8,
      },
      {
        name: 'Divine Strike (1d8)',
        description: 'At 8th level, you gain the ability to infuse your weapon strikes with divine energy. Once on each of your turns when you hit a creature with a weapon attack, you can deal an extra 1d8 radiant damage to the target.',
        level: 8,
      },
    ],
    10: [
      {
        name: 'Divine Intervention',
        description: 'Beginning at 10th level, you can call on your deity to intervene on your behalf when your need is great. As an action, describe the assistance you seek and roll percentile dice. If you roll a number equal to or lower than your cleric level, your deity intervenes. The DM chooses the nature of the intervention; the effect of any cleric spell or cleric domain spell would be appropriate. If your deity intervenes, you can\'t use this feature again for 7 days. Otherwise, you can use it again after you finish a long rest.',
        level: 10,
      },
    ],
    11: [
      {
        name: 'Destroy Undead (CR 1)',
        description: 'Starting at 11th level, when an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is 1 or lower.',
        level: 11,
      },
    ],
    12: [
      {
        name: 'Ability Score Improvement',
        description: 'When you reach 12th level, you can increase one ability score by 2, or two by 1.',
        level: 12,
      },
    ],
    14: [
      {
        name: 'Destroy Undead (CR 2)',
        description: 'Starting at 14th level, when an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is 2 or lower.',
        level: 14,
      },
    ],
    16: [
      {
        name: 'Ability Score Improvement',
        description: 'When you reach 16th level, you can increase one ability score by 2, or two by 1.',
        level: 16,
      },
    ],
    17: [
      {
        name: 'Destroy Undead (CR 3)',
        description: 'Starting at 17th level, when an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is 3 or lower.',
        level: 17,
      },
      {
        name: 'Channel Divinity (3/rest)',
        description: 'You can use your Channel Divinity three times between rests.',
        level: 17,
      },
    ],
    18: [
      {
        name: 'Divine Strike (2d8)',
        description: 'At 18th level, your Divine Strike damage increases to 2d8.',
        level: 18,
      },
    ],
    19: [
      {
        name: 'Ability Score Improvement',
        description: 'When you reach 19th level, you can increase one ability score by 2, or two by 1.',
        level: 19,
      },
    ],
    20: [
      {
        name: 'Divine Intervention Improvement',
        description: 'Your Divine Intervention feature works automatically. When you use it, you don\'t need to roll percentile dice; your deity automatically intervenes. If your deity intervenes, you can\'t use this feature again for 7 days. Otherwise, you can use it again after you finish a long rest.',
        level: 20,
      },
    ],
  },
  subclasses: [
    {
      id: 'life_domain',
      name: 'Life Domain',
      description: 'The Life Domain focuses on the vibrant positive energy—one of the fundamental forces of the universe—that sustains all life.',
      level: 1,
      features: {
        1: [
          {
            name: 'Bonus Proficiency',
            description: 'You gain proficiency with heavy armor.',
            level: 1,
            effect: (sheet) => {
              const profs = sheet.proficienciesAndLanguages || [];
              if (!profs.includes('Heavy Armor')) {
                return { proficienciesAndLanguages: [...profs, 'Heavy Armor'] };
              }
              return {};
            },
          },
          {
            name: 'Disciple of Life',
            description: 'Your healing spells are more effective. Whenever you use a spell of 1st level or higher to restore hit points to a creature, the creature regains additional hit points equal to 2 + the spell\'s level.',
            level: 1,
          },
        ],
        2: [
          {
            name: 'Channel Divinity: Preserve Life',
            description: 'Starting at 2nd level, you can use your Channel Divinity to heal the badly injured. As an action, you present your holy symbol and evoke healing energy that can restore a number of hit points equal to five times your cleric level. Choose any creatures within 30 feet of you, and divide those hit points among them. This feature can restore a creature to no more than half of its hit point maximum. You can\'t use this feature on an undead or a construct.',
            level: 2,
          },
        ],
        6: [
          {
            name: 'Blessed Healer',
            description: 'Beginning at 6th level, when you cast a spell of 1st level or higher that restores hit points to a creature other than you, you regain hit points equal to 2 + the spell\'s level.',
            level: 6,
          },
        ],
        8: [
          {
            name: 'Divine Strike (1d8)',
            description: 'At 8th level, you gain the ability to infuse your weapon strikes with divine energy. Once on each of your turns when you hit a creature with a weapon attack, you can deal an extra 1d8 radiant damage to the target.',
            level: 8,
          },
        ],
        14: [
          {
            name: 'Supreme Healing',
            description: 'When you would normally roll one or more dice to restore hit points with a spell, you instead use the highest number possible for each die.',
            level: 14,
          },
        ],
        17: [
          {
            name: 'Improved Channel Divinity',
            description: 'You can use your Channel Divinity three times between rests.',
            level: 17,
          },
        ],
      },
      source: 'PHB',
    },
    // Other domains: Light, War, Knowledge, Nature, Tempest, Trickery
  ],
  spellcasting: {
    ability: 'wisdom',
    spellList: 'cleric',
    ritual: true,
    slotsPerLevel: {
      1: { '1': 2 },
      2: { '1': 3 },
      3: { '1': 4, '2': 2 },
      4: { '1': 4, '2': 3 },
      5: { '1': 4, '2': 3, '3': 2 },
      6: { '1': 4, '2': 3, '3': 3 },
      7: { '1': 4, '2': 3, '3': 3, '4': 1 },
      8: { '1': 4, '2': 3, '3': 3, '4': 2 },
      9: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 1 },
      10: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2 },
      11: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1 },
      12: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1 },
      13: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1 },
      14: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1 },
      15: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
      16: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
      17: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
      18: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
      19: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
      20: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
    },
  },
  source: 'PHB',
};

// Add cleric and remaining classes to the classes array
DND5E_CLASSES.push(clericClass);

import { ADDITIONAL_5E_CLASSES } from './extraClasses';
for (const cls of ADDITIONAL_5E_CLASSES) {
  if (!DND5E_CLASSES.some(c => c.id === cls.id)) {
    DND5E_CLASSES.push(cls);
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/** Get a class by ID */
export function getClassById(id: string): ClassData | undefined {
  return DND5E_CLASSES.find(c => c.id === id);
}

/** Get a subclass by ID */
export function getSubclassById(classId: string, subclassId: string): SubclassData | undefined {
  const cls = getClassById(classId);
  if (!cls || !cls.subclasses) return undefined;
  return cls.subclasses.find(s => s.id === subclassId);
}

/** Get all classes */
export function getAllClasses(): ClassData[] {
  return DND5E_CLASSES;
}

/** Apply a class's level 1 features to a character sheet */
export function applyClassToSheet(sheet: DnD5eCharacterData, classData: ClassData, subclass?: SubclassData): Partial<DnD5eCharacterData> {
  const updates: Partial<DnD5eCharacterData> = {};

  // Apply hit die (stored in hitDice array)
  updates.hitDice = [{
    class: classData.name,
    total: `1${classData.hitDie}`,
    die: classData.hitDie,
    maximum: 1,
    remaining: 1,
  }];

  // Apply armor proficiencies
  if (classData.armorProficiencies.length > 0) {
    const profs = sheet.proficienciesAndLanguages || [];
    const newProfs = classData.armorProficiencies.filter(p => !profs.includes(p));
    if (newProfs.length > 0) {
      updates.proficienciesAndLanguages = [...profs, ...newProfs];
    }
  }

  // Apply weapon proficiencies
  if (classData.weaponProficiencies.length > 0) {
    const profs = sheet.proficienciesAndLanguages || [];
    const newProfs = classData.weaponProficiencies.filter(p => !profs.includes(p));
    if (newProfs.length > 0) {
      updates.proficienciesAndLanguages = [...(updates.proficienciesAndLanguages || profs), ...newProfs];
    }
  }

  // Apply tool proficiencies
  if (classData.toolProficiencies.length > 0) {
    const profs = sheet.proficienciesAndLanguages || [];
    const newProfs = classData.toolProficiencies.filter(p => !profs.includes(p));
    if (newProfs.length > 0) {
      updates.proficienciesAndLanguages = [...(updates.proficienciesAndLanguages || profs), ...newProfs];
    }
  }

  // Apply saving throw proficiencies
  if (classData.savingThrows.length > 0) {
    const savingThrows = { ...sheet.savingThrows };
    let hasChanges = false;
    for (const st of classData.savingThrows) {
      if (!savingThrows[st.ability].proficient) {
        savingThrows[st.ability] = { ...savingThrows[st.ability], proficient: true };
        hasChanges = true;
      }
    }
    if (hasChanges) {
      updates.savingThrows = savingThrows;
    }
  }

  // Apply spellcasting if the class has it
  if (classData.spellcasting) {
    updates.spellcasting = {
      ability: classData.spellcasting.ability,
      spellSaveDC: 8 + (sheet.stats?.[classData.spellcasting.ability]?.modifier || 0) + (sheet.proficiencyBonus || 2),
      spellAttackBonus: (sheet.stats?.[classData.spellcasting.ability]?.modifier || 0) + (sheet.proficiencyBonus || 2),
      spellSaveDCOtherBonus: 0,
      spellAttackOtherBonus: 0,
      cantrips: [],
      slots: classData.spellcasting.slotsPerLevel[1] || { '1': { total: 0, expended: 0 } },
      spells: [],
    };
  }

  // Apply class features for level 1
  if (classData.features[1]) {
    let featureData = sheet.featuresAndTraits || [];
    for (const feature of classData.features[1]) {
      if (feature.effect) {
        const effect = feature.effect(sheet);
        Object.assign(updates, effect);
      }
      const existingFeature = featureData.find(f => f.name === feature.name);
      if (!existingFeature) {
        featureData = [...featureData, { name: feature.name, description: feature.description }];
      }
    }
    if (featureData.length > 0) {
      updates.featuresAndTraits = featureData;
    }
  }

  // Apply subclass features if provided
  if (subclass && subclass.features[1]) {
    let featureData = updates.featuresAndTraits || sheet.featuresAndTraits || [];
    for (const feature of subclass.features[1]) {
      if (feature.effect) {
        const effect = feature.effect(sheet);
        Object.assign(updates, effect);
      }
      const existingFeature = featureData.find(f => f.name === feature.name);
      if (!existingFeature) {
        featureData = [...featureData, { name: feature.name, description: feature.description }];
      }
    }
    if (featureData.length > 0) {
      updates.featuresAndTraits = featureData;
    }
  }

  return updates;
}

/** Apply class features for a specific level */
export function applyClassLevelFeatures(sheet: DnD5eCharacterData, classData: ClassData, level: number, subclass?: SubclassData): Partial<DnD5eCharacterData> {
  const updates: Partial<DnD5eCharacterData> = {};

  // Update hit dice
  if (updates.hitDice) {
    updates.hitDice = [...updates.hitDice, {
      class: classData.name,
      total: `${level}${classData.hitDie}`,
      die: classData.hitDie,
      maximum: level,
      remaining: level,
    }];
  } else if (sheet.hitDice) {
    updates.hitDice = [...sheet.hitDice, {
      class: classData.name,
      total: `${level}${classData.hitDie}`,
      die: classData.hitDie,
      maximum: level,
      remaining: level,
    }];
  }

  // Apply features for this level
  if (classData.features[level]) {
    let featureData = sheet.featuresAndTraits || [];
    for (const feature of classData.features[level]) {
      if (feature.effect) {
        const effect = feature.effect(sheet);
        Object.assign(updates, effect);
      }
      const existingFeature = featureData.find(f => f.name === feature.name);
      if (!existingFeature) {
        featureData = [...featureData, { name: feature.name, description: feature.description }];
      }
    }
    if (featureData.length > 0) {
      updates.featuresAndTraits = featureData;
    }
  }

  // Apply subclass features for this level
  if (subclass && subclass.features[level]) {
    let featureData = updates.featuresAndTraits || sheet.featuresAndTraits || [];
    for (const feature of subclass.features[level]) {
      if (feature.effect) {
        const effect = feature.effect(sheet);
        Object.assign(updates, effect);
      }
      const existingFeature = featureData.find(f => f.name === feature.name);
      if (!existingFeature) {
        featureData = [...featureData, { name: feature.name, description: feature.description }];
      }
    }
    if (featureData.length > 0) {
      updates.featuresAndTraits = featureData;
    }
  }

  // Update spell slots if spellcasting class
  if (classData.spellcasting && classData.spellcasting.slotsPerLevel[level]) {
    updates.spellcasting = {
      ...sheet.spellcasting,
      slots: { ...sheet.spellcasting?.slots, ...classData.spellcasting.slotsPerLevel[level] },
    };
  }

  return updates;
}