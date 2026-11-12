/**
 * D&D 5e / 5.5e SRD Bestiary Compendium
 * High-utility pre-packaged monster templates ready for immediate map placement and combat resolution.
 */

export interface CompendiumMonster {
  id: string;
  name: string;
  cr: string;
  type: string;
  ac: number;
  hp: number;
  speed: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  actions: Array<{
    name: string;
    desc: string;
    attackBonus?: number;
    damageDice?: string;
    damageType?: string;
  }>;
}

export const SRD_MONSTERS: CompendiumMonster[] = [
  // ── Low CR (1/8 to 1/2) ──
  {
    id: 'kobold',
    name: 'Kobold',
    cr: '1/8',
    type: 'Humanoid (kobold)',
    ac: 12,
    hp: 5,
    speed: '30 ft.',
    strength: 7,
    dexterity: 15,
    constitution: 9,
    intelligence: 8,
    wisdom: 7,
    charisma: 8,
    actions: [
      {
        name: 'Dagger',
        desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 4 (1d4 + 2) piercing damage.',
        attackBonus: 4,
        damageDice: '1d4+2',
        damageType: 'piercing',
      },
      {
        name: 'Sling',
        desc: 'Ranged Weapon Attack: +4 to hit, range 30/120 ft., one target. Hit: 4 (1d4 + 2) bludgeoning damage.',
        attackBonus: 4,
        damageDice: '1d4+2',
        damageType: 'bludgeoning',
      },
    ],
  },
  {
    id: 'goblin',
    name: 'Goblin',
    cr: '1/4',
    type: 'Humanoid (goblinoid)',
    ac: 15,
    hp: 7,
    speed: '30 ft.',
    strength: 8,
    dexterity: 14,
    constitution: 10,
    intelligence: 10,
    wisdom: 8,
    charisma: 8,
    actions: [
      {
        name: 'Scimitar',
        desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.',
        attackBonus: 4,
        damageDice: '1d6+2',
        damageType: 'slashing',
      },
      {
        name: 'Shortbow',
        desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.',
        attackBonus: 4,
        damageDice: '1d6+2',
        damageType: 'piercing',
      },
    ],
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    cr: '1/4',
    type: 'Undead',
    ac: 13,
    hp: 13,
    speed: '30 ft.',
    strength: 10,
    dexterity: 14,
    constitution: 15,
    intelligence: 6,
    wisdom: 8,
    charisma: 5,
    actions: [
      {
        name: 'Shortsword',
        desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.',
        attackBonus: 4,
        damageDice: '1d6+2',
        damageType: 'piercing',
      },
      {
        name: 'Shortbow',
        desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.',
        attackBonus: 4,
        damageDice: '1d6+2',
        damageType: 'piercing',
      },
    ],
  },
  {
    id: 'zombie',
    name: 'Zombie',
    cr: '1/4',
    type: 'Undead',
    ac: 8,
    hp: 22,
    speed: '20 ft.',
    strength: 13,
    dexterity: 6,
    constitution: 16,
    intelligence: 3,
    wisdom: 6,
    charisma: 5,
    actions: [
      {
        name: 'Slam',
        desc: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.',
        attackBonus: 3,
        damageDice: '1d6+1',
        damageType: 'bludgeoning',
      },
    ],
  },
  {
    id: 'orc',
    name: 'Orc',
    cr: '1/2',
    type: 'Humanoid (orc)',
    ac: 13,
    hp: 15,
    speed: '30 ft.',
    strength: 16,
    dexterity: 12,
    constitution: 16,
    intelligence: 7,
    wisdom: 11,
    charisma: 10,
    actions: [
      {
        name: 'Greataxe',
        desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.',
        attackBonus: 5,
        damageDice: '1d12+3',
        damageType: 'slashing',
      },
      {
        name: 'Javelin',
        desc: 'Ranged Weapon Attack: +5 to hit, range 30/120 ft., one target. Hit: 6 (1d6 + 3) piercing damage.',
        attackBonus: 5,
        damageDice: '1d6+3',
        damageType: 'piercing',
      },
    ],
  },

  // ── Medium CR (1 to 3) ──
  {
    id: 'bugbear',
    name: 'Bugbear',
    cr: '1',
    type: 'Humanoid (goblinoid)',
    ac: 16,
    hp: 27,
    speed: '30 ft.',
    strength: 15,
    dexterity: 14,
    constitution: 13,
    intelligence: 8,
    wisdom: 11,
    charisma: 9,
    actions: [
      {
        name: 'Morningstar',
        desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 11 (2d8 + 2) piercing damage.',
        attackBonus: 4,
        damageDice: '2d8+2',
        damageType: 'piercing',
      },
      {
        name: 'Javelin',
        desc: 'Ranged Weapon Attack: +4 to hit, range 30/120 ft., one target. Hit: 9 (2d6 + 2) piercing damage.',
        attackBonus: 4,
        damageDice: '2d6+2',
        damageType: 'piercing',
      },
    ],
  },
  {
    id: 'ogre',
    name: 'Ogre',
    cr: '2',
    type: 'Giant',
    ac: 11,
    hp: 59,
    speed: '40 ft.',
    strength: 19,
    dexterity: 8,
    constitution: 16,
    intelligence: 5,
    wisdom: 7,
    charisma: 7,
    actions: [
      {
        name: 'Greatclub',
        desc: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 13 (2d8 + 4) bludgeoning damage.',
        attackBonus: 6,
        damageDice: '2d8+4',
        damageType: 'bludgeoning',
      },
      {
        name: 'Javelin',
        desc: 'Melee or Ranged Weapon Attack: +6 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 11 (2d6 + 4) piercing damage.',
        attackBonus: 6,
        damageDice: '2d6+4',
        damageType: 'piercing',
      },
    ],
  },
  {
    id: 'wight',
    name: 'Wight',
    cr: '3',
    type: 'Undead',
    ac: 14,
    hp: 45,
    speed: '30 ft.',
    strength: 15,
    dexterity: 14,
    constitution: 16,
    intelligence: 10,
    wisdom: 13,
    charisma: 15,
    actions: [
      {
        name: 'Life Drain',
        desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) necrotic damage. Target must succeed on DC 13 Con save or max HP reduced.',
        attackBonus: 4,
        damageDice: '1d6+2',
        damageType: 'necrotic',
      },
      {
        name: 'Longsword',
        desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d8 + 2) slashing damage.',
        attackBonus: 4,
        damageDice: '1d8+2',
        damageType: 'slashing',
      },
    ],
  },

  // ── High CR (5 to 10) ──
  {
    id: 'troll',
    name: 'Troll',
    cr: '5',
    type: 'Giant',
    ac: 15,
    hp: 84,
    speed: '30 ft.',
    strength: 18,
    dexterity: 13,
    constitution: 20,
    intelligence: 7,
    wisdom: 9,
    charisma: 7,
    actions: [
      {
        name: 'Bite',
        desc: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 7 (1d6 + 4) piercing damage.',
        attackBonus: 7,
        damageDice: '1d6+4',
        damageType: 'piercing',
      },
      {
        name: 'Claw',
        desc: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) slashing damage.',
        attackBonus: 7,
        damageDice: '2d6+4',
        damageType: 'slashing',
      },
    ],
  },
  {
    id: 'young_red_dragon',
    name: 'Young Red Dragon',
    cr: '10',
    type: 'Dragon',
    ac: 18,
    hp: 178,
    speed: '40 ft., climb 40 ft., fly 80 ft.',
    strength: 23,
    dexterity: 10,
    constitution: 21,
    intelligence: 14,
    wisdom: 11,
    charisma: 19,
    actions: [
      {
        name: 'Bite',
        desc: 'Melee Weapon Attack: +10 to hit, reach 10 ft., one target. Hit: 17 (2d10 + 6) piercing damage plus 3 (1d6) fire damage.',
        attackBonus: 10,
        damageDice: '2d10+6',
        damageType: 'piercing',
      },
      {
        name: 'Claw',
        desc: 'Melee Weapon Attack: +10 to hit, reach 5 ft., one target. Hit: 13 (2d6 + 6) slashing damage.',
        attackBonus: 10,
        damageDice: '2d6+6',
        damageType: 'slashing',
      },
      {
        name: 'Fire Breath (Recharge 5-6)',
        desc: 'The dragon exhales fire in a 30-foot cone. Each creature in that area must make a DC 17 Dexterity saving throw, taking 56 (16d6) fire damage on a failed save, or half as much damage on a successful one.',
        damageDice: '16d6',
        damageType: 'fire',
      },
    ],
  },
];
