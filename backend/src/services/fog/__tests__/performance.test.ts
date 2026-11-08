// ============================================
// Fog Performance Tests
// ============================================

import type { FogState } from '../../../types/walls';
import {
  calculateConeCells,
  calculateRadiusCells,
  calculateLineCells,
  calculateCubeCells,
  calculateCustomCells,
} from '../shapes';
import {
  revealChunkedCells,
  createChunkedFogGrid,
  chunkedToFogState,
  fogStateToChunked,
  getDirtyChunks,
} from '../chunkedGrid';

// Large fog state for performance testing: 100x100 grid
const largeFog: FogState = {
  fogCols: 100,
  fogRows: 100,
  cellPx: 32,
  revealed: new Array(10000).fill(false),
};

describe('Fog Performance', () => {
  describe('Shape Calculation Performance', () => {
    it('should calculate cone in reasonable time', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        calculateConeCells(largeFog, {
          origin: { col: 50, row: 50 },
          direction: { col: Math.cos(i * 0.1), row: Math.sin(i * 0.1) },
          angleDegrees: 60,
          length: 20,
        });
      }
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100); // 100 calculations in < 100ms
    });

    it('should calculate radius in reasonable time', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        calculateRadiusCells(largeFog, {
          center: { col: 50, row: 50 },
          radius: 15 + i % 10,
        });
      }
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(250);
    });

    it('should calculate line in reasonable time', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        calculateLineCells(largeFog, {
          start: { col: 10, row: 10 },
          end: { col: 90, row: 90 },
          width: 2,
        });
      }
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(250);
    });

    it('should calculate cube in reasonable time', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        calculateCubeCells(largeFog, {
          origin: { col: 40, row: 40 },
          size: 20,
          rotationDegrees: i * 5,
        });
      }
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    it('should calculate custom polygon in reasonable time', () => {
      const start = performance.now();
      
      for (let i = 0; i < 50; i++) {
        calculateCustomCells(largeFog, {
          points: [
            { col: 30, row: 30 },
            { col: 70, row: 30 },
            { col: 70, row: 70 },
            { col: 30, row: 70 },
            { col: 40, row: 40 },
            { col: 60, row: 60 },
          ],
        });
      }
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Chunked Grid Performance', () => {
    it('should handle many cell operations efficiently', () => {
      const fog = { fogCols: 100, fogRows: 100, cellPx: 32, revealed: new Array(10000).fill(false) };
      const grid = createChunkedFogGrid(fog);
      
      const start = performance.now();
      
      // Reveal 10000 cells in batches
      for (let batch = 0; batch < 10; batch++) {
        const cells: number[] = [];
        for (let i = 0; i < 1000; i++) {
          cells.push(batch * 1000 + i);
        }
        revealChunkedCells(grid, cells);
      }
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50); // 10k cells in < 50ms
    });

    it('should convert to/from chunked grid efficiently', () => {
      const fog: FogState = {
        fogCols: 100,
        fogRows: 100,
        cellPx: 32,
        revealed: new Array(10000).fill(false).map((_, i) => i % 3 === 0),
      };
      
      const start = performance.now();
      
      for (let i = 0; i < 10; i++) {
        const grid = fogStateToChunked(fog);
        const result = chunkedToFogState(grid);
        expect(result.revealed).toEqual(fog.revealed);
      }
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(250); // 10 round-trips in < 250ms
    });

    it('should handle dirty chunk tracking efficiently', () => {
      const fog = { fogCols: 100, fogRows: 100, cellPx: 32, revealed: new Array(10000).fill(false) };
      const grid = createChunkedFogGrid(fog);
      
      const start = performance.now();
      
      // Random reveals
      for (let i = 0; i < 1000; i++) {
        revealChunkedCells(grid, [Math.floor(Math.random() * 10000)]);
      }
      
      // Get dirty chunks
      const dirty = getDirtyChunks(grid);
      expect(dirty.length).toBeGreaterThan(0);
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Memory Efficiency', () => {
    it('should use compact chunk storage', () => {
      const fog = { fogCols: 100, fogRows: 100, cellPx: 32, revealed: new Array(10000).fill(false) };
      const grid = createChunkedFogGrid(fog);
      
      // Reveal all cells
      revealChunkedCells(grid, Array.from({ length: 10000 }, (_, i) => i));
      
      // Each chunk is 32x32 = 1024 bits = 128 bytes
      // 100x100 grid has 4x4 = 16 chunks
      // Total = 16 * 128 = 2048 bytes + overhead
      let totalBytes = 0;
      for (const chunk of grid.chunks.values()) {
        totalBytes += chunk.revealed.byteLength;
      }
      
      expect(totalBytes).toBeLessThan(5000); // Well under 5KB for full 100x100
    });
  });
});