/**
 * D&D 5e / 5.5e SRD Spell Compendium
 * Structured spell definitions for spell templates, action panel, and instant action resolution.
 */

export interface CompendiumSpell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  rangeFeet: number;
  shape?: 'circle' | 'cone' | 'line' | 'cube';
  shapeSizeFeet?: number;
  duration: string;
  concentration: boolean;
  damageDice?: string;
  damageType?: string;
  saveAbility?: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
  saveHalf: boolean;
  description: string;
}

// Import and re-export the full spell lists from version-specific files
import { SRD_SPELLS_2014 } from './spells-2014';
import { SRD_SPELLS_2024 } from './spells-2024';
export { SRD_SPELLS_2014, SRD_SPELLS_2024 };

// Default to 2014 SRD for backward compatibility
export const SRD_SPELLS = SRD_SPELLS_2014;