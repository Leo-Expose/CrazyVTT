/**
 * Rollable Tables Compendium (PRD §10.1, §19.1)
 * Standard classic tables for Critical Fumbles, Wild Magic Surges, and Dungeon Hazards.
 */

export interface RollableTable {
  id: string;
  name: string;
  description: string;
  die: string; // e.g. "1d20"
  entries: Array<{
    min: number;
    max: number;
    result: string;
  }>;
}

export const ROLLABLE_TABLES: Record<string, RollableTable> = {
  critical_fumbles: {
    id: 'critical_fumbles',
    name: 'Critical Fumbles (Melee & Ranged)',
    description: 'Complications when rolling a natural 1 on an attack roll.',
    die: '1d20',
    entries: [
      { min: 1, max: 3, result: 'Weapon Slipped: Your weapon drops 10 feet in a random direction.' },
      { min: 4, max: 6, result: 'Overextended: You lose your balance and fall Prone.' },
      { min: 7, max: 9, result: 'Glancing Recoil: Next attack against you has Advantage until the start of your next turn.' },
      { min: 10, max: 12, result: 'Wide Swing: Target can use their reaction to make one Opportunity Attack against you.' },
      { min: 13, max: 15, result: 'Strained Muscle: Your movement speed is halved for the rest of this combat.' },
      { min: 16, max: 18, result: 'Equipment Tangle: Disadvantage on your next attack or ability check.' },
      { min: 19, max: 20, result: 'Friendly Fire: If an ally is within 5 feet of target, roll attack against their AC instead.' },
    ],
  },
  wild_magic: {
    id: 'wild_magic',
    name: 'Wild Magic Surge',
    description: 'Unpredictable magical surges when casting leveled sorcerer spells.',
    die: '1d20',
    entries: [
      { min: 1, max: 2, result: 'Roll on this table at the start of each of your turns for the next minute.' },
      { min: 3, max: 4, result: 'For the next minute, you can see any invisible creature if you have line of sight.' },
      { min: 5, max: 6, result: 'A modron chosen and controlled by the DM appears in an unoccupied space within 5 feet.' },
      { min: 7, max: 8, result: 'You cast Fireball as a 3rd-level spell centered on yourself.' },
      { min: 9, max: 10, result: 'You cast Magic Missile as a 5th-level spell.' },
      { min: 11, max: 12, result: 'Roll a d10. Your height changes by a number of inches equal to the roll.' },
      { min: 13, max: 14, result: 'You cast Confusion centered on yourself.' },
      { min: 15, max: 16, result: 'For the next minute, you regain 5 hit points at the start of each of your turns.' },
      { min: 17, max: 18, result: 'You grow a long beard made of feathers that remains until you sneeze.' },
      { min: 19, max: 20, result: 'You glow with bright light in a 30-foot radius for the next minute.' },
    ],
  },
  dungeon_hazards: {
    id: 'dungeon_hazards',
    name: 'Dungeon Atmospheric Hazards',
    description: 'Spontaneous environmental shifts and dungeon hazards.',
    die: '1d20',
    entries: [
      { min: 1, max: 4, result: 'Tremor: Ceiling dust shakes loose. DC 12 Dex save or blinded for 1 round.' },
      { min: 5, max: 8, result: 'Gust of Draft: Unshielded torches and small open flames blow out.' },
      { min: 9, max: 12, result: 'Eerie Echo: Distant skittering claws echo through nearby corridors.' },
      { min: 13, max: 16, result: 'Water Inrush: Floor becomes slippery difficult terrain.' },
      { min: 17, max: 20, result: 'Mana Flare: Ambient magic causes nonmagical metals to spark faintly.' },
    ],
  },
};

export function rollOnTable(tableId: string): { roll: number; result: string; tableName: string } {
  const table = ROLLABLE_TABLES[tableId] || ROLLABLE_TABLES.critical_fumbles;
  const roll = Math.floor(Math.random() * 20) + 1;
  const entry = table.entries.find((e) => roll >= e.min && roll <= e.max);
  return {
    roll,
    result: entry ? entry.result : 'No effect.',
    tableName: table.name,
  };
}
