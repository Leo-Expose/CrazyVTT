/**
 * D&D 5e / 5.5e SRD Feats Compendium
 * Feats from SRD 5.1 (2014) and SRD 5.2 (2024)
 */

export interface CompendiumFeat {
  id: string;
  name: string;
  prerequisites: string[];
  description: string;
}

export const SRD_FEATS_2014: CompendiumFeat[] = [
  {
    id: 'grappler',
    name: 'Grappler',
    prerequisites: ["STR 13+"],
    description: 'You\'ve developed the Skills necessary to hold your own in close--quarters Grappling. You gain the following benefits: - You have advantage on Attack Rolls against a creature you are Grappling. - You can use your action to try to pin a creature Grappled by you. To do so, make another grapple check. If you succeed, you and the creature are both Restrained until the grapple ends.',
  },
];

export const SRD_FEATS_2024: CompendiumFeat[] = [
  {
    id: 'ability_score_improvement',
    name: 'Ability Score Improvement',
    prerequisites: ["Level 4+"],
    description: 'Increase one ability score of your choice by 2, or increase two ability scores of your choice by 1. This feat can\'t increase an ability score above 20.',
  },
  {
    id: 'alert',
    name: 'Alert',
    prerequisites: [],
    description: 'You gain a +5 bonus to initiative. You can\'t be surprised while you are conscious. Other creatures don\'t gain advantage on attack rolls against you as a result of being hidden from you.',
  },
  {
    id: 'archery',
    name: 'Archery',
    prerequisites: ["Feature: Fighting Style"],
    description: 'You gain a +2 bonus to attack rolls you make with ranged weapons.',
  },
  {
    id: 'boon_of_combat_prowess',
    name: 'Boon of Combat Prowess',
    prerequisites: ["Level 19+"],
    description: 'Your Strength or Dexterity increases by 2, to a maximum of 22. In addition, whenever you miss with an attack roll, you can cause the attack to hit instead. Once you use this benefit, you can\'t use it again until you finish a long rest.',
  },
  {
    id: 'boon_of_dimensional_travel',
    name: 'Boon of Dimensional Travel',
    prerequisites: ["Level 19+"],
    description: 'You learn the Misty Step spell if you don\'t already know it. You can cast it without expending a spell slot, and you must finish a long rest before you can cast it in this way again. Whenever you cast a spell of 1st level or higher that deals damage, you can teleport up to 30 feet to an unoccupied space you can see.',
  },
  {
    id: 'boon_of_fate',
    name: 'Boon of Fate',
    prerequisites: ["Level 19+"],
    description: 'You gain 1d4 Fate Dice. When you or a creature you can see within 60 feet makes an attack roll, ability check, or saving throw, you can expend one Fate Die to roll the die and add or subtract the number rolled from the d20 roll. You regain all expended Fate Dice when you finish a long rest.',
  },
  {
    id: 'boon_of_irresistible_offense',
    name: 'Boon of Irresistible Offense',
    prerequisites: ["Level 19+"],
    description: 'Your Strength or Dexterity increases by 2, to a maximum of 22. In addition, your weapon attacks ignore resistance to bludgeoning, piercing, and slashing damage.',
  },
  {
    id: 'boon_of_spell_recall',
    name: 'Boon of Spell Recall',
    prerequisites: ["Level 19+", "Feature: Spellcasting"],
    description: 'Your Intelligence, Wisdom, or Charisma increases by 2, to a maximum of 22. In addition, whenever you cast a spell using a spell slot, you can roll 1d4. If the number rolled is less than or equal to the spell slot level, the slot isn\'t expended.',
  },
  {
    id: 'boon_of_the_night_spirit',
    name: 'Boon of the Night Spirit',
    prerequisites: ["Level 19+"],
    description: 'Your Dexterity increases by 2, to a maximum of 22. You gain proficiency in Stealth if you don\'t already have it. While in dim light or darkness, you can take the Hide action as a bonus action.',
  },
  {
    id: 'boon_of_truesight',
    name: 'Boon of Truesight',
    prerequisites: ["Level 19+"],
    description: 'Your Intelligence, Wisdom, or Charisma increases by 2, to a maximum of 22. You gain Truesight with a range of 60 feet.',
  },
  {
    id: 'defense',
    name: 'Defense',
    prerequisites: ["Feature: Fighting Style"],
    description: 'While you are wearing armor, you gain a +1 bonus to AC.',
  },
  {
    id: 'grappler',
    name: 'Grappler',
    prerequisites: ["Level 4+"],
    description: 'You have advantage on attack rolls against a creature you are grappling. You can use a bonus action to try to pin a creature grappled by you. To do so, make another grapple check. If you succeed, you and the creature are both restrained until the grapple ends.',
  },
  {
    id: 'great_weapon_fighting',
    name: 'Great Weapon Fighting',
    prerequisites: ["Feature: Fighting Style"],
    description: 'When you roll a 1 or 2 on a damage die for an attack with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll. The weapon must have the two-handed or versatile property.',
  },
  {
    id: 'magic_initiate',
    name: 'Magic Initiate',
    prerequisites: [],
    description: 'Choose a class: Bard, Cleric, Druid, Sorcerer, Warlock, or Wizard. You learn two cantrips and one 1st-level spell from that class\'s spell list. You can cast the 1st-level spell once per long rest without a spell slot. Your spellcasting ability for these spells is Charisma (Bard, Sorcerer, Warlock), Wisdom (Cleric, Druid), or Intelligence (Wizard).',
  },
  {
    id: 'savage_attacker',
    name: 'Savage Attacker',
    prerequisites: [],
    description: 'Once per turn when you hit a target with a weapon, you can roll the weapon\'s damage dice twice and use either roll.',
  },
  {
    id: 'skilled',
    name: 'Skilled',
    prerequisites: [],
    description: 'You gain proficiency in any combination of three skills or tools of your choice.',
  },
  {
    id: 'two_weapon_fighting',
    name: 'Two-Weapon Fighting',
    prerequisites: ["Feature: Fighting Style"],
    description: 'When you take the Attack action and attack with a light weapon, you can draw and attack with a different light weapon as part of the same action. You don\'t add your ability modifier to the damage of the bonus attack unless that modifier is negative.',
  },
];