import { describe, it, expect } from 'vitest';
import {
  AoEShape,
  DEFAULT_SPELL_TEMPLATES,
  snapToIntersection,
  snapToCellCenter,
  isPointInsideAoE,
  findAffectedTokens,
  type TokenTarget,
} from '../rules/spellAoE';

describe('spellAoE frontend utility tests', () => {
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

  describe('isPointInsideAoE - Shapes', () => {
    const origin = { x: 20, y: 20 };
    const circleSize = { radius: 20 };

    it('identifies points within radius as inside circle', () => {
      expect(isPointInsideAoE({ x: 20, y: 20 }, AoEShape.CIRCLE, circleSize, origin)).toBe(true);
      expect(isPointInsideAoE({ x: 40, y: 20 }, AoEShape.CIRCLE, circleSize, origin)).toBe(true);
      expect(isPointInsideAoE({ x: 40.1, y: 20 }, AoEShape.CIRCLE, circleSize, origin)).toBe(false);
    });

    it('handles cone shape direction', () => {
      const coneSize = { length: 30 };
      expect(isPointInsideAoE({ x: 35, y: 20 }, AoEShape.CONE, coneSize, origin, 0)).toBe(true);
      expect(isPointInsideAoE({ x: 55, y: 20 }, AoEShape.CONE, coneSize, origin, 0)).toBe(false);
    });

    it('handles line shape', () => {
      const lineSize = { length: 60, width: 5 };
      expect(isPointInsideAoE({ x: 50, y: 20 }, AoEShape.LINE, lineSize, origin, 0)).toBe(true);
      expect(isPointInsideAoE({ x: 50, y: 24 }, AoEShape.LINE, lineSize, origin, 0)).toBe(false);
    });
  });

  describe('coverage & affected tokens', () => {
    it('detects affected tokens in circle AoE', () => {
      const template = {
        shape: AoEShape.CIRCLE,
        size: { radius: 20 },
      };
      const originFeet = { x: 20, y: 20 };
      const tokens: TokenTarget[] = [
        { id: 'token-1', name: 'Goblin', x: 4, y: 4, size: 1 },
        { id: 'token-2', name: 'Ogre', x: 50, y: 50, size: 2 },
      ];

      const results = findAffectedTokens(template, originFeet, 0, tokens);
      expect(results[0].isAffected).toBe(true);
      expect(results[1].isAffected).toBe(false);
    });
  });

  describe('default templates', () => {
    it('provides standard spell lists', () => {
      expect(DEFAULT_SPELL_TEMPLATES.DND_5E.length).toBeGreaterThanOrEqual(5);
      expect(DEFAULT_SPELL_TEMPLATES.PATHFINDER_2E.length).toBeGreaterThanOrEqual(3);
    });
  });
});
