/**
 * Ruleset Pack Schema (Zod)
 * PRD §9.1-9.3: "Rules are modules, not assumptions embedded in the tabletop"
 *
 * Pack schema covers:
 * - Metadata & source/attribution (version, author, license, SRD attribution)
 * - Measurement defaults (grid type, scale, diagonals)
 * - Character sheet field definitions (attributes, skills, vitals)
 * - Actions & combat options
 * - Conditions (effects, badges, automation)
 * - Classes, subclasses, and races/species
 * - Equipment & items templates
 * - Automation settings (death saves, critical hits, resting, encumbrance)
 */

import { z } from 'zod';

export const RulesetAttributionSchema = z.object({
  source: z.string(),
  publisher: z.string(),
  license: z.string(), // e.g. "CC-BY-4.0", "OGL-1.0a", "Custom"
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

export const RulesetFieldDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['number', 'string', 'boolean', 'dice', 'select', 'list']),
  defaultValue: z.unknown().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.string()).optional(),
  formula: z.string().optional(), // derived value expression e.g. "floor((score - 10) / 2)"
});

export const RulesetConditionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
  effects: z.array(z.string()).default([]),
  preventsActions: z.boolean().default(false),
  preventsReactions: z.boolean().default(false),
  grantsAdvantageOnAttacksAgainst: z.boolean().default(false),
  disadvantageOnAttacks: z.boolean().default(false),
  speedMultiplier: z.number().default(1),
});

export const RulesetActionDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  actionType: z.enum([
    'ATTACK_MELEE',
    'ATTACK_RANGED',
    'SPELL_ATTACK',
    'SPELL_SAVE',
    'SPELL_AOE',
    'FEATURE',
    'ITEM_USE',
    'REACTION',
    'MOVEMENT',
    'OTHER',
  ]),
  cost: z.enum(['ACTION', 'BONUS_ACTION', 'REACTION', 'FREE', 'MOVEMENT', 'LEGENDARY', 'MYTHIC']),
  range: z.object({
    normal: z.number().optional(),
    long: z.number().optional(),
  }).optional(),
  description: z.string(),
  attackBonusFormula: z.string().optional(),
  damageFormula: z.string().optional(),
  damageType: z.string().optional(),
  saveDCFormula: z.string().optional(),
  saveAbility: z.string().optional(),
});

export const RulesetFeatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().int().min(1),
  description: z.string(),
  grantsActions: z.array(RulesetActionDefinitionSchema).optional(),
});

export const RulesetRaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  speed: z.number().default(30),
  abilityScoreModifiers: z.record(z.string(), z.number()).default({}),
  features: z.array(RulesetFeatureSchema).default([]),
  subraces: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    abilityScoreModifiers: z.record(z.string(), z.number()).default({}),
    features: z.array(RulesetFeatureSchema).default([]),
  })).optional(),
});

export const RulesetClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  hitDie: z.number().int().min(4).max(12),
  primaryAbility: z.string(),
  savingThrows: z.array(z.string()),
  armorProficiencies: z.array(z.string()).default([]),
  weaponProficiencies: z.array(z.string()).default([]),
  spellcastingAbility: z.string().optional(),
  features: z.array(RulesetFeatureSchema).default([]),
  subclasses: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    features: z.array(RulesetFeatureSchema).default([]),
  })).default([]),
});

export const RulesetAutomationSettingsSchema = z.object({
  deathSavesEnabled: z.boolean().default(true),
  deathSaveSuccessThreshold: z.number().default(3),
  deathSaveFailureThreshold: z.number().default(3),
  criticalHitRule: z.enum(['double_dice', 'max_plus_roll', 'double_total']).default('double_dice'),
  encumbranceRule: z.enum(['none', 'standard_5e', 'variant_5e']).default('standard_5e'),
  shortRestRecoveryFormula: z.string().default('hit_dice'),
  longRestFullHeal: z.boolean().default(true),
});

export const RulesetPackSchema = z.object({
  id: z.string(),
  version: z.string(), // e.g. "1.0.0", "2014.1", "2024.1"
  name: z.string(),
  description: z.string(),
  system: z.string(), // e.g. "DND_5E_2014", "DND_5E_2024", "PATHFINDER_2E", "CUSTOM"
  attribution: RulesetAttributionSchema,
  measurements: RulesetMeasurementSchema,
  fields: z.array(RulesetFieldDefinitionSchema).default([]),
  conditions: z.array(RulesetConditionSchema).default([]),
  actions: z.array(RulesetActionDefinitionSchema).default([]),
  races: z.array(RulesetRaceSchema).default([]),
  classes: z.array(RulesetClassSchema).default([]),
  automation: RulesetAutomationSettingsSchema.default({}),
});

export type RulesetPack = z.infer<typeof RulesetPackSchema>;
export type RulesetAttribution = z.infer<typeof RulesetAttributionSchema>;
export type RulesetMeasurement = z.infer<typeof RulesetMeasurementSchema>;
export type RulesetCondition = z.infer<typeof RulesetConditionSchema>;
export type RulesetActionDefinition = z.infer<typeof RulesetActionDefinitionSchema>;
export type RulesetRace = z.infer<typeof RulesetRaceSchema>;
export type RulesetClass = z.infer<typeof RulesetClassSchema>;
export type RulesetAutomationSettings = z.infer<typeof RulesetAutomationSettingsSchema>;
