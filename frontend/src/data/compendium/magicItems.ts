/**
 * D&D 5e / 5.5e SRD Magic Items & Potions Compendium
 * Structured entries with attunement rules, charges, rarity, and mechanical effects.
 */

export interface CompendiumMagicItem {
  id: string;
  name: string;
  type: 'Potion' | 'Scroll' | 'Ring' | 'Wand' | 'Weapon' | 'Armor' | 'Wondrous Item';
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary';
  requiresAttunement: boolean;
  attunementDetails?: string;
  weight: number;
  charges?: {
    max: number;
    current: number;
    recharge: string;
  };
  healingDice?: string;
  bonusAC?: number;
  bonusAttack?: number;
  description: string;
}

export const SRD_MAGIC_ITEMS: CompendiumMagicItem[] = [
  // ── Potions & Consumables ──
  {
    id: 'potion_healing',
    name: 'Potion of Healing',
    type: 'Potion',
    rarity: 'Common',
    requiresAttunement: false,
    weight: 0.5,
    healingDice: '2d4+2',
    description: 'You regain 2d4 + 2 hit points when you drink this magical crimson potion. Drinking or administering a potion takes a bonus action (2024) or action (2014).',
  },
  {
    id: 'potion_greater_healing',
    name: 'Potion of Greater Healing',
    type: 'Potion',
    rarity: 'Uncommon',
    requiresAttunement: false,
    weight: 0.5,
    healingDice: '4d4+4',
    description: 'You regain 4d4 + 4 hit points when you drink this potion.',
  },
  {
    id: 'potion_superior_healing',
    name: 'Potion of Superior Healing',
    type: 'Potion',
    rarity: 'Rare',
    requiresAttunement: false,
    weight: 0.5,
    healingDice: '8d4+8',
    description: 'You regain 8d4 + 8 hit points when you drink this potion.',
  },
  {
    id: 'potion_invisibility',
    name: 'Potion of Invisibility',
    type: 'Potion',
    rarity: 'Very Rare',
    requiresAttunement: false,
    weight: 0.5,
    description: 'Drinking this potion grants you the Invisible condition for 1 hour. The effect ends early if you attack or cast a spell.',
  },

  // ── Wondrous Items & Containers ──
  {
    id: 'bag_of_holding',
    name: 'Bag of Holding',
    type: 'Wondrous Item',
    rarity: 'Uncommon',
    requiresAttunement: false,
    weight: 15,
    description: 'This bag has an interior space roughly 2 feet in diameter at the mouth and 4 feet deep. It can hold up to 500 pounds, not exceeding a volume of 64 cubic feet, while always weighing a flat 15 pounds.',
  },
  {
    id: 'boots_of_elvenkind',
    name: 'Boots of Elvenkind',
    type: 'Wondrous Item',
    rarity: 'Uncommon',
    requiresAttunement: false,
    weight: 1,
    description: 'While you wear these boots, your steps make no sound, regardless of the surface you are moving across. You also have advantage on Dexterity (Stealth) checks that rely on moving silently.',
  },
  {
    id: 'cloak_of_protection',
    name: 'Cloak of Protection',
    type: 'Wondrous Item',
    rarity: 'Uncommon',
    requiresAttunement: true,
    weight: 3,
    bonusAC: 1,
    description: 'You gain a +1 bonus to Armor Class and saving throws while you wear this cloak.',
  },
  {
    id: 'gauntlets_of_ogre_power',
    name: 'Gauntlets of Ogre Power',
    type: 'Wondrous Item',
    rarity: 'Uncommon',
    requiresAttunement: true,
    weight: 2,
    description: 'Your Strength score is 19 while you wear these gauntlets. They have no effect on you if your Strength is already 19 or higher.',
  },

  // ── Rings & Wands ──
  {
    id: 'ring_of_protection',
    name: 'Ring of Protection',
    type: 'Ring',
    rarity: 'Rare',
    requiresAttunement: true,
    weight: 0.1,
    bonusAC: 1,
    description: 'You gain a +1 bonus to Armor Class and saving throws while wearing this ring.',
  },
  {
    id: 'wand_of_magic_missiles',
    name: 'Wand of Magic Missiles',
    type: 'Wand',
    rarity: 'Uncommon',
    requiresAttunement: false,
    weight: 1,
    charges: {
      max: 7,
      current: 7,
      recharge: '1d6+1 at dawn',
    },
    description: 'This wand has 7 charges. While holding it, you can use an action to expend 1 or more of its charges to cast Magic Missile from it. For 1 charge, you cast the 1st-level version of the spell.',
  },

  // ── Magic Weapons & Armor ──
  {
    id: 'weapon_plus_1',
    name: '+1 Weapon (Any)',
    type: 'Weapon',
    rarity: 'Uncommon',
    requiresAttunement: false,
    weight: 3,
    bonusAttack: 1,
    description: 'You have a +1 bonus to attack and damage rolls made with this magic weapon.',
  },
  {
    id: 'armor_plus_1',
    name: '+1 Armor (Any)',
    type: 'Armor',
    rarity: 'Rare',
    requiresAttunement: false,
    weight: 20,
    bonusAC: 1,
    description: 'You have a +1 bonus to Armor Class while wearing this armor.',
  },
];
