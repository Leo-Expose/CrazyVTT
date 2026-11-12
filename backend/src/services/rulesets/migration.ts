/**
 * Ruleset Version Migrations
 * Migrates character sheets and campaign data between pack versions (e.g. 2014 to 2024).
 */

import logger from '../../utils/logger';

export interface MigrationResult {
  migrated: boolean;
  fromVersion: string;
  toVersion: string;
  data: Record<string, unknown>;
  changes: string[];
}

export class RulesetMigrationService {
  /**
   * Migrate D&D 5e sheet data from 2014 to 2024 revised ruleset
   */
  static migrate2014to2024(data: Record<string, unknown>): MigrationResult {
    const changes: string[] = [];
    const updated = { ...data };

    // 1. Exhaustion: convert boolean/levels to updated 2024 10-tier exhaustion
    if (updated.conditions && Array.isArray(updated.conditions)) {
      if (updated.conditions.includes('Exhaustion') && !updated.conditions.includes('Exhaustion (2024)')) {
        updated.conditions = updated.conditions.map((c: string) => (c === 'Exhaustion' ? 'Exhaustion (2024)' : c));
        changes.push('Migrated Exhaustion condition to 2024 10-tier model');
      }
    }

    // 2. Weapon Masteries: initialize empty array if absent
    if (updated.weaponMasteries === undefined) {
      updated.weaponMasteries = [];
      changes.push('Initialized 2024 weapon masteries slot');
    }

    // 3. Heroic Inspiration: migrate from standard inspiration
    if (updated.inspiration !== undefined && updated.heroicInspiration === undefined) {
      updated.heroicInspiration = updated.inspiration;
      changes.push('Mapped inspiration flag to Heroic Inspiration');
    }

    logger.info('Migrated sheet from 2014 to 2024 ruleset', { changeCount: changes.length });

    return {
      migrated: true,
      fromVersion: '2014',
      toVersion: '2024',
      data: updated,
      changes,
    };
  }
}
