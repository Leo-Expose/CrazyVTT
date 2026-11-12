/**
 * D&D 5e Armor & Logistics Calculator
 * Calculates base AC from equipped armor + Dexterity modifier rules,
 * and checks racial limitations (e.g. Fairies flying restriction in Medium/Heavy armor).
 */

export interface ArmorDefinition {
  name: string;
  category: 'Light' | 'Medium' | 'Heavy' | 'Shield';
  baseAC: number;
  addDex: boolean;
  maxDex?: number;
  stealthDisadvantage: boolean;
  strengthRequirement?: number;
}

export const DND5E_ARMORS: Record<string, ArmorDefinition> = {
  padded: { name: 'Padded', category: 'Light', baseAC: 11, addDex: true, stealthDisadvantage: true },
  leather: { name: 'Leather', category: 'Light', baseAC: 11, addDex: true, stealthDisadvantage: false },
  studded_leather: { name: 'Studded Leather', category: 'Light', baseAC: 12, addDex: true, stealthDisadvantage: false },
  hide: { name: 'Hide', category: 'Medium', baseAC: 12, addDex: true, maxDex: 2, stealthDisadvantage: false },
  chain_shirt: { name: 'Chain Shirt', category: 'Medium', baseAC: 13, addDex: true, maxDex: 2, stealthDisadvantage: false },
  scale_mail: { name: 'Scale Mail', category: 'Medium', baseAC: 14, addDex: true, maxDex: 2, stealthDisadvantage: true },
  breastplate: { name: 'Breastplate', category: 'Medium', baseAC: 14, addDex: true, maxDex: 2, stealthDisadvantage: false },
  half_plate: { name: 'Half Plate', category: 'Medium', baseAC: 15, addDex: true, maxDex: 2, stealthDisadvantage: true },
  ring_mail: { name: 'Ring Mail', category: 'Heavy', baseAC: 14, addDex: false, stealthDisadvantage: true },
  chain_mail: { name: 'Chain Mail', category: 'Heavy', baseAC: 16, addDex: false, stealthDisadvantage: true, strengthRequirement: 13 },
  splint: { name: 'Splint', category: 'Heavy', baseAC: 17, addDex: false, stealthDisadvantage: true, strengthRequirement: 15 },
  plate: { name: 'Plate', category: 'Heavy', baseAC: 18, addDex: false, stealthDisadvantage: true, strengthRequirement: 15 },
  shield: { name: 'Shield', category: 'Shield', baseAC: 2, addDex: false, stealthDisadvantage: false },
};

export interface CalculatedArmorLogistics {
  suggestedAC: number;
  activeArmorName?: string;
  hasShield: boolean;
  stealthDisadvantage: boolean;
  flightDisabled: boolean;
  flightDisabledReason?: string;
}

/**
 * Calculate AC and check racial flight logistics from equipped inventory items
 */
export function calculateArmorLogistics(
  inventory: Array<{ name: string; equipped?: boolean }>,
  dexterityModifier: number,
  raceName?: string
): CalculatedArmorLogistics {
  let highestArmorAC = 10;
  let dexModToAdd = dexterityModifier;
  let activeArmor: ArmorDefinition | null = null;
  let hasShield = false;
  let stealthDisadvantage = false;

  for (const item of inventory) {
    if (!item.equipped) continue;
    const cleanName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Check shields
    if (cleanName.includes('shield')) {
      hasShield = true;
      continue;
    }

    // Check body armors
    for (const [key, armor] of Object.entries(DND5E_ARMORS)) {
      if (armor.category === 'Shield') continue;
      if (cleanName.includes(key) || item.name.toLowerCase().includes(armor.name.toLowerCase())) {
        let armorDex = dexterityModifier;
        if (armor.maxDex !== undefined) {
          armorDex = Math.min(dexterityModifier, armor.maxDex);
        } else if (!armor.addDex) {
          armorDex = 0;
        }

        const calculatedAC = armor.baseAC + armorDex;
        if (calculatedAC > highestArmorAC) {
          highestArmorAC = calculatedAC;
          activeArmor = armor;
          dexModToAdd = armorDex;
          stealthDisadvantage = armor.stealthDisadvantage;
        }
      }
    }
  }

  // Base unarmored AC: 10 + Dex mod
  const finalAC = (activeArmor ? highestArmorAC : 10 + dexterityModifier) + (hasShield ? 2 : 0);

  // Check Fairy / Winged racial flight limitations
  let flightDisabled = false;
  let flightDisabledReason: string | undefined;

  const isFairy = raceName?.toLowerCase().includes('fairy');
  if (isFairy && activeArmor && (activeArmor.category === 'Medium' || activeArmor.category === 'Heavy')) {
    flightDisabled = true;
    flightDisabledReason = `Fairy flight is disabled while wearing ${activeArmor.category} armor (${activeArmor.name}).`;
  }

  return {
    suggestedAC: finalAC,
    activeArmorName: activeArmor?.name,
    hasShield,
    stealthDisadvantage,
    flightDisabled,
    flightDisabledReason,
  };
}
