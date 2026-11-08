import * as fs from 'fs';
import * as path from 'path';
import {
  AoEShape,
  DEFAULT_SPELL_TEMPLATES,
  snapToIntersection,
  snapToCellCenter,
  isPointInsideAoE,
  calculateCoverageRatio,
  findAffectedTokens,
  type TokenTarget,
} from '../spellAoE';

describe('spellAoE rule utility', () => {
  it('is byte-for-byte identical to frontend/src/utils/rules/spellAoE.ts', () => {
    const backendPath = path.resolve(__dirname, '../spellAoE.ts');
    const frontendPath = path.resolve(
      __dirname,
      '../../../../../frontend/src/utils/rules/spellAoE.ts'
    );
    const backendCode = fs.readFileSync(backendPath, 'utf8');
    const frontendCode = fs.readFileSync(frontendPath, 'utf8');
    expect(backendCode).toBe(frontendCode);
  });

  describe('snap functions', () => {
    it('snaps point to nearest grid intersection (5ft grid)', () => {
      expect(snapToIntersection({ x: 2.1, y: 4.8 })).toEqual({ x: 0, y: 5 });
      expect(snapToIntersection({ x: 12, y: 14 })).toEqual({ x: 10, y: 15 });
      expect(snapToIntersection({ x: 15, y: 20 })).toEqual({ x: 15, y: 20 });
    });

    it('snaps point to nearest cell center', () => {
      expect(snapToCellCenter({ x: 2.1, y: 4.8 })).toEqual({ x: 2.5, y: 2.5 });
      expect(snapToCellCenter({ x: 12, y: 14 })).toEqual({ x: 12.5, y: 12.5 });
    });
  });

  describe('isPointInsideAoE - Circle / Sphere / Cylinder', () => {
    const origin = { x: 20, y: 20 };
    const size = { radius: 20 };

    it('identifies points within radius as inside', () => {
      expect(isPointInsideAoE({ x: 20, y: 20 }, AoEShape.CIRCLE, size, origin)).toBe(true);
      expect(isPointInsideAoE({ x: 30, y: 20 }, AoEShape.CIRCLE, size, origin)).toBe(true);
      expect(isPointInsideAoE({ x: 40, y: 20 }, AoEShape.CIRCLE, size, origin)).toBe(true);
      expect(isPointInsideAoE({ x: 40.1, y: 20 }, AoEShape.CIRCLE, size, origin)).toBe(false);
    });

    it('works symmetrically in all directions', () => {
      expect(isPointInsideAoE({ x: 20, y: 40 }, AoEShape.SPHERE, size, origin)).toBe(true);
      expect(isPointInsideAoE({ x: 20, y: 0 }, AoEShape.CYLINDER, size, origin)).toBe(true);
      expect(isPointInsideAoE({ x: 0, y: 20 }, AoEShape.HEMISPHERE, size, origin)).toBe(true);
    });
  });

  describe('isPointInsideAoE - Cone', () => {
    const origin = { x: 10, y: 10 };
    const size = { length: 30 };

    it('detects point in cone along positive X axis (angle = 0)', () => {
      // Half angle is ~26.56°
      expect(isPointInsideAoE({ x: 25, y: 10 }, AoEShape.CONE, size, origin, 0)).toBe(true);
      // Beyond length (length = 30)
      expect(isPointInsideAoE({ x: 45, y: 10 }, AoEShape.CONE, size, origin, 0)).toBe(false);
      // Behind cone origin
      expect(isPointInsideAoE({ x: 5, y: 10 }, AoEShape.CONE, size, origin, 0)).toBe(false);
    });

    it('detects point in cone along positive Y axis (angle = PI/2)', () => {
      expect(isPointInsideAoE({ x: 10, y: 30 }, AoEShape.CONE, size, origin, Math.PI / 2)).toBe(true);
      expect(isPointInsideAoE({ x: 30, y: 10 }, AoEShape.CONE, size, origin, Math.PI / 2)).toBe(false);
    });
  });

  describe('isPointInsideAoE - Line', () => {
    const origin = { x: 0, y: 0 };
    const size = { length: 60, width: 5 };

    it('detects points inside 5ft line corridor', () => {
      expect(isPointInsideAoE({ x: 30, y: 0 }, AoEShape.LINE, size, origin, 0)).toBe(true);
      expect(isPointInsideAoE({ x: 30, y: 2 }, AoEShape.LINE, size, origin, 0)).toBe(true);
      expect(isPointInsideAoE({ x: 30, y: 3 }, AoEShape.LINE, size, origin, 0)).toBe(false); // outside 5ft width
      expect(isPointInsideAoE({ x: 65, y: 0 }, AoEShape.LINE, size, origin, 0)).toBe(false); // beyond 60ft length
    });
  });

  describe('isPointInsideAoE - Cube', () => {
    const origin = { x: 0, y: 0 };
    const size = { side: 15 };

    it('detects points in 15ft cube facing positive X axis', () => {
      expect(isPointInsideAoE({ x: 7.5, y: 0 }, AoEShape.CUBE, size, origin, 0)).toBe(true);
      expect(isPointInsideAoE({ x: 7.5, y: 7 }, AoEShape.CUBE, size, origin, 0)).toBe(true);
      expect(isPointInsideAoE({ x: 7.5, y: 8 }, AoEShape.CUBE, size, origin, 0)).toBe(false); // beyond 15ft side
      expect(isPointInsideAoE({ x: 16, y: 0 }, AoEShape.CUBE, size, origin, 0)).toBe(false);
    });
  });

  describe('calculateCoverageRatio and findAffectedTokens', () => {
    it('accurately detects token 100% inside circle AoE', () => {
      const template = {
        shape: AoEShape.CIRCLE,
        size: { radius: 20 },
      };
      const originFeet = { x: 20, y: 20 };
      const tokens: TokenTarget[] = [
        { id: 'token-1', name: 'Goblin 1', x: 4, y: 4, size: 1 }, // 20ft, 20ft -> inside center
        { id: 'token-2', name: 'Dragon', x: 20, y: 20, size: 3 }, // far away (100ft)
      ];

      const results = findAffectedTokens(template, originFeet, 0, tokens);
      expect(results).toHaveLength(2);
      expect(results[0].tokenId).toBe('token-1');
      expect(results[0].isAffected).toBe(true);
      expect(results[0].coverageRatio).toBe(1);

      expect(results[1].tokenId).toBe('token-2');
      expect(results[1].isAffected).toBe(false);
      expect(results[1].coverageRatio).toBe(0);
    });

    it('satisfies D&D 5e DMG 50% rule for partial coverage', () => {
      const template = {
        shape: AoEShape.CIRCLE,
        size: { radius: 10 },
      };
      const originFeet = { x: 0, y: 0 };
      // Cell from x: 5 to 10, y: -2.5 to 2.5
      // Most of it is inside radius 10
      const ratio = calculateCoverageRatio(
        { x: 5, y: -2.5 },
        5,
        5,
        AoEShape.CIRCLE,
        template.size,
        originFeet
      );
      expect(ratio).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('default templates', () => {
    it('contains D&D 5e standard spells', () => {
      const dnd = DEFAULT_SPELL_TEMPLATES.DND_5E;
      expect(dnd.find((t) => t.name === 'Fireball')).toBeDefined();
      expect(dnd.find((t) => t.name === 'Burning Hands')).toBeDefined();
      expect(dnd.find((t) => t.name === 'Lightning Bolt')).toBeDefined();
      expect(dnd.find((t) => t.name === 'Thunderwave')).toBeDefined();
      expect(dnd.find((t) => t.name === 'Spirit Guardians')).toBeDefined();
    });

    it('contains Pathfinder 2e standard spells', () => {
      const pf2e = DEFAULT_SPELL_TEMPLATES.PATHFINDER_2E;
      expect(pf2e.find((t) => t.name === 'Fireball')).toBeDefined();
      expect(pf2e.find((t) => t.name === 'Cone of Cold')).toBeDefined();
    });
  });
});
