/**
 * Qualitative health classification — frontend copy of the utility test.
 *
 * Mirrors backend/src/utils/rules/__tests__/qualitativeHealth.test.ts exactly.
 * Both suites must pass, so a behavioural change that breaks one also breaks
 * the other, ensuring neither copy drifts silently.
 */

import { describe, it, expect } from 'vitest';
import {
  getQualitativeHealth,
  getHealthDisplayName,
  getHealthTooltip,
  HEALTH_BORDER_COLORS,
  HEALTH_BADGE_EMOJI,
  QualitativeHealth,
  type TokenHealthData,
} from '../rules/qualitativeHealth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hp(current: number, max: number, temp = 0): TokenHealthData {
  return { current, max, temp };
}

function hpWithConditions(
  current: number,
  max: number,
  conditions: string[],
): TokenHealthData {
  return { current, max, temp: 0, conditions };
}

function hpWithDeathSaves(
  current: number,
  max: number,
  successes: number,
  failures: number,
): TokenHealthData {
  return { current, max, temp: 0, deathSaves: { successes, failures } };
}

// ---------------------------------------------------------------------------
// Threshold boundaries
// ---------------------------------------------------------------------------

const SYSTEMS = ['DND_5E', 'PATHFINDER_2E', 'CALL_OF_CTHULHU_7E', 'SHADOWRUN_6E', 'FLEXIBLE'] as const;

for (const system of SYSTEMS) {
  describe(`getQualitativeHealth — ${system}`, () => {
    it('returns HEALTHY at exactly 100 %', () => {
      expect(getQualitativeHealth(hp(60, 60), system)).toBe(QualitativeHealth.HEALTHY);
    });

    it('returns HEALTHY just above the 75 % boundary (76 %)', () => {
      expect(getQualitativeHealth(hp(46, 60), system)).toBe(QualitativeHealth.HEALTHY);
    });

    it('returns WOUNDED at exactly 75 % (boundary is exclusive, so 75 % is Wounded)', () => {
      expect(getQualitativeHealth(hp(45, 60), system)).toBe(QualitativeHealth.WOUNDED);
    });

    it('returns WOUNDED just above 50 % (51 %)', () => {
      expect(getQualitativeHealth(hp(31, 60), system)).toBe(QualitativeHealth.WOUNDED);
    });

    it('returns BLOODIED at exactly 50 % (boundary is exclusive, so 50 % is Bloodied)', () => {
      expect(getQualitativeHealth(hp(30, 60), system)).toBe(QualitativeHealth.BLOODIED);
    });

    it('returns BLOODIED just above 25 % (26 %)', () => {
      expect(getQualitativeHealth(hp(16, 60), system)).toBe(QualitativeHealth.BLOODIED);
    });

    it('returns CRITICAL at exactly 25 % (boundary is exclusive)', () => {
      expect(getQualitativeHealth(hp(15, 60), system)).toBe(QualitativeHealth.CRITICAL);
    });

    it('returns CRITICAL at 1 HP', () => {
      expect(getQualitativeHealth(hp(1, 60), system)).toBe(QualitativeHealth.CRITICAL);
    });

    it('returns UNCONSCIOUS at 0 HP (no conditions or death saves)', () => {
      expect(getQualitativeHealth(hp(0, 60), system)).toBe(QualitativeHealth.UNCONSCIOUS);
    });

    it('returns UNCONSCIOUS at negative HP', () => {
      expect(getQualitativeHealth(hp(-5, 60), system)).toBe(QualitativeHealth.UNCONSCIOUS);
    });
  });
}

// ---------------------------------------------------------------------------
// Dead condition override
// ---------------------------------------------------------------------------

describe('getQualitativeHealth — Dead condition', () => {
  it('returns DEAD when "Dead" is in conditions, regardless of HP', () => {
    expect(
      getQualitativeHealth(hpWithConditions(60, 60, ['Dead']), 'DND_5E'),
    ).toBe(QualitativeHealth.DEAD);
  });

  it('returns DEAD when "Dead" is in conditions even at full HP (edge case)', () => {
    expect(
      getQualitativeHealth(hpWithConditions(100, 100, ['Dead']), 'PATHFINDER_2E'),
    ).toBe(QualitativeHealth.DEAD);
  });
});

// ---------------------------------------------------------------------------
// Condition-based Dying / Unconscious (non-5e systems)
// ---------------------------------------------------------------------------

describe('getQualitativeHealth — condition-based Dying/Unconscious', () => {
  it('returns DYING when "Dying" is in conditions at 0 HP (non-5e)', () => {
    expect(
      getQualitativeHealth(hpWithConditions(0, 60, ['Dying']), 'PATHFINDER_2E'),
    ).toBe(QualitativeHealth.DYING);
  });

  it('returns UNCONSCIOUS when "Unconscious" is in conditions at 0 HP (non-5e)', () => {
    expect(
      getQualitativeHealth(hpWithConditions(0, 60, ['Unconscious']), 'CALL_OF_CTHULHU_7E'),
    ).toBe(QualitativeHealth.UNCONSCIOUS);
  });

  it('falls back to UNCONSCIOUS at 0 HP with no matching conditions', () => {
    expect(
      getQualitativeHealth(hpWithConditions(0, 60, ['Prone', 'Stunned']), 'SHADOWRUN_6E'),
    ).toBe(QualitativeHealth.UNCONSCIOUS);
  });
});

