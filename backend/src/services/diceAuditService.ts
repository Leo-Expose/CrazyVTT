// ============================================
// Dice Audit Service (Phase 12)
// Statistical verification of dice roll distributions.
// Runs chi-squared tests against expected frequencies.
// ============================================

import { prisma } from '../config/database';
import { DiceMode } from '@prisma/client';
import { generateDeck } from './diceDeckService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditRecommendation = 'PASS' | 'WARN' | 'FAIL';

export interface AuditResult {
  expression: string;
  mode: DiceMode;
  valid: boolean;
  chiSquared: number;
  pValue: number;
  degreesOfFreedom: number;
  expectedDistribution: Map<number, number>;
  actualDistribution: Map<number, number>;
  sampleSize: number;
  recommendation: AuditRecommendation;
}

export interface AuditReport {
  campaignId: string;
  generatedAt: string;
  mode: DiceMode;
  expressions: AuditResult[];
  overallRecommendation: AuditRecommendation;
}

// ---------------------------------------------------------------------------
// Chi-squared calculation
// ---------------------------------------------------------------------------

/**
 * Compute the chi-squared statistic.
 * observed and expected must have the same keys.
 * Cells with expected < 5 are pooled to avoid inflated χ² from small counts.
 */
function chiSquaredTest(
  observed: Map<number, number>,
  expected: Map<number, number>,
): { chiSquared: number; degreesOfFreedom: number } {
  // Pool cells with expected frequency < 5
  let chiSquared = 0;
  let df = 0;

  expected.forEach((exp, key) => {
    if (exp < 5) return; // skip low-frequency cells
    const obs = observed.get(key) ?? 0;
    chiSquared += (obs - exp) ** 2 / exp;
    df++;
  });

  // df is number of categories − 1
  return { chiSquared, degreesOfFreedom: Math.max(1, df - 1) };
}

/**
 * Approximate p-value from chi-squared and degrees of freedom.
 * Uses the incomplete gamma function approximation (Wilson-Hilferty).
 * Good enough for a table-top gaming audit tool.
 */
function approximatePValue(chiSquared: number, df: number): number {
  if (chiSquared <= 0 || df <= 0) return 1;

  // Wilson-Hilferty approximation: chi² ≈ df*(1 - 2/(9df) + z*sqrt(2/(9df)))^3
  // Solve for z and use standard normal CDF
  const mu = df;
  const sigma2 = 2 * df;
  const z = (chiSquared - mu) / Math.sqrt(sigma2);

  // Complementary CDF of the standard normal (Abramowitz & Stegun 26.2.17)
  return normalSurvivor(z);
}

function normalSurvivor(z: number): number {
  // Approx for the right tail of the standard normal
  if (z < -6) return 1;
  if (z > 6) return 0;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 +
            t * 1.330274429))));
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? 1 - cdf : cdf;
}

function recommend(pValue: number, sampleSize: number): AuditRecommendation {
  if (sampleSize < 10) return 'PASS'; // Too few samples to be meaningful
  if (pValue >= 0.05) return 'PASS';
  if (pValue >= 0.01) return 'WARN';
  return 'FAIL';
}

// ---------------------------------------------------------------------------
// DiceAuditService
// ---------------------------------------------------------------------------

