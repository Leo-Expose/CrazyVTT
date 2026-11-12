/**
 * D&D 5e Backgrounds Compendium
 * Standard PHB backgrounds with automatic skill proficiencies, tool proficiencies, languages, and starting equipment.
 */

import type { DnD5eCharacterData } from '@/types/game-systems';

export interface BackgroundData {
  id: string;
  name: string;
  description: string;
  skillProficiencies: (keyof DnD5eCharacterData['skills'])[];
  toolProficiencies?: string[];
  languages?: number; // Number of free languages to choose
  startingEquipment: Array<{
    name: string;
    quantity: number;
    weight: number;
    value?: number;
  }>;
  feature: {
    name: string;
    description: string;
  };
}

export const DND5E_BACKGROUNDS: Record<string, BackgroundData> = {
  Acolyte: {
    id: 'Acolyte',
    name: 'Acolyte',
    description: 'You have spent your life in the service of a temple to a specific god or pantheon of gods.',
    skillProficiencies: ['insight', 'religion'],
    languages: 2,
    startingEquipment: [
      { name: 'Holy Symbol', quantity: 1, weight: 1 },
      { name: 'Prayer Book', quantity: 1, weight: 2 },
      { name: 'Incense (sticks)', quantity: 5, weight: 0.1 },
      { name: 'Vestments', quantity: 1, weight: 4 },
      { name: 'Common Clothes', quantity: 1, weight: 3 },
      { name: 'Pouch (15 gp)', quantity: 1, weight: 1, value: 15 },
    ],
    feature: {
      name: 'Shelter of the Faithful',
      description: 'You and your companions can receive free healing and care at a temple or shrine of your faith.',
    },
  },
  Criminal: {
    id: 'Criminal',
    name: 'Criminal',
    description: 'You are an experienced criminal with a history of breaking the law.',
    skillProficiencies: ['deception', 'stealth'],
    toolProficiencies: ["Thieves' tools", 'Gaming set'],
    startingEquipment: [
      { name: 'Crowbar', quantity: 1, weight: 5, value: 2 },
      { name: 'Dark Common Clothes with Hood', quantity: 1, weight: 3 },
      { name: "Thieves' Tools", quantity: 1, weight: 1, value: 25 },
      { name: 'Pouch (15 gp)', quantity: 1, weight: 1, value: 15 },
    ],
    feature: {
      name: 'Criminal Contact',
      description: 'You have a reliable and trustworthy contact who acts as your liaison to a network of other criminals.',
    },
  },
  Folk_Hero: {
    id: 'Folk Hero',
    name: 'Folk Hero',
    description: 'You come from a humble social rank, but you are destined for so much more.',
    skillProficiencies: ['animalHandling', 'survival'],
    toolProficiencies: ["Artisan's tools", 'Vehicles (land)'],
    startingEquipment: [
      { name: "Artisan's Tools", quantity: 1, weight: 5 },
      { name: 'Shovel', quantity: 1, weight: 5, value: 2 },
      { name: 'Iron Pot', quantity: 1, weight: 10, value: 2 },
      { name: 'Common Clothes', quantity: 1, weight: 3 },
      { name: 'Pouch (10 gp)', quantity: 1, weight: 1, value: 10 },
    ],
    feature: {
      name: 'Rustic Hospitality',
      description: 'Since you come from the ranks of the common folk, you fit in among them with ease. They will shelter and shield you.',
    },
  },
  Noble: {
    id: 'Noble',
    name: 'Noble',
    description: 'You understand wealth, power, and privilege. You carry a noble title, and your family owns land.',
    skillProficiencies: ['history', 'persuasion'],
    toolProficiencies: ['Gaming set'],
    languages: 1,
    startingEquipment: [
      { name: 'Fine Clothes', quantity: 1, weight: 6, value: 15 },
      { name: 'Signet Ring', quantity: 1, weight: 0.1, value: 5 },
      { name: 'Scroll of Pedigree', quantity: 1, weight: 0.5 },
      { name: 'Purse (25 gp)', quantity: 1, weight: 1, value: 25 },
    ],
    feature: {
      name: 'Position of Privilege',
      description: 'People are inclined to think the best of you. You are welcome in high society, and commoners make every effort to accommodate you.',
    },
  },
  Sage: {
    id: 'Sage',
    name: 'Sage',
    description: 'You spent years learning the lore of the multiverse, scouring manuscripts and studying ancient scrolls.',
    skillProficiencies: ['arcana', 'history'],
    languages: 2,
    startingEquipment: [
      { name: 'Bottle of Black Ink', quantity: 1, weight: 0.1, value: 10 },
      { name: 'Quill', quantity: 1, weight: 0.1 },
      { name: 'Small Knife', quantity: 1, weight: 1 },
      { name: 'Letter from a Dead Colleague', quantity: 1, weight: 0.1 },
      { name: 'Common Clothes', quantity: 1, weight: 3 },
      { name: 'Pouch (10 gp)', quantity: 1, weight: 1, value: 10 },
    ],
    feature: {
      name: 'Researcher',
      description: 'When you attempt to learn or recall a piece of lore, if you do not know it, you often know where and from whom you can obtain it.',
    },
  },
  Soldier: {
    id: 'Soldier',
    name: 'Soldier',
    description: 'War has been your life for as long as you care to remember. You trained as a youth and survived the brutal battlefield.',
    skillProficiencies: ['athletics', 'intimidation'],
    toolProficiencies: ['Gaming set', 'Vehicles (land)'],
    startingEquipment: [
      { name: 'Insignia of Rank', quantity: 1, weight: 0.1 },
      { name: 'Trophy from a Fallen Enemy', quantity: 1, weight: 1 },
      { name: 'Bone Dice or Playing Card Set', quantity: 1, weight: 0.1 },
      { name: 'Common Clothes', quantity: 1, weight: 3 },
      { name: 'Pouch (10 gp)', quantity: 1, weight: 1, value: 10 },
    ],
    feature: {
      name: 'Military Rank',
      description: 'You have a military rank from your career as a soldier. Loyal soldiers still recognize your authority.',
    },
  },
};

