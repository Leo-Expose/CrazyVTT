/**
 * rules/qualitativeHealth.ts
 * Qualitative enemy health display — translates exact HP into human-readable
 * descriptors ("Healthy", "Wounded", "Bloodied", "Critical", …) so players see
 * a creature's condition without learning the exact numbers.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   backend/src/utils/rules/qualitativeHealth.ts
 *   frontend/src/utils/rules/qualitativeHealth.ts
 * ---------------------------------------------------------------------------
 * A parity test in the backend suite compares them and fails on any difference.
 * Edit one, copy it to the other.
 *
 * The server uses it to decide what a WebSocket broadcast tells players; the
 * client uses it to render border colours, tooltips and health badges.  Both
 * sides must agree, or a player's browser and the server will describe the same
 * creature differently.
 */

// ---------------------------------------------------------------------------
// Health Display Representation Modes (PRD §14.1, §14.3)
// ---------------------------------------------------------------------------

export type HealthDisplayMode = 'none' | 'qualitative' | 'exact';

// ---------------------------------------------------------------------------
// Core enum — the seven observable states a creature can be in
// ---------------------------------------------------------------------------

export enum QualitativeHealth {
  HEALTHY    = 'healthy',
  WOUNDED    = 'wounded',
  BLOODIED   = 'bloodied',
  CRITICAL   = 'critical',
  UNCONSCIOUS = 'unconscious',
  DYING      = 'dying',
  DEAD       = 'dead',
}

// ---------------------------------------------------------------------------
// Per-system thresholds
//
// Each threshold is the *lower* bound of the tier above it: a creature at
// exactly 75 % (= `healthy`) is Healthy, one at 74 % is Wounded, and so on.
// All four supported systems happen to share the same percentages, but the
// table is kept per-system so a future homebrew system can diverge.
// ---------------------------------------------------------------------------

export interface HealthThresholds {
  /** Lower bound of Healthy  (above → full health, below → Wounded).  */
  healthy: number;   // 0.75
  /** Lower bound of Wounded  (above → Wounded, below → Bloodied).     */
  wounded: number;   // 0.50
  /** Lower bound of Bloodied (above → Bloodied, below → Critical).    */
  bloodied: number;  // 0.25
  /** Lower bound of Critical (above → Critical; at or below → also Critical). */
  critical: number;  // 0.01
}

/** Recognised game-system keys (string union to avoid a Prisma import). */
export type KnownGameSystem =
  | 'DND_5E'
  | 'PATHFINDER_2E'
  | 'CALL_OF_CTHULHU_7E'
  | 'SHADOWRUN_6E'
  | 'FLEXIBLE';

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  healthy: 0.75,
  wounded: 0.50,
  bloodied: 0.25,
  critical: 0.01,
};

export const SYSTEM_THRESHOLDS: Record<KnownGameSystem, HealthThresholds> = {
  DND_5E:            DEFAULT_THRESHOLDS,
  PATHFINDER_2E:     DEFAULT_THRESHOLDS,
  CALL_OF_CTHULHU_7E: DEFAULT_THRESHOLDS,
  SHADOWRUN_6E:      DEFAULT_THRESHOLDS,
  // FLEXIBLE uses D&D 5e defaults; it has no system of its own.
  FLEXIBLE:          DEFAULT_THRESHOLDS,
};

// ---------------------------------------------------------------------------
// Token health data — the minimum the caller must supply
// ---------------------------------------------------------------------------

