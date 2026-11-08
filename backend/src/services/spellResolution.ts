/**
 * Spell AoE Resolution Service
 * Handles calculation of spell saves, damage, conditions, and resolutions.
 */

import {
  findAffectedTokens,
  type AoETemplateSize,
  type AoEShape,
  type Point,
  type TokenTarget,
} from '../utils/rules/spellAoE';

export interface SpellCastResolutionInput {
  castId: string;
  campaignId: string;
  spellId?: string;
  spellName: string;
  casterTokenId?: string;
  casterName?: string;
  template: {
    shape: AoEShape;
    size: AoETemplateSize;
  };
  origin: Point; // in grid units
  angleRad: number;
  tokens: TokenTarget[];
  save?: {
    ability: string;
    dc: number;
    halfOnSave: boolean;
  };
  damage?: {
    baseAmount: number;
    type: string;
  };
  conditions?: string[];
}

export interface ResolvedTargetEvaluation {
  tokenId: string;
  tokenName: string;
  coverageRatio: number;
  isAffected: boolean;
  saveRoll?: number;
  savePassed?: boolean;
  appliedDamage: number;
  damageType?: string;
  appliedConditions: string[];
}

export interface SpellResolutionResult {
  castId: string;
  spellName: string;
  casterTokenId?: string;
  casterName?: string;
  targets: ResolvedTargetEvaluation[];
  summary: string;
}

/**
 * Calculates deterministic evaluation for affected targets during a spell cast
 */
export function evaluateSpellAoE(input: SpellCastResolutionInput): SpellResolutionResult {
  const originFeet: Point = {
    x: input.origin.x * 5,
    y: input.origin.y * 5,
  };

  const rawAffected = findAffectedTokens(
    input.template,
    originFeet,
    input.angleRad,
    input.tokens,
    5,
    0.499
  );

  const targets: ResolvedTargetEvaluation[] = rawAffected.map((res) => {
    if (!res.isAffected) {
      return {
        tokenId: res.tokenId,
        tokenName: res.tokenName,
        coverageRatio: res.coverageRatio,
        isAffected: false,
        appliedDamage: 0,
        appliedConditions: [],
      };
    }

    // If a saving throw is specified, we evaluate standard default
    const baseDamage = input.damage?.baseAmount ?? 0;
    const appliedDamage = baseDamage;
    const appliedConditions = [...(input.conditions || [])];

    return {
      tokenId: res.tokenId,
      tokenName: res.tokenName,
      coverageRatio: res.coverageRatio,
      isAffected: true,
      appliedDamage,
      damageType: input.damage?.type,
      appliedConditions,
    };
  });

  const affectedCount = targets.filter((t) => t.isAffected).length;

  return {
    castId: input.castId,
    spellName: input.spellName,
    casterTokenId: input.casterTokenId,
    casterName: input.casterName,
    targets,
    summary: `${input.spellName} hits ${affectedCount} target(s).`,
  };
}
