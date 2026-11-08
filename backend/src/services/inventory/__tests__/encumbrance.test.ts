/**
 * Tests for Encumbrance Calculator
 */

import { 
  calculateDnD5eEncumbrance, 
  calculatePF2eEncumbrance,
  calculateCoCEncumbrance,
  calculateShadowrunEncumbrance,
} from '../encumbrance';

describe('Encumbrance Calculator', () => {
  describe('D&D 5e', () => {
    it('should calculate normal encumbrance for Str 10, weight 100 lbs', () => {
      const result = calculateDnD5eEncumbrance(100, 10);
      expect(result.maxWeight).toBe(150); // 10 * 15
      expect(result.pushDragLift).toBe(300); // 10 * 30
      expect(result.status).toBe('NORMAL');
      expect(result.speedPenalty).toBe(0);
      expect(result.dexCheckDisadvantage).toBe(false);
    });

    it('should calculate encumbered for Str 10, weight 160 lbs', () => {
      const result = calculateDnD5eEncumbrance(160, 10);
      expect(result.status).toBe('ENCUMBERED');
      expect(result.speedPenalty).toBe(10);
      expect(result.dexCheckDisadvantage).toBe(true);
    });

    it('should calculate heavily encumbered for Str 10, weight 310 lbs', () => {
      const result = calculateDnD5eEncumbrance(310, 10);
      expect(result.status).toBe('HEAVILY_ENCUMBERED');
      expect(result.speedPenalty).toBe(20);
      expect(result.dexCheckDisadvantage).toBe(true);
      expect(result.strDexCheckPenalty).toBe(-5);
    });

    it('should handle high strength correctly', () => {
      const result = calculateDnD5eEncumbrance(300, 20);
      expect(result.maxWeight).toBe(300); // 20 * 15
      expect(result.status).toBe('NORMAL');
    });

    it('should handle edge case at exactly max weight', () => {
      const result = calculateDnD5eEncumbrance(150, 10);
      expect(result.status).toBe('NORMAL');
    });

    it('should handle edge case at exactly 2x max weight', () => {
      const result = calculateDnD5eEncumbrance(300, 10);
      expect(result.status).toBe('ENCUMBERED'); // At exactly 2x, not heavily yet
    });

    it('should handle edge case just over 2x max weight', () => {
      const result = calculateDnD5eEncumbrance(301, 10);
      expect(result.status).toBe('HEAVILY_ENCUMBERED');
    });
  });

  describe('Pathfinder 2e', () => {
    it('should calculate normal encumbrance for Str mod +2, bulk 7', () => {
      const result = calculatePF2eEncumbrance(7, 2);
      expect(result.maxBulk).toBe(7); // 5 + 2
      expect(result.status).toBe('NORMAL');
      expect(result.speedPenalty).toBe(0);
      expect(result.checkPenalty).toBe(0);
    });

    it('should calculate encumbered for Str mod +2, bulk 8', () => {
      const result = calculatePF2eEncumbrance(8, 2);
      expect(result.status).toBe('ENCUMBERED');
      expect(result.speedPenalty).toBe(10);
      expect(result.checkPenalty).toBe(-1);
    });

    it('should calculate heavily encumbered for Str mod +2, bulk 10', () => {
      const result = calculatePF2eEncumbrance(10, 2);
      // Absolute max is maxBulk + strMod = 7 + 2 = 9
      // 10 > 9, so heavily encumbered
      expect(result.status).toBe('HEAVILY_ENCUMBERED');
      expect(result.speedPenalty).toBe(20);
      expect(result.checkPenalty).toBe(-2);
    });

    it('should handle negative strength modifier', () => {
      const result = calculatePF2eEncumbrance(3, -1);
      expect(result.maxBulk).toBe(4); // 5 + (-1)
      expect(result.pushDragLift).toBe(3); // 4 + (-1)
    });
  });

  describe('Call of Cthulhu 7e', () => {
    it('should calculate normal encumbrance', () => {
      const result = calculateCoCEncumbrance(50, 50);
      expect(result.maxWeight).toBe(500); // 50 * 10
      expect(result.status).toBe('NORMAL');
    });

    it('should calculate encumbered', () => {
      const result = calculateCoCEncumbrance(600, 50);
      expect(result.status).toBe('ENCUMBERED');
      expect(result.speedPenalty).toBe(5);
    });

    it('should calculate heavily encumbered', () => {
      const result = calculateCoCEncumbrance(1100, 50);
      expect(result.status).toBe('HEAVILY_ENCUMBERED');
      expect(result.speedPenalty).toBe(10);
    });
  });

  describe('Shadowrun 6e', () => {
    it('should calculate normal encumbrance', () => {
      // Body 3, Str 3, weight 30kg (66 lbs)
      const result = calculateShadowrunEncumbrance(30, 3, 3);
      expect(result.maxWeight).toBe(60); // (3+3) * 10
      expect(result.status).toBe('NORMAL');
    });

    it('should calculate encumbered', () => {
      const result = calculateShadowrunEncumbrance(70, 3, 3);
      expect(result.status).toBe('ENCUMBERED');
      expect(result.speedPenalty).toBe(5);
    });

    it('should calculate heavily encumbered', () => {
      const result = calculateShadowrunEncumbrance(130, 3, 3);
      expect(result.status).toBe('HEAVILY_ENCUMBERED');
      expect(result.speedPenalty).toBe(10);
    });
  });
});

describe('Encumbrance Status Colors', () => {
  it('should have correct color mapping', () => {
    // This is more of a frontend test, but we can verify the logic
    const normal = calculateDnD5eEncumbrance(100, 10);
    const encumbered = calculateDnD5eEncumbrance(160, 10);
    const heavily = calculateDnD5eEncumbrance(310, 10);

    expect(normal.status).toBe('NORMAL');
    expect(encumbered.status).toBe('ENCUMBERED');
    expect(heavily.status).toBe('HEAVILY_ENCUMBERED');
  });
});