export interface TokenHealthData {
  current: number;
  max: number;
  temp: number;
  /**
   * D&D 5e death-save progress: 3 successes → Unconscious (stable),
   * 3 failures → Dead.  Only meaningful when current ≤ 0.
   */
  deathSaves?: { successes: number; failures: number };
  /**
   * Condition tags attached to this token (e.g. "Dead", "Unconscious",
   * "Dying").  Checked as a last resort when current ≤ 0 and no
   * system-specific rule applies.
   */
  conditions?: string[];
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Map a creature's HP snapshot to one of the seven qualitative states.
 *
 * Rules:
 * 1. Explicit "Dead" condition → Dead (highest priority: a creature declared
 *    dead stays dead even if it has leftover HP from some edge case).
 * 2. current ≤ 0:
 *    - D&D 5e: check death-save counters (3 failures → Dead, 3 successes →
 *      Unconscious, otherwise → Dying).
 *    - Other systems: check conditions; fall back to Unconscious.
 * 3. Percentage of effective maximum (current HP / (max + temp)):
 *    > healthy  → Healthy
 *    > wounded  → Wounded
 *    > bloodied → Bloodied
 *    otherwise  → Critical
 *
 * Temp HP is added to the maximum so that a creature topped up beyond its
 * base HP still looks fully Healthy — the extra buffer was gained legitimately.
 */
export function getQualitativeHealth(
  health: TokenHealthData,
  gameSystemOrThresholds?: string | HealthThresholds,
): QualitativeHealth {
  let thresholds: HealthThresholds = DEFAULT_THRESHOLDS;
  if (typeof gameSystemOrThresholds === 'object' && gameSystemOrThresholds !== null) {
    thresholds = gameSystemOrThresholds;
  } else if (typeof gameSystemOrThresholds === 'string') {
    thresholds = SYSTEM_THRESHOLDS[gameSystemOrThresholds as KnownGameSystem] ?? DEFAULT_THRESHOLDS;
  }

  // ── 1. Explicit dead condition ───────────────────────────────────────────
  if (health.conditions?.includes('Dead')) return QualitativeHealth.DEAD;

  // ── 2. Zero / negative HP ───────────────────────────────────────────────
  if (health.current <= 0) {
    if (gameSystemOrThresholds === 'DND_5E' && health.deathSaves) {
      if (health.deathSaves.failures >= 3) return QualitativeHealth.DEAD;
      if (health.deathSaves.successes >= 3) return QualitativeHealth.UNCONSCIOUS;
      return QualitativeHealth.DYING;
    }
    if (health.conditions?.includes('Unconscious')) return QualitativeHealth.UNCONSCIOUS;
    if (health.conditions?.includes('Dying'))       return QualitativeHealth.DYING;
    return QualitativeHealth.UNCONSCIOUS;
  }

  // ── 3. Percentage-based tiers ────────────────────────────────────────────
  // Guard against a maximum of 0 to avoid division by zero.
  const temp = Math.max(0, health.temp);
  const effectiveMax = health.max + temp;
  const effectiveCurrent = health.current + temp;
  const pct = effectiveMax > 0 ? effectiveCurrent / effectiveMax : 0;

  if (pct > thresholds.healthy)  return QualitativeHealth.HEALTHY;
  if (pct > thresholds.wounded)  return QualitativeHealth.WOUNDED;
  if (pct > thresholds.bloodied) return QualitativeHealth.BLOODIED;
  return QualitativeHealth.CRITICAL;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Human-readable label for each qualitative state. */
export function getHealthDisplayName(health: QualitativeHealth): string {
  const names: Record<QualitativeHealth, string> = {
    [QualitativeHealth.HEALTHY]:    'Healthy',
    [QualitativeHealth.WOUNDED]:    'Wounded',
    [QualitativeHealth.BLOODIED]:   'Bloodied',
    [QualitativeHealth.CRITICAL]:   'Critical',
    [QualitativeHealth.UNCONSCIOUS]:'Unconscious',
    [QualitativeHealth.DYING]:      'Dying',
    [QualitativeHealth.DEAD]:       'Dead',
  };
  return names[health];
}

/**
 * Tooltip text for a token's health, filtered by role.
 *
 * - Players: "Looks bloodied"
 * - DM: "Bloodied — 24/60 HP"
 */
export function getHealthTooltip(
  health: QualitativeHealth,
  isDM: boolean,
  exactHP?: { current: number; max: number },
): string {
  const name = getHealthDisplayName(health);
  if (isDM && exactHP) {
    return `${name} — ${exactHP.current}/${exactHP.max} HP`;
  }
  return `Looks ${name.toLowerCase()}`;
}

/**
 * Canvas-ready hex colour for the token border that players see, keyed by
 * qualitative state.  Fixed values, deliberately not themed: the border must
 * stay legible over any user-uploaded map image, the same reason the
 * disposition ring and HP bar are hardcoded.
 *
 * These are stored here (not in tokenColours.ts) because they are part of the
 * qualitative-health feature and are not used anywhere else.
 */
export const HEALTH_BORDER_COLORS: Record<QualitativeHealth, string> = {
  [QualitativeHealth.HEALTHY]:    '#22c55e',  // green-500
  [QualitativeHealth.WOUNDED]:    '#eab308',  // yellow-500
  [QualitativeHealth.BLOODIED]:   '#f97316',  // orange-500
  [QualitativeHealth.CRITICAL]:   '#ef4444',  // red-500
  [QualitativeHealth.UNCONSCIOUS]:'#6b7280',  // gray-500
  [QualitativeHealth.DYING]:      '#dc2626',  // red-600
  [QualitativeHealth.DEAD]:       '#1f2937',  // gray-900
};

/**
 * Emoji badge for a qualitative health state, used in list views where a
 * single glyph communicates the tier faster than text.
 */
export const HEALTH_BADGE_EMOJI: Record<QualitativeHealth, string> = {
  [QualitativeHealth.HEALTHY]:    '💚',
  [QualitativeHealth.WOUNDED]:    '💛',
  [QualitativeHealth.BLOODIED]:   '🧡',
  [QualitativeHealth.CRITICAL]:   '❤️',
  [QualitativeHealth.UNCONSCIOUS]:'🤍',
  [QualitativeHealth.DYING]:      '💔',
  [QualitativeHealth.DEAD]:       '💀',
};