// ---------------------------------------------------------------------------
// D&D 5e death saves
// ---------------------------------------------------------------------------

describe('getQualitativeHealth — D&D 5e death saves', () => {
  it('returns DYING when death saves are in progress (< 3 successes and < 3 failures)', () => {
    expect(getQualitativeHealth(hpWithDeathSaves(0, 40, 1, 1), 'DND_5E')).toBe(QualitativeHealth.DYING);
  });

  it('returns DYING at 0 successes, 0 failures', () => {
    expect(getQualitativeHealth(hpWithDeathSaves(0, 40, 0, 0), 'DND_5E')).toBe(QualitativeHealth.DYING);
  });

  it('returns UNCONSCIOUS at 3 successes (stable)', () => {
    expect(getQualitativeHealth(hpWithDeathSaves(0, 40, 3, 0), 'DND_5E')).toBe(QualitativeHealth.UNCONSCIOUS);
  });

  it('returns DEAD at 3 failures', () => {
    expect(getQualitativeHealth(hpWithDeathSaves(0, 40, 0, 3), 'DND_5E')).toBe(QualitativeHealth.DEAD);
  });

  it('returns DEAD at 3 failures even when successes are also 3 (failures checked first)', () => {
    expect(getQualitativeHealth(hpWithDeathSaves(0, 40, 3, 3), 'DND_5E')).toBe(QualitativeHealth.DEAD);
  });
});

// ---------------------------------------------------------------------------
// Temporary HP handling
// ---------------------------------------------------------------------------

describe('getQualitativeHealth — temporary HP', () => {
  it('adds temp HP to effective max so a topped-up creature looks Healthy', () => {
    expect(getQualitativeHealth(hp(60, 60, 10), 'DND_5E')).toBe(QualitativeHealth.HEALTHY);
  });

  it('a creature at full base HP with temp stays in the Healthy tier', () => {
    expect(getQualitativeHealth(hp(40, 40, 20), 'DND_5E')).toBe(QualitativeHealth.HEALTHY);
  });

  it('accounts for temp HP correctly in the Wounded tier', () => {
    expect(getQualitativeHealth(hp(36, 60, 10), 'DND_5E')).toBe(QualitativeHealth.WOUNDED);
  });

  it('negative temp HP is treated as zero', () => {
    expect(getQualitativeHealth({ current: 30, max: 60, temp: -5 }, 'DND_5E')).toBe(QualitativeHealth.BLOODIED);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('getQualitativeHealth — edge cases', () => {
  it('handles max = 0 without dividing by zero (returns UNCONSCIOUS)', () => {
    expect(getQualitativeHealth(hp(0, 0), 'DND_5E')).toBe(QualitativeHealth.UNCONSCIOUS);
  });

  it('handles an unknown game system by falling back to DND_5E thresholds', () => {
    expect(getQualitativeHealth(hp(45, 60), 'SOME_FUTURE_SYSTEM')).toBe(QualitativeHealth.WOUNDED);
  });
});

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

describe('getHealthDisplayName', () => {
  it('returns "Healthy" for HEALTHY', () => {
    expect(getHealthDisplayName(QualitativeHealth.HEALTHY)).toBe('Healthy');
  });

  it('returns "Dead" for DEAD', () => {
    expect(getHealthDisplayName(QualitativeHealth.DEAD)).toBe('Dead');
  });

  it('covers all seven states', () => {
    const all = Object.values(QualitativeHealth);
    for (const state of all) {
      expect(getHealthDisplayName(state)).toBeTruthy();
    }
  });
});

describe('getHealthTooltip', () => {
  it('returns "Looks bloodied" for a player viewing a Bloodied creature', () => {
    expect(getHealthTooltip(QualitativeHealth.BLOODIED, false)).toBe('Looks bloodied');
  });

  it('returns exact HP for the DM', () => {
    expect(
      getHealthTooltip(QualitativeHealth.BLOODIED, true, { current: 24, max: 60 }),
    ).toBe('Bloodied — 24/60 HP');
  });

  it('omits HP numbers from the DM tooltip when no exactHP is provided', () => {
    expect(getHealthTooltip(QualitativeHealth.WOUNDED, true)).toBe('Looks wounded');
  });
});

// ---------------------------------------------------------------------------
// Border colours and badges — completeness
// ---------------------------------------------------------------------------

describe('HEALTH_BORDER_COLORS', () => {
  it('has an entry for every qualitative state', () => {
    for (const state of Object.values(QualitativeHealth)) {
      expect(HEALTH_BORDER_COLORS[state]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('HEALTH_BADGE_EMOJI', () => {
  it('has an emoji for every qualitative state', () => {
    for (const state of Object.values(QualitativeHealth)) {
      expect(HEALTH_BADGE_EMOJI[state]).toBeTruthy();
    }
  });
});
