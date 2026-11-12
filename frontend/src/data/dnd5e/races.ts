/**
 * D&D 5e Race Data
 * Complete PHB races with ability score increases, features, and traits
 */

import type { DnD5eCharacterData } from '@/types/game-systems';

export interface RaceFeature {
  name: string;
  description: string;
  /** Optional: mechanical effect that can be applied programmatically */
  effect?: (sheet: DnD5eCharacterData) => Partial<DnD5eCharacterData>;
}

export interface RaceData {
  id: string;
  name: string;
  description: string;
  /** Ability score increases: { ability: increase } */
  abilityScoreIncrease: Partial<Record<keyof DnD5eCharacterData['stats'], number>>;
  /** Base speed in feet */
  speed: number;
  /** Size category */
  size: 'Small' | 'Medium';
  /** Languages known */
  languages: string[];
  /** Racial features */
  features: RaceFeature[];
  /** Subraces (if any) */
  subraces?: RaceData[];
  /** Source book */
  source: 'PHB' | 'EE' | 'SCAG' | 'XGtE' | 'TCE';
}

/** Helper to create a feature that adds to proficienciesAndLanguages */
const languageFeature = (language: string): RaceFeature => ({
  name: language,
  description: `You can speak, read, and write ${language}.`,
  effect: (sheet) => {
    const langs = sheet.proficienciesAndLanguages || [];
    if (!langs.includes(language)) {
      return { proficienciesAndLanguages: [...langs, language] };
    }
    return {};
  }
});

/** Helper for skill proficiency */
const skillProficiencyFeature = (skillName: string, skillKey: keyof DnD5eCharacterData['skills']): RaceFeature => ({
  name: `${skillName} Proficiency`,
  description: `You gain proficiency in the ${skillName} skill.`,
  effect: (sheet) => {
    const skills = { ...sheet.skills };
    if (skills[skillKey]) {
      return { skills: { ...skills, [skillKey]: { ...skills[skillKey], proficient: true } } };
    }
    return {};
  }
});

/** Helper for tool proficiency */
const toolProficiencyFeature = (toolName: string): RaceFeature => ({
  name: `${toolName} Proficiency`,
  description: `You gain proficiency with ${toolName}.`,
  effect: (sheet) => {
    const profs = sheet.proficienciesAndLanguages || [];
    if (!profs.includes(toolName)) {
      return { proficienciesAndLanguages: [...profs, toolName] };
    }
    return {};
  }
});

/** Helper for weapon proficiency */
const weaponProficiencyFeature = (weaponName: string): RaceFeature => ({
  name: `${weaponName} Proficiency`,
  description: `You have proficiency with the ${weaponName}.`,
  effect: (sheet) => {
    const profs = sheet.proficienciesAndLanguages || [];
    if (!profs.includes(weaponName)) {
      return { proficienciesAndLanguages: [...profs, weaponName] };
    }
    return {};
  }
});

// ============================================
// PHB RACES
// ============================================

