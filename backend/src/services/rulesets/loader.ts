/**
 * Backend Ruleset Loader & Migration Service
 * PRD §9.1-9.3: "Rules are modules, not assumptions embedded in the tabletop"
 */

import { z } from 'zod';
import logger from '../../utils/logger';

export const RulesetAttributionSchema = z.object({
  source: z.string(),
  publisher: z.string(),
  license: z.string(),
  url: z.string().url().optional(),
  notice: z.string().optional(),
});

export const RulesetMeasurementSchema = z.object({
  gridType: z.enum(['square', 'hex_pointy', 'hex_flat', 'gridless']).default('square'),
  gridDistance: z.number().positive().default(5),
  gridUnit: z.string().default('ft'),
  diagonalRule: z.enum(['euclidean', 'manhattan', 'dnd5e_alternating', 'dnd5e_standard']).default('dnd5e_standard'),
  defaultMovement: z.number().nonnegative().default(30),
});

export const RulesetPackSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string(),
  system: z.string(),
  attribution: RulesetAttributionSchema,
  measurements: RulesetMeasurementSchema,
  fields: z.array(z.record(z.string(), z.unknown())).default([]),
  conditions: z.array(z.record(z.string(), z.unknown())).default([]),
  actions: z.array(z.record(z.string(), z.unknown())).default([]),
  races: z.array(z.record(z.string(), z.unknown())).default([]),
  classes: z.array(z.record(z.string(), z.unknown())).default([]),
  automation: z.record(z.string(), z.unknown()).default({}),
});

export type RulesetPack = z.infer<typeof RulesetPackSchema>;

export class RulesetLoader {
  private static registry: Map<string, RulesetPack> = new Map();

  static registerPack(rawPack: unknown): { success: boolean; pack?: RulesetPack; error?: string } {
    const parsed = RulesetPackSchema.safeParse(rawPack);
    if (!parsed.success) {
      const err = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      logger.warn('Ruleset pack validation failed', { error: err });
      return { success: false, error: err };
    }

    this.registry.set(parsed.data.id, parsed.data);
    logger.info('Registered ruleset pack', { id: parsed.data.id, version: parsed.data.version });
    return { success: true, pack: parsed.data };
  }

  static getPack(id: string): RulesetPack | undefined {
    return this.registry.get(id);
  }

  static listPacks(): Array<Pick<RulesetPack, 'id' | 'name' | 'version' | 'system' | 'attribution'>> {
    return Array.from(this.registry.values()).map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      system: p.system,
      attribution: p.attribution,
    }));
  }
}
