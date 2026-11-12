/**
 * Ruleset Pack Registry and Loader
 * Central registry for built-in and custom ruleset packs.
 */

import { RulesetPackSchema, type RulesetPack } from './schema';
import dnd5e2014Raw from './dnd5e-2014/pack.json';
import dnd5e2024Raw from './dnd5e-2024/pack.json';
import pirateBorgRaw from './pirate-borg/pack.json';
import morkBorgRaw from './mork-borg/pack.json';
import shadowdarkRaw from './shadowdark/pack.json';

// Validate and cast built-in packs at load time
export const DND5E_2014_PACK: RulesetPack = RulesetPackSchema.parse(dnd5e2014Raw);
export const DND5E_2024_PACK: RulesetPack = RulesetPackSchema.parse(dnd5e2024Raw);
export const PIRATE_BORG_PACK: RulesetPack = RulesetPackSchema.parse(pirateBorgRaw);
export const MORK_BORG_PACK: RulesetPack = RulesetPackSchema.parse(morkBorgRaw);
export const SHADOWDARK_PACK: RulesetPack = RulesetPackSchema.parse(shadowdarkRaw);

export const BUILT_IN_RULESETS: Record<string, RulesetPack> = {
  'dnd5e-2014': DND5E_2014_PACK,
  'dnd5e-2024': DND5E_2024_PACK,
  'pirate-borg': PIRATE_BORG_PACK,
  'mork-borg': MORK_BORG_PACK,
  'shadowdark': SHADOWDARK_PACK,
};

const CUSTOM_RULESETS_STORAGE_KEY = 'cozyvtt:custom_ruleset_packs';

export class RulesetRegistry {
  private static customPacks: Map<string, RulesetPack> = new Map();

  static initialize(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(CUSTOM_RULESETS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as unknown[];
          for (const item of parsed) {
            const result = RulesetPackSchema.safeParse(item);
            if (result.success) {
              this.customPacks.set(result.data.id, result.data);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load custom rulesets from storage', e);
    }
  }

  static getPack(id: string): RulesetPack | undefined {
    return BUILT_IN_RULESETS[id] || this.customPacks.get(id);
  }

  static getAllPacks(): RulesetPack[] {
    return [
      ...Object.values(BUILT_IN_RULESETS),
      ...Array.from(this.customPacks.values()),
    ];
  }

  static registerCustomPack(pack: RulesetPack): boolean {
    const validated = RulesetPackSchema.safeParse(pack);
    if (!validated.success) {
      return false;
    }
    this.customPacks.set(validated.data.id, validated.data);
    this.persistCustomPacks();
    return true;
  }

  static removeCustomPack(id: string): boolean {
    if (BUILT_IN_RULESETS[id]) {
      return false; // Cannot delete built-ins
    }
    const existed = this.customPacks.delete(id);
    if (existed) {
      this.persistCustomPacks();
    }
    return existed;
  }

  private static persistCustomPacks(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const array = Array.from(this.customPacks.values());
      localStorage.setItem(CUSTOM_RULESETS_STORAGE_KEY, JSON.stringify(array));
    }
  }
}

// Auto-initialize
RulesetRegistry.initialize();

export * from './schema';
