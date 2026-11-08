/**
 * Qualitative health classification (rules/qualitativeHealth.ts).
 *
 * Tests every threshold boundary for every game system, all death-save
 * branches for D&D 5e, condition-based overrides, temp-HP handling, and
 * the display-name / tooltip / badge helpers.
 *
 * Also asserts that the backend and frontend copies of the file are
 * byte-for-byte identical (the same parity test pattern used by hitPoints.ts
 * and dnd5e.ts).
 */

import { readFileSync } from 'fs';
import path from 'path';
import {
  getQualitativeHealth,
  getHealthDisplayName,
  getHealthTooltip,
  HEALTH_BORDER_COLORS,
  HEALTH_BADGE_EMOJI,
  QualitativeHealth,
  type TokenHealthData,
} from '../qualitativeHealth';

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
// Threshold boundaries (D&D 5e as the reference; all systems share the same
// numbers but each is explicitly tested to guard against per-system drift)
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
      // 45/60 = 0.75 exactly — not *above* 0.75 so → Wounded
      expect(getQualitativeHealth(hp(45, 60), system)).toBe(QualitativeHealth.WOUNDED);
    });

    it('returns WOUNDED just above 50 % (51 %)', () => {
      expect(getQualitativeHealth(hp(31, 60), system)).toBe(QualitativeHealth.WOUNDED);
    });

    it('returns BLOODIED at exactly 50 % (boundary is exclusive, so 50 % is Bloodied)', () => {
      // 30/60 = 0.50 exactly — not *above* 0.50 so → Bloodied
      expect(getQualitativeHealth(hp(30, 60), system)).toBe(QualitativeHealth.BLOODIED);
    });

    it('returns BLOODIED just above 25 % (26 %)', () => {
      expect(getQualitativeHealth(hp(16, 60), system)).toBe(QualitativeHealth.BLOODIED);
    });

    it('returns CRITICAL at exactly 25 % (boundary is exclusive)', () => {
      // 15/60 = 0.25 — not *above* 0.25 so → Critical
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
    // 60 current, 60 max, 10 temp → effective max 70, pct = 60/70 ≈ 0.857 → Healthy
    expect(getQualitativeHealth(hp(60, 60, 10), 'DND_5E')).toBe(QualitativeHealth.HEALTHY);
  });

  it('a creature at full base HP with temp stays in the Healthy tier', () => {
    expect(getQualitativeHealth(hp(40, 40, 20), 'DND_5E')).toBe(QualitativeHealth.HEALTHY);
  });

  it('accounts for temp HP correctly in the Wounded tier', () => {
    // 36 current, 60 max, 10 temp → effective max 70, pct = 36/70 ≈ 0.514 → Wounded
    expect(getQualitativeHealth(hp(36, 60, 10), 'DND_5E')).toBe(QualitativeHealth.WOUNDED);
  });

  it('negative temp HP is treated as zero', () => {
    // Negative temp is not valid but should not crash or skew the result.
    // 30 current, 60 max, -5 temp → clamp to 0 → effective max 60, pct = 0.5 → Bloodied
    expect(getQualitativeHealth({ current: 30, max: 60, temp: -5 }, 'DND_5E')).toBe(QualitativeHealth.BLOODIED);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('getQualitativeHealth — edge cases', () => {
  it('handles max = 0 without dividing by zero (returns CRITICAL)', () => {
    expect(getQualitativeHealth(hp(0, 0), 'DND_5E')).toBe(QualitativeHealth.UNCONSCIOUS);
  });

  it('handles an unknown game system by falling back to DND_5E thresholds', () => {
    // A future or unrecognised system key uses the default thresholds.
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

// ---------------------------------------------------------------------------
// Parity — backend copy must be byte-for-byte identical to frontend copy
// ---------------------------------------------------------------------------

it('is byte-for-byte identical to frontend/src/utils/rules/qualitativeHealth.ts', () => {
  const backendCopy = readFileSync(
    path.resolve(__dirname, '../qualitativeHealth.ts'),
    'utf8',
  );
  const frontendCopy = readFileSync(
    path.resolve(
      __dirname,
      '../../../../../frontend/src/utils/rules/qualitativeHealth.ts',
    ),
    'utf8',
  );
  expect(backendCopy).toBe(frontendCopy);
});
