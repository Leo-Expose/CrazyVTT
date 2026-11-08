// ============================================
// Chunked Fog Grid Tests
// ============================================

import type { FogState } from '../../../types/walls';
import {
  createChunkedFogGrid,
  revealChunkedCells,
  hideChunkedCells,
  revealAllChunked,
  hideAllChunked,
  chunkedToFogState,
  fogStateToChunked,
  getDirtyChunks,
  getLODFog,
  FOG_CHUNK_SIZE,
} from '../chunkedGrid';

describe('Chunked Fog Grid', () => {
  const createTestFog = (cols = 64, rows = 64): FogState => ({
    fogCols: cols,
    fogRows: rows,
    cellPx: 32,
    revealed: new Array(cols * rows).fill(false),
  });

  describe('createChunkedFogGrid', () => {
    it('should create grid with correct chunk dimensions', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      expect(grid.fogCols).toBe(64);
      expect(grid.fogRows).toBe(64);
      expect(grid.chunkCols).toBe(2); // 64/32 = 2
      expect(grid.chunkRows).toBe(2);
      expect(grid.chunks.size).toBe(0); // No chunks created yet
    });

    it('should handle non-divisible dimensions', () => {
      const fog = createTestFog(50, 50);
      const grid = createChunkedFogGrid(fog);
      
      expect(grid.chunkCols).toBe(2); // ceil(50/32) = 2
      expect(grid.chunkRows).toBe(2);
    });
  });

  describe('revealChunkedCells', () => {
    it('should reveal cells in a single chunk', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      // Reveal cells in chunk (0,0) - top-left 2x2 cells (row 0: cols 0,1; row 1: cols 0,1)
      revealChunkedCells(grid, [0, 1, 64, 65]);
      
      expect(grid.chunks.size).toBe(1);
      const chunk = grid.chunks.get('0,0');
      expect(chunk).toBeDefined();
      expect(chunk!.dirty).toBe(true);
    });

    it('should reveal cells across multiple chunks', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      // Reveal cells in chunk (0,0) and (1,0)
      revealChunkedCells(grid, [0, 1, 32, 33, 35, 36, 67, 68]);
      
      expect(grid.chunks.size).toBe(2);
    });

    it('should not duplicate cells', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      revealChunkedCells(grid, [0, 0, 0]); // Same cell multiple times
      
      const chunk = grid.chunks.get('0,0');
      expect(chunk).toBeDefined();
      // Should only count once
    });

    it('should increment version', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      const initialVersion = grid.version;
      revealChunkedCells(grid, [0]);
      
      expect(grid.version).toBe(initialVersion + 1);
    });
  });

  describe('hideChunkedCells', () => {
    it('should hide previously revealed cells', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      revealChunkedCells(grid, [0, 1, 2, 3]);
      hideChunkedCells(grid, [1, 2]);
      
      const chunk = grid.chunks.get('0,0');
      expect(chunk).toBeDefined();
      
      // Convert back to check
      const resultFog = chunkedToFogState(grid);
      expect(resultFog.revealed[0]).toBe(true);
      expect(resultFog.revealed[1]).toBe(false);
      expect(resultFog.revealed[2]).toBe(false);
      expect(resultFog.revealed[3]).toBe(true);
    });

    it('should handle hiding non-existent cells gracefully', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      // Hide cells that were never revealed
      hideChunkedCells(grid, [0, 1, 2]);
      
      const resultFog = chunkedToFogState(grid);
      expect(resultFog.revealed.every((v: boolean) => !v)).toBe(true);
    });
  });

  describe('revealAllChunked / hideAllChunked', () => {
    it('should reveal all cells in all chunks', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      revealChunkedCells(grid, [0, 100, 2000, 4000]);
      revealAllChunked(grid);
      
      const resultFog = chunkedToFogState(grid);
      expect(resultFog.revealed.every((v: boolean) => v)).toBe(true);
    });

  it('should hide all cells', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      revealAllChunked(grid);
      hideAllChunked(grid);
      
      const resultFog = chunkedToFogState(grid);
      expect(resultFog.revealed.every((v: boolean) => !v)).toBe(true);
    });
  });

  describe('chunkedToFogState / fogStateToChunked', () => {
    it('should round-trip fog state', () => {
      const fog = createTestFog(64, 64);
      // Reveal some cells
      fog.revealed[0] = true;
      fog.revealed[1] = true;
      fog.revealed[100] = true;
      fog.revealed[4000] = true;
      
      const grid = fogStateToChunked(fog);
      const resultFog = chunkedToFogState(grid);
      
      expect(resultFog.fogCols).toBe(fog.fogCols);
      expect(resultFog.fogRows).toBe(fog.fogRows);
      expect(resultFog.cellPx).toBe(fog.cellPx);
      expect(resultFog.revealed).toEqual(fog.revealed);
    });

    it('should handle partial chunks at edges', () => {
      const fog = createTestFog(50, 50);
      fog.revealed[0] = true;
      fog.revealed[49] = true; // Last cell of first row
      fog.revealed[2450] = true; // First cell of last row
      fog.revealed[2499] = true; // Last cell
      
      const grid = fogStateToChunked(fog);
      const resultFog = chunkedToFogState(grid);
      
      expect(resultFog.revealed).toEqual(fog.revealed);
    });
  });

  describe('getDirtyChunks', () => {
    it('should return only dirty chunks', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      revealChunkedCells(grid, [0, 1]); // Chunk (0,0) dirty
      revealChunkedCells(grid, [35, 36]); // Chunk (1,0) dirty
      
      const dirty = getDirtyChunks(grid);
      expect(dirty.length).toBe(2);
      
      // Second call should return empty (dirty flags reset)
      const dirty2 = getDirtyChunks(grid);
      expect(dirty2.length).toBe(0);
    });

    it('should not return clean chunks', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      // Create a chunk but don't modify it
      grid.chunks.get('0,0');
      
      const dirty = getDirtyChunks(grid);
      expect(dirty.length).toBe(0);
    });
  });

  describe('getLODFog', () => {
    it('should return full resolution at LOD 0', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      revealChunkedCells(grid, [0, 1, 2, 3]);
      
      const lod = getLODFog(grid, 0);
      expect(lod.scale).toBe(1);
      expect(lod.revealed.length).toBe(4096);
    });

    it('should downsample at LOD 1', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      // Reveal a 4x4 block
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          revealChunkedCells(grid, [y * 64 + x]);
        }
      }
      
      const lod = getLODFog(grid, 1);
      expect(lod.scale).toBe(2);
      expect(lod.revealed.length).toBe(32 * 32); // 1024
      
      // Should have revealed cells at downsampled positions
      expect(lod.revealed[0]).toBe(true); // Top-left 2x2 maps to first LOD cell
    });

    it('should downsample at higher LOD levels', () => {
      const fog = createTestFog(64, 64);
      const grid = createChunkedFogGrid(fog);
      
      revealAllChunked(grid);
      
      const lod2 = getLODFog(grid, 2);
      expect(lod2.scale).toBe(4);
      expect(lod2.revealed.length).toBe(16 * 16); // 256
      expect(lod2.revealed.every((v: boolean) => v)).toBe(true);
    });
  });

  describe('FOG_CHUNK_SIZE constant', () => {
    it('should be 32', () => {
      expect(FOG_CHUNK_SIZE).toBe(32);
    });
  });
});