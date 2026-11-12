import type { ClassData } from './classes';

export const ADDITIONAL_5E_CLASSES: ClassData[] = [
  {
    id: 'druid',
    name: 'Druid',
    description: 'A priest of the Old Faith, wielding the powers of nature and adopting animal forms.',
    hitDie: 'd8',
    primaryAbility: ['wisdom'],
    savingThrows: [{ ability: 'intelligence' }, { ability: 'wisdom' }],
    armorProficiencies: ['Light Armor', 'Medium Armor', 'Shields (non-metal)'],
    weaponProficiencies: ['Clubs', 'Daggers', 'Darts', 'Javelins', 'Maces', 'Quarterstaffs', 'Scimitars', 'Sickles', 'Slings', 'Spears'],
    toolProficiencies: ['Herbalism kit'],
    skillChoices: [{
      choose: 2,
      from: ['arcana', 'animalHandling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'],
    }],
    startingEquipment: [
      '(a) a wooden shield or (b) any simple weapon',
      '(a) a scimitar or (b) any simple melee weapon',
      'Leather armor, an explorer\'s pack, and a druidic focus',
    ],
    features: {
      1: [
        {
          name: 'Druidic',
          description: 'You know Druidic, the secret language of druids.',
          level: 1,
        },
        {
          name: 'Spellcasting',
          description: 'Drawing on the divine essence of nature itself, you can cast spells to shape that essence to your will.',
          level: 1,
        },
      ],
      2: [
        {
          name: 'Wild Shape',
          description: 'You can use your action to magically assume the shape of a beast that you have seen before.',
          level: 2,
        },
      ],
    },
    subclasses: [
      {
        id: 'circle_of_the_land',
        name: 'Circle of the Land',
        description: 'Mystics and sages who safeguard ancient nature lore.',
        level: 2,
        features: {},
        source: 'PHB',
      },
    ],
    spellcasting: {
      ability: 'wisdom',
      spellList: 'druid',
      ritual: true,
      slotsPerLevel: {
        1: { '1': 2 },
        2: { '1': 3 },
        3: { '1': 4, '2': 2 },
      },
    },
    source: 'PHB',
  },
  {
    id: 'fighter',
    name: 'Fighter',
    description: 'A master of martial combat, skilled with a variety of weapons and armor.',
    hitDie: 'd10',
    primaryAbility: ['strength', 'dexterity'],
    savingThrows: [{ ability: 'strength' }, { ability: 'constitution' }],
    armorProficiencies: ['All Armor', 'Shields'],
    weaponProficiencies: ['Simple Weapons', 'Martial Weapons'],
    toolProficiencies: [],
    skillChoices: [{
      choose: 2,
      from: ['acrobatics', 'animalHandling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'],
    }],
    startingEquipment: [
      '(a) chain mail or (b) leather armor, longbow, and 20 arrows',
      '(a) a martial weapon and a shield or (b) two martial weapons',
      '(a) a light crossbow and 20 bolts or (b) two handaxes',
      '(a) a dungeoneer\'s pack or (b) an explorer\'s pack',
    ],
    features: {
      1: [
        {
          name: 'Fighting Style',
          description: 'You adopt a particular style of fighting as your specialty.',
          level: 1,
        },
        {
          name: 'Second Wind',
          description: 'On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level.',
          level: 1,
        },
      ],
      2: [
        {
          name: 'Action Surge',
          description: 'You can take one additional action on your turn. Once used, you must finish a short or long rest to use it again.',
          level: 2,
        },
      ],
    },
    subclasses: [
      {
        id: 'champion',
        name: 'Champion',
        description: 'Focuses on the development of raw physical power honed to deadly perfection.',
        level: 3,
        features: {},
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'monk',
    name: 'Monk',
    description: 'A master of martial arts, harnessing the power of the body in pursuit of physical and spiritual perfection.',
    hitDie: 'd8',
    primaryAbility: ['dexterity', 'wisdom'],
    savingThrows: [{ ability: 'strength' }, { ability: 'dexterity' }],
    armorProficiencies: [],
    weaponProficiencies: ['Simple Weapons', 'Shortswords'],
    toolProficiencies: ["Choose one type of artisan's tools or musical instrument"],
    skillChoices: [{
      choose: 2,
      from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
    }],
    startingEquipment: [
      '(a) a shortsword or (b) any simple weapon',
      '(a) a dungeoneer\'s pack or (b) an explorer\'s pack',
      '10 darts',
    ],
    features: {
      1: [
        {
          name: 'Unarmored Defense',
          description: 'Beginning at 1st level, while you are wearing no armor and not wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.',
          level: 1,
        },
        {
          name: 'Martial Arts',
          description: 'You can use Dexterity instead of Strength for monk weapons, roll d4 for unarmed strikes, and make bonus unarmed attacks.',
          level: 1,
        },
      ],
      2: [
        {
          name: 'Ki',
          description: 'You can harness the mystical energy of ki to fuel Flurry of Blows, Patient Defense, and Step of the Wind.',
          level: 2,
        },
      ],
    },
    subclasses: [
      {
        id: 'way_of_the_open_hand',
        name: 'Way of the Open Hand',
        description: 'Masters of unarmed martial combat techniques.',
        level: 3,
        features: {},
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'paladin',
    name: 'Paladin',
    description: 'A holy warrior bound to a sacred oath.',
    hitDie: 'd10',
    primaryAbility: ['strength', 'charisma'],
    savingThrows: [{ ability: 'wisdom' }, { ability: 'charisma' }],
    armorProficiencies: ['All Armor', 'Shields'],
    weaponProficiencies: ['Simple Weapons', 'Martial Weapons'],
    toolProficiencies: [],
    skillChoices: [{
      choose: 2,
      from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
    }],
    startingEquipment: [
      '(a) a martial weapon and a shield or (b) two martial weapons',
      '(a) five javelins or (b) any simple melee weapon',
      '(a) a priest\'s pack or (b) an explorer\'s pack',
      'Chain mail and a holy symbol',
    ],
    features: {
      1: [
        {
          name: 'Divine Sense',
          description: 'You can detect celestials, fiends, and undead within 60 feet of you.',
          level: 1,
        },
        {
          name: 'Lay on Hands',
          description: 'You have a pool of healing power that replenishes when you take a long rest. With that pool, you can restore a total number of hit points equal to your paladin level × 5.',
          level: 1,
        },
      ],
      2: [
        {
          name: 'Divine Smite',
          description: 'When you hit a creature with a melee weapon attack, you can expend one spell slot to deal radiant damage to the target, in addition to the weapon\'s damage.',
          level: 2,
        },
      ],
    },
    subclasses: [
      {
        id: 'oath_of_devotion',
        name: 'Oath of Devotion',
        description: 'Binds a paladin to the loftiest ideals of justice, virtue, and order.',
        level: 3,
        features: {},
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    description: 'A warrior who combats threats on the edges of civilization using martial prowess and nature magic.',
    hitDie: 'd10',
    primaryAbility: ['dexterity', 'wisdom'],
    savingThrows: [{ ability: 'strength' }, { ability: 'dexterity' }],
    armorProficiencies: ['Light Armor', 'Medium Armor', 'Shields'],
    weaponProficiencies: ['Simple Weapons', 'Martial Weapons'],
    toolProficiencies: [],
    skillChoices: [{
      choose: 3,
      from: ['animalHandling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'],
    }],
    startingEquipment: [
      '(a) scale mail or (b) leather armor',
      '(a) two shortswords or (b) two simple melee weapons',
      '(a) a dungeoneer\'s pack or (b) an explorer\'s pack',
      'A longbow and a quiver of 20 arrows',
    ],
    features: {
      1: [
        {
          name: 'Favored Enemy',
          description: 'You have significant study and tracking experience against a type of enemy.',
          level: 1,
        },
        {
          name: 'Natural Explorer',
          description: 'You are particularly familiar with one type of natural environment and adept at traveling through it.',
          level: 1,
        },
      ],
    },
    subclasses: [
      {
        id: 'hunter',
        name: 'Hunter',
        description: 'Emulates the specialized tactics of wilderness predators.',
        level: 3,
        features: {},
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'rogue',
    name: 'Rogue',
    description: 'A scoundrel who uses stealth and trickery to overcome obstacles and enemies.',
    hitDie: 'd8',
    primaryAbility: ['dexterity'],
    savingThrows: [{ ability: 'dexterity' }, { ability: 'intelligence' }],
    armorProficiencies: ['Light Armor'],
    weaponProficiencies: ['Simple Weapons', 'Hand Crossbows', 'Longswords', 'Rapiers', 'Shortswords'],
    toolProficiencies: ["Thieves' tools"],
    skillChoices: [{
      choose: 4,
      from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleightOfHand', 'stealth'],
    }],
    startingEquipment: [
      '(a) a rapier or (b) a shortsword',
      '(a) a shortbow and quiver of 20 arrows or (b) a shortsword',
      '(a) a burglar\'s pack, (b) a dungeoneer\'s pack, or (c) an explorer\'s pack',
      'Leather armor, two daggers, and thieves\' tools',
    ],
    features: {
      1: [
        {
          name: 'Expertise',
          description: 'Choose two of your skill proficiencies, or one of your skill proficiencies and your proficiency with thieves\' tools. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies.',
          level: 1,
        },
        {
          name: 'Sneak Attack (1d6)',
          description: 'Once per turn, you can deal an extra 1d6 damage to one creature you hit with an attack if you have advantage on the attack roll or an ally is adjacent.',
          level: 1,
        },
        {
          name: 'Thieves\' Cant',
          description: 'During your rogue training you learned thieves\' cant, a secret mix of dialect, jargon, and code.',
          level: 1,
        },
      ],
      2: [
        {
          name: 'Cunning Action',
          description: 'You can take a bonus action on each of your turns in combat to Dash, Disengage, or Hide.',
          level: 2,
        },
      ],
    },
    subclasses: [
      {
        id: 'thief',
        name: 'Thief',
        description: 'Hones your skills in the larcenous arts of burglary and agility.',
        level: 3,
        features: {},
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    description: 'A spellcaster who draws on inherent magic from a gift or bloodline.',
    hitDie: 'd6',
    primaryAbility: ['charisma'],
    savingThrows: [{ ability: 'constitution' }, { ability: 'charisma' }],
    armorProficiencies: [],
    weaponProficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light Crossbows'],
    toolProficiencies: [],
    skillChoices: [{
      choose: 2,
      from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
    }],
    startingEquipment: [
      '(a) a light crossbow and 20 bolts or (b) any simple weapon',
      '(a) a component pouch or (b) an arcane focus',
      '(a) a dungeoneer\'s pack or (b) an explorer\'s pack',
      'Two daggers',
    ],
    features: {
      1: [
        {
          name: 'Sorcerous Origin',
          description: 'Choose a sorcerous origin, which describes the source of your innate magical power.',
          level: 1,
        },
        {
          name: 'Spellcasting',
          description: 'An event in your past, or in the life of a parent or ancestor, left an indelible mark on you, infusing you with arcane magic.',
          level: 1,
        },
      ],
      2: [
        {
          name: 'Font of Magic',
          description: 'You tap into a deep wellspring of magic within yourself represented by sorcery points.',
          level: 2,
        },
      ],
    },
    subclasses: [
      {
        id: 'draconic_bloodline',
        name: 'Draconic Bloodline',
        description: 'Inherent magic comes from a draconic ancestor.',
        level: 1,
        features: {},
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'warlock',
    name: 'Warlock',
    description: 'A wielder of magic that is derived from a bargain with an otherworldly entity.',
    hitDie: 'd8',
    primaryAbility: ['charisma'],
    savingThrows: [{ ability: 'wisdom' }, { ability: 'charisma' }],
    armorProficiencies: ['Light Armor'],
    weaponProficiencies: ['Simple Weapons'],
    toolProficiencies: [],
    skillChoices: [{
      choose: 2,
      from: ['history', 'investigation', 'nature', 'religion', 'sleightOfHand', 'stealth'],
    }],
    startingEquipment: [
      '(a) a light crossbow and 20 bolts or (b) any simple weapon',
      '(a) a component pouch or (b) an arcane focus',
      '(a) a scholar\'s pack or (b) a dungeoneer\'s pack',
      'Leather armor, any simple weapon, and two daggers',
    ],
    features: {
      1: [
        {
          name: 'Otherworldly Patron',
          description: 'You have struck a bargain with an otherworldly being of your choice.',
          level: 1,
        },
        {
          name: 'Pact Magic',
          description: 'Your arcane research and the magic bestowed on you by your patron have given you facility with spells.',
          level: 1,
        },
      ],
    },
    subclasses: [
      {
        id: 'the_fiend',
        name: 'The Fiend',
        description: 'Made a pact with a fiend from the lower planes of the multiverse.',
        level: 1,
        features: {},
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
  {
    id: 'wizard',
    name: 'Wizard',
    description: 'A scholarly magic-user capable of manipulating the structures of reality.',
    hitDie: 'd6',
    primaryAbility: ['intelligence'],
    savingThrows: [{ ability: 'intelligence' }, { ability: 'wisdom' }],
    armorProficiencies: [],
    weaponProficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light Crossbows'],
    toolProficiencies: [],
    skillChoices: [{
      choose: 2,
      from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
    }],
    startingEquipment: [
      '(a) a quarterstaff or (b) a dagger',
      '(a) a component pouch or (b) an arcane focus',
      '(a) a scholar\'s pack or (b) an explorer\'s pack',
      'A spellbook',
    ],
    features: {
      1: [
        {
          name: 'Spellcasting',
          description: 'As a student of arcane magic, you have a spellbook containing spells that show the first glimmerings of your true power.',
          level: 1,
        },
        {
          name: 'Arcane Recovery',
          description: 'You have learned to regain some of your magical energy by studying your spellbook once per day during a short rest.',
          level: 1,
        },
      ],
    },
    subclasses: [
      {
        id: 'school_of_evocation',
        name: 'School of Evocation',
        description: 'Focuses on magic that creates powerful elemental effects.',
        level: 2,
        features: {},
        source: 'PHB',
      },
    ],
    source: 'PHB',
  },
];
