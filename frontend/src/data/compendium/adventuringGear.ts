/**
 * D&D 5e / 5.5e SRD Adventuring Gear & Tools Compendium
 * Standard gear packs, exploration tools, containers, and kits with weights and GP costs.
 */

export interface CompendiumGear {
  id: string;
  name: string;
  category: 'Adventuring Gear' | 'Container' | 'Tool' | 'Kit' | 'Ammunition';
  weight: number;
  costGP: number;
  description: string;
}

export const SRD_ADVENTURING_GEAR: CompendiumGear[] = [
  // ── Exploration & Lighting ──
  {
    id: 'torch',
    name: 'Torch',
    category: 'Adventuring Gear',
    weight: 1,
    costGP: 0.01,
    description: 'A torch burns for 1 hour, providing bright light in a 20-foot radius and dim light for an additional 20 feet.',
  },
  {
    id: 'lantern_hooded',
    name: 'Hooded Lantern',
    category: 'Adventuring Gear',
    weight: 2,
    costGP: 5,
    description: 'Casts bright light in a 30-foot radius and dim light for an additional 30 feet for 6 hours on 1 pint of oil. As an action, you can lower the hood to reduce light to dim light in a 5-foot radius.',
  },
  {
    id: 'oil_flask',
    name: 'Oil (flask)',
    category: 'Adventuring Gear',
    weight: 1,
    costGP: 0.1,
    description: 'Fuels lanterns for 6 hours or can be splashed on a creature to deal 5 additional fire damage when ignited.',
  },
  {
    id: 'rope_hempen',
    name: 'Rope, Hempen (50 ft)',
    category: 'Adventuring Gear',
    weight: 10,
    costGP: 1,
    description: '50 feet of sturdy rope with 2 hit points and can be burst with a DC 17 Strength check.',
  },
  {
    id: 'grappling_hook',
    name: 'Grappling Hook',
    category: 'Adventuring Gear',
    weight: 4,
    costGP: 2,
    description: 'Secures a climbing rope to walls, battlements, or ledges.',
  },
  {
    id: 'crowbar',
    name: 'Crowbar',
    category: 'Adventuring Gear',
    weight: 5,
    costGP: 2,
    description: 'Using a crowbar grants advantage on Strength checks where the crowbar’s leverage can be applied.',
  },

  // ── Containers & Camp ──
  {
    id: 'backpack',
    name: 'Backpack',
    category: 'Container',
    weight: 5,
    costGP: 2,
    description: 'A backpack can hold up to 1 cubic foot or 30 pounds of gear. You can also strap items, such as a bedroll or rope, to the outside.',
  },
  {
    id: 'bedroll',
    name: 'Bedroll',
    category: 'Adventuring Gear',
    weight: 7,
    costGP: 1,
    description: 'Provides comfortable rest in wilderness conditions.',
  },
  {
    id: 'rations',
    name: 'Rations (1 day)',
    category: 'Adventuring Gear',
    weight: 2,
    costGP: 0.5,
    description: 'Consists of dry foods suitable for extended travel, including jerky, dried fruit, hardtack, and nuts.',
  },
  {
    id: 'waterskin',
    name: 'Waterskin',
    category: 'Container',
    weight: 5,
    costGP: 0.2,
    description: 'Can hold 4 pints (about half a gallon) of liquid.',
  },

  // ── Tools & Kits ──
  {
    id: 'thieves_tools',
    name: "Thieves' Tools",
    category: 'Tool',
    weight: 1,
    costGP: 25,
    description: 'Includes a small file, a set of lock picks, a small mirror, a pair of narrow-bladed scissors, and a pair of pliers. Proficiency lets you add proficiency bonus to checks to pick locks or disarm traps.',
  },
  {
    id: 'healers_kit',
    name: "Healer's Kit",
    category: 'Kit',
    weight: 3,
    costGP: 5,
    description: 'This kit has 10 uses. As an action, you can expend one use of the kit to stabilize a creature that has 0 hit points, without needing to make a Wisdom (Medicine) check.',
  },
  {
    id: 'poisoners_kit',
    name: "Poisoner's Kit",
    category: 'Kit',
    weight: 2,
    costGP: 50,
    description: 'Includes glass vials, a mortar and pestle, chemicals, and pipettes for harvesting and crafting toxins.',
  },
  {
    id: 'herbalism_kit',
    name: 'Herbalism Kit',
    category: 'Kit',
    weight: 3,
    costGP: 5,
    description: 'Contains clippers, mortar and pestle, and pouches used to harvest and brew Antitoxin and Potions of Healing.',
  },
];
