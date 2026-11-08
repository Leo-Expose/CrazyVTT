// ============================================
// Party Vision Merge Tests
// ============================================

import type { FogState } from '../../../types/walls';
import { unionExplorations } from '../workerManager';
import { revealedCellIndices } from '../../../websocket/shared';

describe('Party Vision Merge', () => {
  const createFogState = (revealedCells: number[], cols = 10, rows = 10): FogState => ({
    fogCols: cols,
    fogRows: rows,
    cellPx: 32,
    revealed: new Array(cols * rows).fill(false).map((_, i) => revealedCells.includes(i)),
  });

  describe('unionExplorations', () => {
    it('should return empty for no explorations', () => {
      const result = unionExplorations([]);
      expect(result.revealed).toEqual([]);
      expect(result.fogCols).toBe(0);
    });

    it('should return single exploration unchanged', () => {
      const fog = createFogState([1, 2, 3]);
      const result = unionExplorations([{ userId: 'user1', explored: fog }]);
      
      expect(result.revealed[1]).toBe(true);
      expect(result.revealed[2]).toBe(true);
      expect(result.revealed[3]).toBe(true);
      expect(result.revealed[4]).toBe(false);
    });

    it('should union two explorations', () => {
      const fog1 = createFogState([1, 2, 3]);
      const fog2 = createFogState([3, 4, 5]);
      
      const result = unionExplorations([
        { userId: 'user1', explored: fog1 },
        { userId: 'user2', explored: fog2 },
      ]);
      
      expect(result.revealed[1]).toBe(true);
      expect(result.revealed[2]).toBe(true);
      expect(result.revealed[3]).toBe(true);
      expect(result.revealed[4]).toBe(true);
      expect(result.revealed[5]).toBe(true);
      expect(result.revealed[6]).toBe(false);
    });

    it('should union three explorations', () => {
      const fog1 = createFogState([1, 2]);
      const fog2 = createFogState([2, 3]);
      const fog3 = createFogState([3, 4]);
      
      const result = unionExplorations([
        { userId: 'user1', explored: fog1 },
        { userId: 'user2', explored: fog2 },
        { userId: 'user3', explored: fog3 },
      ]);
      
      expect(result.revealed[1]).toBe(true);
      expect(result.revealed[2]).toBe(true);
      expect(result.revealed[3]).toBe(true);
      expect(result.revealed[4]).toBe(true);
      expect(result.revealed[5]).toBe(false);
    });

    it('should handle different grid sizes by using first exploration as base', () => {
      const fog1 = createFogState([1, 2], 10, 10);
      const fog2 = createFogState([1, 2], 20, 20); // Different size but same revealed pattern
      
      const result = unionExplorations([
        { userId: 'user1', explored: fog1 },
        { userId: 'user2', explored: fog2 },
      ]);
      
      expect(result.fogCols).toBe(10);
      expect(result.fogRows).toBe(10);
    });

    it('should preserve cellPx from first exploration', () => {
      const fog1 = createFogState([1], 10, 10);
      const fog2 = createFogState([2], 10, 10);
      
      const result = unionExplorations([
        { userId: 'user1', explored: fog1 },
        { userId: 'user2', explored: fog2 },
      ]);
      
      expect(result.cellPx).toBe(32);
    });
  });

  describe('revealedCellIndices', () => {
    it('should return indices of revealed cells', () => {
      const fog: FogState = {
        fogCols: 5,
        fogRows: 5,
        cellPx: 32,
        revealed: [
          false, true, false, false, false,
          false, false, true, false, false,
          false, false, false, false, false,
          true, false, false, false, false,
          false, false, false, true, false,
        ],
      };
      
      const indices = revealedCellIndices(fog);
      expect(indices).toEqual([1, 7, 15, 23]);
    });

    it('should return empty for all hidden', () => {
      const fog: FogState = {
        fogCols: 3,
        fogRows: 3,
        cellPx: 32,
        revealed: new Array(9).fill(false),
      };
      
      const indices = revealedCellIndices(fog);
      expect(indices).toEqual([]);
    });

    it('should return all for all revealed', () => {
      const fog: FogState = {
        fogCols: 2,
        fogRows: 2,
        cellPx: 32,
        revealed: new Array(4).fill(true),
      };
      
      const indices = revealedCellIndices(fog);
      expect(indices).toEqual([0, 1, 2, 3]);
    });
  });
});