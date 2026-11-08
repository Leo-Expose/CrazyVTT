// ============================================
// Fog Shape Calculation Tests
// ============================================

import type { FogState } from '../../../types/walls';
import {
  calculateConeCells,
  calculateRadiusCells,
  calculateLineCells,
  calculateCubeCells,
  calculateSphereCells,
  calculateCustomCells,
  calculateFogShapeCells,
  validateShapeParams,
} from '../shapes';

// Test fog state: 20x20 grid, 32px per cell
const testFog: FogState = {
  fogCols: 20,
  fogRows: 20,
  cellPx: 32,
  revealed: new Array(400).fill(false),
};

describe('Fog Shape Calculations', () => {
  describe('Cone', () => {
    it('should calculate a basic cone shape', () => {
      const result = calculateConeCells(testFog, {
        origin: { col: 10, row: 10 },
        direction: { col: 1, row: 0 }, // Right
        angleDegrees: 90,
        length: 5,
      });

      expect(result.cells.length).toBeGreaterThan(0);
      expect(result.bounds.minCol).toBeLessThanOrEqual(result.bounds.maxCol);
      expect(result.bounds.minRow).toBeLessThanOrEqual(result.bounds.maxRow);
    });

    it('should handle cone pointing up', () => {
      const result = calculateConeCells(testFog, {
        origin: { col: 10, row: 10 },
        direction: { col: 0, row: -1 }, // Up
        angleDegrees: 60,
        length: 4,
      });

      expect(result.cells.length).toBeGreaterThan(0);
      // Cone should extend upward
      for (const cellIdx of result.cells) {
        const row = Math.floor(cellIdx / 20);
        expect(row).toBeLessThanOrEqual(10);
      }
    });

    it('should handle zero direction vector', () => {
      const result = calculateConeCells(testFog, {
        origin: { col: 10, row: 10 },
        direction: { col: 0, row: 0 },
        angleDegrees: 90,
        length: 5,
      });

      expect(result.cells).toEqual([]);
    });

    it('should respect angle bounds', () => {
      const narrow = calculateConeCells(testFog, {
        origin: { col: 10, row: 10 },
        direction: { col: 1, row: 0 },
        angleDegrees: 10,
        length: 5,
      });

      const wide = calculateConeCells(testFog, {
        origin: { col: 10, row: 10 },
        direction: { col: 1, row: 0 },
        angleDegrees: 120,
        length: 5,
      });

      expect(wide.cells.length).toBeGreaterThan(narrow.cells.length);
    });
  });

  describe('Radius/Circle', () => {
    it('should calculate a circle around center', () => {
      const result = calculateRadiusCells(testFog, {
        center: { col: 10, row: 10 },
        radius: 3,
      });

      // Approximate area of circle with radius 3: π * 9 ≈ 28 cells
      expect(result.cells.length).toBeGreaterThan(20);
      expect(result.cells.length).toBeLessThan(50);
    });

    it('should be symmetric', () => {
      const result = calculateRadiusCells(testFog, {
        center: { col: 10, row: 10 },
        radius: 2,
      });

      // Check that cells are distributed around center
      const centerRow = 10;
      const centerCol = 10;
      
      for (const cellIdx of result.cells) {
        const row = Math.floor(cellIdx / 20);
        const col = cellIdx % 20;
        const distSq = (row - centerRow) ** 2 + (col - centerCol) ** 2;
        // Should be within radius + 0.5 tolerance
        expect(distSq).toBeLessThanOrEqual(2.5 ** 2);
      }
    });

    it('should handle edge of map', () => {
      const result = calculateRadiusCells(testFog, {
        center: { col: 0, row: 0 },
        radius: 3,
      });

      // All cells should be within bounds
      for (const cellIdx of result.cells) {
        expect(cellIdx).toBeGreaterThanOrEqual(0);
        expect(cellIdx).toBeLessThan(400);
      }
    });
  });

  describe('Line', () => {
    it('should calculate a horizontal line', () => {
      const result = calculateLineCells(testFog, {
        start: { col: 5, row: 10 },
        end: { col: 15, row: 10 },
        width: 1,
      });

      expect(result.cells.length).toBe(11); // 5 to 15 inclusive = 11 cells
      
      for (const cellIdx of result.cells) {
        const row = Math.floor(cellIdx / 20);
        const col = cellIdx % 20;
        expect(row).toBe(10);
        expect(col).toBeGreaterThanOrEqual(5);
        expect(col).toBeLessThanOrEqual(15);
      }
    });

    it('should calculate a vertical line', () => {
      const result = calculateLineCells(testFog, {
        start: { col: 10, row: 5 },
        end: { col: 10, row: 15 },
        width: 1,
      });

      expect(result.cells.length).toBe(11);
      
      for (const cellIdx of result.cells) {
        const row = Math.floor(cellIdx / 20);
        const col = cellIdx % 20;
        expect(col).toBe(10);
        expect(row).toBeGreaterThanOrEqual(5);
        expect(row).toBeLessThanOrEqual(15);
      }
    });

    it('should calculate a diagonal line', () => {
      const result = calculateLineCells(testFog, {
        start: { col: 5, row: 5 },
        end: { col: 15, row: 15 },
        width: 1,
      });

      expect(result.cells.length).toBeGreaterThan(0);
    });

    it('should handle zero-length line', () => {
      const result = calculateLineCells(testFog, {
        start: { col: 10, row: 10 },
        end: { col: 10, row: 10 },
        width: 1,
      });

      // Should degenerate to a circle
      expect(result.cells.length).toBeGreaterThan(0);
    });

    it('should respect width', () => {
      const thin = calculateLineCells(testFog, {
        start: { col: 5, row: 10 },
        end: { col: 15, row: 10 },
        width: 1,
      });

      const thick = calculateLineCells(testFog, {
        start: { col: 5, row: 10 },
        end: { col: 15, row: 10 },
        width: 3,
      });

      expect(thick.cells.length).toBeGreaterThan(thin.cells.length);
    });
  });

  describe('Cube/Square', () => {
    it('should calculate an axis-aligned cube', () => {
      const result = calculateCubeCells(testFog, {
        origin: { col: 5, row: 5 },
        size: 3,
      });

      expect(result.cells.length).toBe(9); // 3x3
      
      for (const cellIdx of result.cells) {
        const row = Math.floor(cellIdx / 20);
        const col = cellIdx % 20;
        expect(col).toBeGreaterThanOrEqual(5);
        expect(col).toBeLessThanOrEqual(7);
        expect(row).toBeGreaterThanOrEqual(5);
        expect(row).toBeLessThanOrEqual(7);
      }
    });

    it('should handle rotation', () => {
      const result = calculateCubeCells(testFog, {
        origin: { col: 8, row: 8 },
        size: 4,
        rotationDegrees: 45,
      });

      expect(result.cells.length).toBeGreaterThan(0);
    });

    it('should handle edge of map', () => {
      const result = calculateCubeCells(testFog, {
        origin: { col: 18, row: 18 },
        size: 5,
      });

      for (const cellIdx of result.cells) {
        expect(cellIdx).toBeGreaterThanOrEqual(0);
        expect(cellIdx).toBeLessThan(400);
      }
    });
  });

  describe('Sphere', () => {
    it('should behave like radius for 2D projection', () => {
      const sphereResult = calculateSphereCells(testFog, {
        center: { col: 10, row: 10 },
        radius: 3,
      });

      const radiusResult = calculateRadiusCells(testFog, {
        center: { col: 10, row: 10 },
        radius: 3,
      });

      expect(sphereResult.cells.length).toBe(radiusResult.cells.length);
    });
  });

  describe('Custom Polygon', () => {
    it('should calculate a triangle', () => {
      const result = calculateCustomCells(testFog, {
        points: [
          { col: 10, row: 5 },
          { col: 5, row: 15 },
          { col: 15, row: 15 },
        ],
      });

      expect(result.cells.length).toBeGreaterThan(0);
      
      // All cells should be within the triangle bounds
      for (const cellIdx of result.cells) {
        const row = Math.floor(cellIdx / 20);
        const col = cellIdx % 20;
        expect(row).toBeGreaterThanOrEqual(5);
        expect(row).toBeLessThanOrEqual(15);
        expect(col).toBeGreaterThanOrEqual(5);
        expect(col).toBeLessThanOrEqual(15);
      }
    });

    it('should handle rectangle', () => {
      const result = calculateCustomCells(testFog, {
        points: [
          { col: 5, row: 5 },
          { col: 15, row: 5 },
          { col: 15, row: 15 },
          { col: 5, row: 15 },
        ],
      });

      expect(result.cells.length).toBe(10 * 10); // 10x10 cells covered by [5, 15] x [5, 15] grid cell boundaries
    });

    it('should reject invalid polygons', () => {
      const result = calculateCustomCells(testFog, {
        points: [
          { col: 10, row: 10 },
          { col: 11, row: 11 },
        ],
      });

      expect(result.cells).toEqual([]);
    });
  });

  describe('Validation', () => {
    it('should validate cone parameters', () => {
      const valid = validateShapeParams(testFog, {
        type: 'cone',
        params: {
          origin: { col: 10, row: 10 },
          direction: { col: 1, row: 0 },
          angleDegrees: 60,
          length: 5,
        },
      });

      expect(valid.valid).toBe(true);
    });

    it('should reject cone with zero direction', () => {
      const invalid = validateShapeParams(testFog, {
        type: 'cone',
        params: {
          origin: { col: 10, row: 10 },
          direction: { col: 0, row: 0 },
          angleDegrees: 60,
          length: 5,
        },
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain('direction');
    });

    it('should reject out-of-bounds origin', () => {
      const invalid = validateShapeParams(testFog, {
        type: 'cone',
        params: {
          origin: { col: 25, row: 10 },
          direction: { col: 1, row: 0 },
          angleDegrees: 60,
          length: 5,
        },
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain('outside fog grid');
    });

    it('should validate radius parameters', () => {
      const valid = validateShapeParams(testFog, {
        type: 'radius',
        params: {
          center: { col: 10, row: 10 },
          radius: 5,
        },
      });

      expect(valid.valid).toBe(true);
    });

    it('should reject negative radius', () => {
      const invalid = validateShapeParams(testFog, {
        type: 'radius',
        params: {
          center: { col: 10, row: 10 },
          radius: -1,
        },
      });

      expect(invalid.valid).toBe(false);
    });
  });

  describe('Main entry point', () => {
    it('should dispatch to correct calculator', () => {
      const coneResult = calculateFogShapeCells(testFog, {
        type: 'cone',
        params: {
          origin: { col: 10, row: 10 },
          direction: { col: 1, row: 0 },
          angleDegrees: 90,
          length: 5,
        },
      });

      const radiusResult = calculateFogShapeCells(testFog, {
        type: 'radius',
        params: {
          center: { col: 10, row: 10 },
          radius: 3,
        },
      });

      expect(coneResult.cells.length).toBeGreaterThan(0);
      expect(radiusResult.cells.length).toBeGreaterThan(0);
    });
  });
});