/**
 * Apply background features, skill proficiencies, and starting gear to character sheet
 */
export function applyBackgroundToSheet(
  sheet: DnD5eCharacterData,
  backgroundName: string
): Partial<DnD5eCharacterData> {
  const normalized = backgroundName.replace(/\s+/g, '_');
  const bg = DND5E_BACKGROUNDS[normalized] || DND5E_BACKGROUNDS[backgroundName];
  if (!bg) return {};

  const updates: Partial<DnD5eCharacterData> = {};

  // 1. Skill Proficiencies
  const skills = { ...sheet.skills };
  let skillsChanged = false;
  for (const skillKey of bg.skillProficiencies) {
    if (skills[skillKey] && !skills[skillKey].proficient) {
      skills[skillKey] = { ...skills[skillKey], proficient: true };
      skillsChanged = true;
    }
  }
  if (skillsChanged) updates.skills = skills;

  // 2. Tool & Language Proficiencies
  const existingProfs = sheet.proficienciesAndLanguages || [];
  const addedProfs: string[] = [];
  if (bg.toolProficiencies) {
    for (const tool of bg.toolProficiencies) {
      if (!existingProfs.includes(tool)) addedProfs.push(tool);
    }
  }
  if (addedProfs.length > 0) {
    updates.proficienciesAndLanguages = [...existingProfs, ...addedProfs];
  }

  // 3. Background Feature
  const features = sheet.featuresAndTraits ? [...sheet.featuresAndTraits] : [];
  if (!features.some((f) => f.name === bg.feature.name)) {
    features.push(bg.feature);
    updates.featuresAndTraits = features;
  }

  // 4. Starting Equipment
  const inventory = sheet.inventory ? [...sheet.inventory] : [];
  for (const item of bg.startingEquipment) {
    if (!inventory.some((i) => i.name.toLowerCase() === item.name.toLowerCase())) {
      inventory.push({
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: item.name,
        quantity: item.quantity,
        weight: item.weight,
        value: item.value || 0,
        equipped: false,
      });
    }
  }
  updates.inventory = inventory;

  return updates;
}