export const DND5E_RACES: RaceData[] = [
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    description: 'Born of dragons, as their name proclaims, the dragonborn walk proudly through a world that greets them with fearful incomprehension.',
    abilityScoreIncrease: { strength: 2, charisma: 1 },
    speed: 30,
    size: 'Medium',
    languages: ['Common', 'Draconic'],
    features: [
      {
        name: 'Draconic Ancestry',
        description: 'You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type, as shown in the table.',
        // Note: Dragon type selection would be a sub-choice
      },
      {
        name: 'Breath Weapon',
        description: 'You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. After you use your breath weapon, you can\'t use it again until you complete a short or long rest.',
      },
      {
        name: 'Damage Resistance',
        description: 'You have resistance to the damage type associated with your draconic ancestry.',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'dwarf',
    name: 'Dwarf',
    description: 'Kingdoms rich in ancient grandeur, halls carved into the roots of mountains, the echoing of picks and hammers in deep mines and blazing forges, a commitment to clan and tradition, and a burning hatred of goblins and orcs—these common threads unite all dwarves.',
    abilityScoreIncrease: { constitution: 2 },
    speed: 25,
    size: 'Medium',
    languages: ['Common', 'Dwarvish'],
    features: [
      {
        name: 'Darkvision',
        description: 'Accustomed to life underground, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can\'t discern color in darkness, only shades of gray.',
      },
      {
        name: 'Dwarven Resilience',
        description: 'You have advantage on saving throws against poison, and you have resistance against poison damage.',
      },
      {
        name: 'Dwarven Combat Training',
        description: 'You have proficiency with the battleaxe, handaxe, light hammer, and warhammer.',
        effect: (sheet) => {
          const profs = sheet.proficienciesAndLanguages || [];
          const weapons = ['Battleaxe', 'Handaxe', 'Light Hammer', 'Warhammer'];
          const newProfs = [...profs, ...weapons.filter(w => !profs.includes(w))];
          return { proficienciesAndLanguages: newProfs };
        }
      },
      {
        name: 'Tool Proficiency',
        description: 'You gain proficiency with the artisan\'s tools of your choice: smith\'s tools, brewer\'s supplies, or mason\'s tools.',
        // Would need sub-choice for specific tool
      },
      {
        name: 'Stonecunning',
        description: 'Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient in the History skill and add double your proficiency bonus to the check, instead of your normal proficiency bonus.',
      },
    ],
    subraces: [
      {
        id: 'hill_dwarf',
        name: 'Hill Dwarf',
        description: 'As a hill dwarf, you have keen senses, deep intuition, and remarkable resilience.',
        abilityScoreIncrease: { wisdom: 1 },
        speed: 25,
        size: 'Medium',
        languages: ['Common', 'Dwarvish'],
        features: [
          {
            name: 'Dwarven Toughness',
            description: 'Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.',
            effect: (sheet) => {
              const hp = { ...sheet.hp };
              hp.maximum = (hp.maximum || 0) + 1;
              return { hp };
            }
          },
        ],
        source: 'PHB',
      },
      {
        id: 'mountain_dwarf',
        name: 'Mountain Dwarf',
        description: 'As a mountain dwarf, you\'re strong and hardy, accustomed to a difficult life in rugged terrain.',
        abilityScoreIncrease: { strength: 2 },
        speed: 25,
        size: 'Medium',
        languages: ['Common', 'Dwarvish'],
        features: [
          {
            name: 'Dwarven Armor Training',
            description: 'You have proficiency with light and medium armor.',
            effect: (sheet) => {
              const profs = sheet.proficienciesAndLanguages || [];
              const armor = ['Light Armor', 'Medium Armor'];
              const newProfs = [...profs, ...armor.filter(a => !profs.includes(a))];
              return { proficienciesAndLanguages: newProfs };
            }
          },
        ],
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'elf',
    name: 'Elf',
    description: 'Elves are a magical people of otherworldly grace, living in the world but not entirely part of it. They live in places of ethereal beauty, in the midst of ancient forests or in silvery spires glittering with faerie light.',
    abilityScoreIncrease: { dexterity: 2 },
    speed: 30,
    size: 'Medium',
    languages: ['Common', 'Elvish'],
    features: [
      {
        name: 'Darkvision',
        description: 'Accustomed to twilit forests and the night sky, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can\'t discern color in darkness, only shades of gray.',
      },
      {
        name: 'Keen Senses',
        description: 'You have proficiency in the Perception skill.',
        effect: (sheet) => ({
          skills: { ...sheet.skills, perception: { ...sheet.skills?.perception, proficient: true } }
        }),
      },
      {
        name: 'Fey Ancestry',
        description: 'You have advantage on saving throws against being charmed, and magic can\'t put you to sleep.',
      },
      {
        name: 'Trance',
        description: 'Elves don\'t need to sleep. Instead, they meditate deeply, remaining semiconscious, for 4 hours a day. After resting in this way, you gain the same benefit that a human does from 8 hours of sleep.',
      },
    ],
    subraces: [
      {
        id: 'high_elf',
        name: 'High Elf',
        description: 'As a high elf, you have a keen mind and a mastery of at least the basics of magic.',
        abilityScoreIncrease: { intelligence: 1 },
        speed: 30,
        size: 'Medium',
        languages: ['Common', 'Elvish'],
        features: [
          {
            name: 'Elf Weapon Training',
            description: 'You have proficiency with the longsword, shortsword, shortbow, and longbow.',
            effect: (sheet) => {
              const profs = sheet.proficienciesAndLanguages || [];
              const weapons = ['Longsword', 'Shortsword', 'Shortbow', 'Longbow'];
              const newProfs = [...profs, ...weapons.filter(w => !profs.includes(w))];
              return { proficienciesAndLanguages: newProfs };
            }
          },
          {
            name: 'Cantrip',
            description: 'You know one cantrip of your choice from the wizard spell list. Intelligence is your spellcasting ability for it.',
            // Would need cantrip selection
          },
          {
            name: 'Extra Language',
            description: 'You can speak, read, and write one extra language of your choice.',
            // Would need language selection
          },
        ],
        source: 'PHB',
      },
      {
        id: 'wood_elf',
        name: 'Wood Elf',
        description: 'As a wood elf, you have keen senses and intuition, and your fleet feet carry you quickly and stealthily through your native forests.',
        abilityScoreIncrease: { wisdom: 1 },
        speed: 35,
        size: 'Medium',
        languages: ['Common', 'Elvish'],
        features: [
          {
            name: 'Elf Weapon Training',
            description: 'You have proficiency with the longsword, shortsword, shortbow, and longbow.',
            effect: (sheet) => {
              const profs = sheet.proficienciesAndLanguages || [];
              const weapons = ['Longsword', 'Shortsword', 'Shortbow', 'Longbow'];
              const newProfs = [...profs, ...weapons.filter(w => !profs.includes(w))];
              return { proficienciesAndLanguages: newProfs };
            }
          },
          {
            name: 'Fleet of Foot',
            description: 'Your base walking speed increases to 35 feet.',
            effect: (sheet) => ({ speed: 35 }),
          },
          {
            name: 'Mask of the Wild',
            description: 'You can attempt to hide even when you are only lightly obscured by foliage, heavy rain, falling snow, mist, and other natural phenomena.',
          },
        ],
        source: 'PHB',
      },
      {
        id: 'dark_elf',
        name: 'Drow (Dark Elf)',
        description: 'Descended from an earlier subrace of dark-skinned elves, the drow were banished from the surface world for following the goddess Lolth down the path to evil and corruption.',
        abilityScoreIncrease: { charisma: 1 },
        speed: 30,
        size: 'Medium',
        languages: ['Common', 'Elvish'],
        features: [
          {
            name: 'Superior Darkvision',
            description: 'Your darkvision has a radius of 120 feet.',
          },
          {
            name: 'Sunlight Sensitivity',
            description: 'You have disadvantage on attack rolls and on Wisdom (Perception) checks when you, the target of your attack, or whatever you are trying to perceive is in direct sunlight.',
          },
          {
            name: 'Drow Magic',
            description: 'You know the dancing lights cantrip. When you reach 3rd level, you can cast the faerie fire spell once per day. When you reach 5th level, you can also cast the darkness spell once per day. Charisma is your spellcasting ability for these spells.',
          },
          {
            name: 'Drow Weapon Training',
            description: 'You have proficiency with rapiers, shortswords, and hand crossbows.',
            effect: (sheet) => {
              const profs = sheet.proficienciesAndLanguages || [];
              const weapons = ['Rapier', 'Shortsword', 'Hand Crossbow'];
              const newProfs = [...profs, ...weapons.filter(w => !profs.includes(w))];
              return { proficienciesAndLanguages: newProfs };
            }
          },
        ],
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'gnome',
    name: 'Gnome',
    description: 'A constant hum of busy activity pervades the warrens and neighborhoods where gnomes form their close-knit communities. Louder sounds punctuate the hum: a crunch of grinding gears here, a minor explosion there, a yelp of surprise or triumph.',
    abilityScoreIncrease: { intelligence: 2 },
    speed: 25,
    size: 'Small',
    languages: ['Common', 'Gnomish'],
    features: [
      {
        name: 'Darkvision',
        description: 'Accustomed to life underground, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can\'t discern color in darkness, only shades of gray.',
      },
      {
        name: 'Gnome Cunning',
        description: 'You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic.',
      },
    ],
    subraces: [
      {
        id: 'forest_gnome',
        name: 'Forest Gnome',
        description: 'As a forest gnome, you have a natural knack for illusion and inherent quickness and stealth.',
        abilityScoreIncrease: { dexterity: 1 },
        speed: 25,
        size: 'Small',
        languages: ['Common', 'Gnomish'],
        features: [
          {
            name: 'Natural Illusionist',
            description: 'You know the minor illusion cantrip. Intelligence is your spellcasting ability for it.',
          },
          {
            name: 'Speak with Small Beasts',
            description: 'Through sounds and gestures, you can communicate simple ideas with Small or smaller beasts.',
          },
        ],
        source: 'PHB',
      },
      {
        id: 'rock_gnome',
        name: 'Rock Gnome',
        description: 'As a rock gnome, you have a natural inventiveness and hardiness beyond that of other gnomes.',
        abilityScoreIncrease: { constitution: 1 },
        speed: 25,
        size: 'Small',
        languages: ['Common', 'Gnomish'],
        features: [
          {
            name: 'Artificer\'s Lore',
            description: 'Whenever you make an Intelligence (History) check related to magic items, alchemical objects, or technological devices, you can add twice your proficiency bonus, instead of any proficiency bonus you normally apply.',
          },
          {
            name: 'Tinker',
            description: 'You have proficiency with artisan\'s tools (tinker\'s tools). Using those tools, you can spend 1 hour and 10 gp worth of materials to construct a Tiny clockwork device (AC 5, 1 hp). The device ceases to function after 24 hours unless you spend 1 hour repairing it to keep it functioning, or you can use your action to dismantle it; at that time, you can reclaim the materials used to create it. You can have up to three such devices active at a time.',
          },
        ],
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'half_elf',
    name: 'Half-Elf',
    description: 'Walking in two worlds but truly belonging to neither, half-elves combine what some say are the best qualities of their elf and human parents: human curiosity, inventiveness, and ambition tempered by the refined senses, love of nature, and artistic tastes of the elves.',
    abilityScoreIncrease: { charisma: 2 },
    speed: 30,
    size: 'Medium',
    languages: ['Common', 'Elvish'],
    features: [
      {
        name: 'Darkvision',
        description: 'Thanks to your elf blood, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can\'t discern color in darkness, only shades of gray.',
      },
      {
        name: 'Fey Ancestry',
        description: 'You have advantage on saving throws against being charmed, and magic can\'t put you to sleep.',
      },
      {
        name: 'Skill Versatility',
        description: 'You gain proficiency in two skills of your choice.',
        // Would need skill selection UI
      },
      {
        name: 'Ability Score Increase (Flexible)',
        description: 'Two different ability scores of your choice increase by 1.',
        // Would need ability selection UI (handled by base +2 Cha + two flexible)
      },
    ],
    source: 'PHB',
  },
  {
    id: 'half_orc',
    name: 'Half-Orc',
    description: 'Whether united under the leadership of a mighty warlock or having fought to a standstill after years of conflict, orc and human tribes sometimes form alliances, joining forces into a larger horde to the terror of civilized lands nearby. These alliances are sealed by marriages, and the children of such unions are half-orcs.',
    abilityScoreIncrease: { strength: 2, constitution: 1 },
    speed: 30,
    size: 'Medium',
    languages: ['Common', 'Orc'],
    features: [
      {
        name: 'Darkvision',
        description: 'Thanks to your orc blood, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can\'t discern color in darkness, only shades of gray.',
      },
      {
        name: 'Menacing',
        description: 'You gain proficiency in the Intimidation skill.',
        effect: (sheet) => ({
          skills: { ...sheet.skills, intimidation: { ...sheet.skills?.intimidation, proficient: true } }
        }),
      },
      {
        name: 'Relentless Endurance',
        description: 'When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. You can\'t use this feature again until you finish a long rest.',
      },
      {
        name: 'Savage Attacks',
        description: 'When you score a critical hit with a melee weapon attack, you can roll one of the weapon\'s damage dice one additional time and add it to the extra damage of the critical hit.',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'halfling',
    name: 'Halfling',
    description: 'The comforts of home are the goals of most halflings\' lives: a place to settle, peace and quiet, a good meal, and a fine cup of tea. Some halflings live out their days in remote agricultural communities, others form nomadic bands that travel constantly, lured by the open road and the wide horizon.',
    abilityScoreIncrease: { dexterity: 2 },
    speed: 25,
    size: 'Small',
    languages: ['Common', 'Halfling'],
    features: [
      {
        name: 'Lucky',
        description: 'When you roll a 1 on the d20 for an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll.',
      },
      {
        name: 'Brave',
        description: 'You have advantage on saving throws against being frightened.',
      },
      {
        name: 'Halfling Nimbleness',
        description: 'You can move through the space of any creature that is of a size larger than yours.',
      },
    ],
    subraces: [
      {
        id: 'lightfoot_halfling',
        name: 'Lightfoot Halfling',
        description: 'As a lightfoot halfling, you can easily hide from notice, even using other creatures as cover. You\'re inclined to be affable and get along well with others.',
        abilityScoreIncrease: { charisma: 1 },
        speed: 25,
        size: 'Small',
        languages: ['Common', 'Halfling'],
        features: [
          {
            name: 'Naturally Stealthy',
            description: 'You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you.',
          },
        ],
        source: 'PHB',
      },
      {
        id: 'stout_halfling',
        name: 'Stout Halfling',
        description: 'As a stout halfling, you\'re hardier than most and have some resistance to poison.',
        abilityScoreIncrease: { constitution: 1 },
        speed: 25,
        size: 'Small',
        languages: ['Common', 'Halfling'],
        features: [
          {
            name: 'Stout Resilience',
            description: 'You have advantage on saving throws against poison, and you have resistance against poison damage.',
          },
        ],
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'human',
    name: 'Human',
    description: 'Humans are the most adaptable and ambitious people among the common races. They have widely varying tastes, morals, and customs in the many different lands where they have settled.',
    abilityScoreIncrease: { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 },
    speed: 30,
    size: 'Medium',
    languages: ['Common'],
    features: [
      {
        name: 'Extra Language',
        description: 'You can speak, read, and write one extra language of your choice.',
      },
      {
        name: 'Variant Human (Optional)',
        description: 'If your campaign uses the optional feat rules from the Player\'s Handbook, your Dungeon Master might allow these variant traits, all of which replace the human\'s Ability Score Increase trait. +1 to two different ability scores of your choice, proficiency in one skill of your choice, one feat of your choice.',
        // Would need feat/skill selection
      },
    ],
    source: 'PHB',
  },
  {
    id: 'tiefling',
    name: 'Tiefling',
    description: 'To be greeted with stares and whispers, to suffer violence and insult on the street, to see mistrust and fear in every eye: this is the lot of the tiefling. And to twist the knife, tieflings know that this is because a pact struck generations ago infused the essence of Asmodeus—overlord of the Nine Hells—into their bloodline.',
    abilityScoreIncrease: { charisma: 2, intelligence: 1 },
    speed: 30,
    size: 'Medium',
    languages: ['Common', 'Infernal'],
    features: [
      {
        name: 'Darkvision',
        description: 'Thanks to your infernal heritage, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can\'t discern color in darkness, only shades of gray.',
      },
      {
        name: 'Hellish Resistance',
        description: 'You have resistance to fire damage.',
      },
      {
        name: 'Infernal Legacy',
        description: 'You know the thaumaturgy cantrip. When you reach 3rd level, you can cast the hellish rebuke spell once per day as a 2nd-level spell. When you reach 5th level, you can also cast the darkness spell once per day. Charisma is your spellcasting ability for these spells.',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'fairy',
    name: 'Fairy',
    description: 'Infused with the magic of the Feywild, fairies are whimsical folk who resemble small elves with insect-like wings.',
    abilityScoreIncrease: { dexterity: 2, charisma: 1 },
    speed: 30,
    size: 'Small',
    languages: ['Common', 'Sylvan'],
    features: [
      {
        name: 'Fairy Magic',
        description: 'You know the Druidcraft cantrip. Starting at 3rd level, you can cast Faerie Fire once per long rest. Starting at 5th level, you can cast Enlarge/Reduce once per long rest.',
      },
      {
        name: 'Flight',
        description: 'Because of your wings, you have a flying speed equal to your walking speed. You can\'t use this flying speed if you are wearing medium or heavy armor.',
      },
      {
        name: 'Fey Creature Type',
        description: 'Your creature type is Fey, rather than Humanoid.',
      },
    ],
    source: 'TCE',
  },
  {
    id: 'harengon',
    name: 'Harengon',
    description: 'Rabbitfolk native to the Feywild, energetic and lucky travelers.',
    abilityScoreIncrease: { dexterity: 2, wisdom: 1 },
    speed: 30,
    size: 'Medium',
    languages: ['Common', 'Sylvan'],
    features: [
      {
        name: 'Hare-Trigger',
        description: 'You can add your proficiency bonus to your initiative rolls.',
      },
      {
        name: 'Leporine Senses',
        description: 'You have proficiency in the Perception skill.',
      },
      {
        name: 'Rabbit Hop',
        description: 'As a bonus action, you can jump a number of feet equal to 5 times your proficiency bonus without provoking opportunity attacks.',
      },
    ],
    source: 'TCE',
  },
];

/** Get a race by ID (including subraces) */
export function getRaceById(id: string): RaceData | undefined {
  for (const race of DND5E_RACES) {
    if (race.id === id) return race;
    if (race.subraces) {
      for (const subrace of race.subraces) {
        if (subrace.id === id) return subrace;
      }
    }
  }
  return undefined;
}

/** Get all races flattened (including subraces as separate entries) */
export function getAllRacesFlat(): RaceData[] {
  const result: RaceData[] = [];
  for (const race of DND5E_RACES) {
    result.push(race);
    if (race.subraces) {
      result.push(...race.subraces);
    }
  }
  return result;
}

/** Apply a race's effects to a character sheet */
export function applyRaceToSheet(sheet: DnD5eCharacterData, race: RaceData): Partial<DnD5eCharacterData> {
  const updates: Partial<DnD5eCharacterData> = {};

  // Apply ability score increases
  if (race.abilityScoreIncrease) {
    updates.stats = { ...sheet.stats };
    for (const [ability, increase] of Object.entries(race.abilityScoreIncrease)) {
      const key = ability as keyof DnD5eCharacterData['stats'];
      if (updates.stats[key]) {
        updates.stats[key] = {
          ...updates.stats[key],
          score: (updates.stats[key].score || 0) + increase,
        };
      } else {
        updates.stats[key] = { score: increase, modifier: Math.floor((increase - 10) / 2) };
      }
    }
  }

  // Apply speed
  if (race.speed) {
    updates.speed = race.speed;
  }

  // Apply size
  if (race.size) {
    updates.size = race.size;
  }

  // Apply languages
  if (race.languages && race.languages.length > 0) {
    const existing = sheet.proficienciesAndLanguages || [];
    const newLangs = race.languages.filter(l => !existing.includes(l));
    if (newLangs.length > 0) {
      updates.proficienciesAndLanguages = [...existing, ...newLangs];
    }
  }

  // Apply features
  if (race.features && race.features.length > 0) {
    let featureData = sheet.featuresAndTraits || [];
    for (const feature of race.features) {
      if (feature.effect) {
        const effect = feature.effect(sheet);
        Object.assign(updates, effect);
      }
      // Add feature to list
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