export class DiceAuditService {
  /**
   * Audit the weighted-deck distribution for a specific expression.
   * Compares actual draw history against the perfect theoretical distribution.
   */
  async auditDeck(campaignId: string, expression: string): Promise<AuditResult> {
    const rolls = await prisma.diceRoll.findMany({
      where: {
        campaignId,
        expression,
        mode: DiceMode.WEIGHTED_DECK,
      },
      select: { result: true },
    });

    const actual = new Map<number, number>();
    for (const { result } of rolls) {
      actual.set(result, (actual.get(result) ?? 0) + 1);
    }

    // Expected distribution: each outcome's total scaled to sample size
    const outcomes = generateDeck(expression);
    const totalOutcomes = outcomes.length;
    const sampleSize = rolls.length;

    const expectedFrequency = new Map<number, number>();
    for (const o of outcomes) {
      expectedFrequency.set(o.total, (expectedFrequency.get(o.total) ?? 0) + 1);
    }

    const expected = new Map<number, number>();
    expectedFrequency.forEach((count, total) => {
      expected.set(total, (count / totalOutcomes) * sampleSize);
    });

    const { chiSquared, degreesOfFreedom } = chiSquaredTest(actual, expected);
    const pValue = approximatePValue(chiSquared, degreesOfFreedom);
    const recommendation = recommend(pValue, sampleSize);

    return {
      expression,
      mode: DiceMode.WEIGHTED_DECK,
      valid: recommendation !== 'FAIL',
      chiSquared,
      pValue,
      degreesOfFreedom,
      expectedDistribution: expected,
      actualDistribution: actual,
      sampleSize,
      recommendation,
    };
  }

  /**
   * Audit the true-random distribution for a specific expression.
   * Over a large enough sample, the distribution should be approximately uniform
   * on each possible total.
   */
  async auditTrueRandom(
    campaignId: string,
    expression: string,
    sampleSize?: number,
  ): Promise<AuditResult> {
    const query: Parameters<typeof prisma.diceRoll.findMany>[0] = {
      where: {
        campaignId,
        expression,
        mode: DiceMode.TRUE_RANDOM,
      },
      select: { result: true },
      orderBy: { rolledAt: 'desc' },
    };
    if (sampleSize) query.take = sampleSize;

    const rolls = await prisma.diceRoll.findMany(query);

    const actual = new Map<number, number>();
    for (const { result } of rolls) {
      actual.set(result, (actual.get(result) ?? 0) + 1);
    }

    const outcomes = generateDeck(expression);
    const totalOutcomes = outcomes.length;
    const totalRolls = rolls.length;

    // Expected: uniform across all distinct totals
    const distinctTotals = new Set(outcomes.map((o) => o.total));
    const expected = new Map<number, number>();
    distinctTotals.forEach((total) => {
      // Weight by number of ways to achieve the total (dice combination count)
      const ways = outcomes.filter((o) => o.total === total).length;
      expected.set(total, (ways / totalOutcomes) * totalRolls);
    });

    const { chiSquared, degreesOfFreedom } = chiSquaredTest(actual, expected);
    const pValue = approximatePValue(chiSquared, degreesOfFreedom);
    const recommendation = recommend(pValue, totalRolls);

    return {
      expression,
      mode: DiceMode.TRUE_RANDOM,
      valid: recommendation !== 'FAIL',
      chiSquared,
      pValue,
      degreesOfFreedom,
      expectedDistribution: expected,
      actualDistribution: actual,
      sampleSize: totalRolls,
      recommendation,
    };
  }

  /** Generate a full audit report across all expressions rolled in a campaign. */
  async generateAuditReport(campaignId: string): Promise<AuditReport> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { diceMode: true },
    });
    const mode = campaign?.diceMode ?? DiceMode.TRUE_RANDOM;

    // Find all distinct expressions rolled in this campaign
    const rows = await prisma.diceRoll.findMany({
      where: { campaignId },
      select: { expression: true },
      distinct: ['expression'],
    });

    const expressionResults: AuditResult[] = [];

    for (const { expression } of rows) {
      try {
        const result =
          mode === DiceMode.WEIGHTED_DECK
            ? await this.auditDeck(campaignId, expression)
            : await this.auditTrueRandom(campaignId, expression);
        expressionResults.push(result);
      } catch {
        // Skip expressions that can't be parsed (legacy / custom)
        continue;
      }
    }

    const overallRecommendation: AuditRecommendation =
      expressionResults.some((r) => r.recommendation === 'FAIL')
        ? 'FAIL'
        : expressionResults.some((r) => r.recommendation === 'WARN')
          ? 'WARN'
          : 'PASS';

    return {
      campaignId,
      generatedAt: new Date().toISOString(),
      mode,
      expressions: expressionResults,
      overallRecommendation,
    };
  }
}

export const diceAuditService = new DiceAuditService();
