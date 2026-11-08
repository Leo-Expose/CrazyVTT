// ============================================
// Chunked Fog Grid System
//
// Divides the fog grid into 32x32 chunks for efficient updates,
// dirty rect tracking, and LOD support.
// ============================================

import type { FogState } from '../../types/walls';

/** Size of each fog chunk in cells */
export const FOG_CHUNK_SIZE = 32;

/** A single chunk of fog data */
export interface FogChunk {
  x: number;           // Chunk grid X coordinate
  y: number;           // Chunk grid Y coordinate
  revealed: Uint8Array; // Packed bits: 1 bit per cell (32x32 = 1024 bits = 128 bytes)
  dirty: boolean;       // Whether this chunk has been modified
  version: number;      // Incremented on each change for cache invalidation
}

/** Chunked fog grid */
export interface ChunkedFogGrid {
  fogCols: number;
  fogRows: number;
  cellPx: number;
  chunkCols: number;    // Number of chunks horizontally
  chunkRows: number;    // Number of chunks vertically
  chunks: Map<string, FogChunk>; // Key: "x,y"
  version: number;      // Global version for cache invalidation
}

/**
 * Create a new empty chunked fog grid
 */
export function createChunkedFogGrid(fog: FogState): ChunkedFogGrid {
  const chunkCols = Math.ceil(fog.fogCols / FOG_CHUNK_SIZE);
  const chunkRows = Math.ceil(fog.fogRows / FOG_CHUNK_SIZE);
  
  return {
    fogCols: fog.fogCols,
    fogRows: fog.fogRows,
    cellPx: fog.cellPx,
    chunkCols,
    chunkRows,
    chunks: new Map(),
    version: 0,
  };
}

/**
 * Get or create a chunk at the given chunk coordinates
 */
function getOrCreateChunk(grid: ChunkedFogGrid, chunkX: number, chunkY: number): FogChunk {
  const key = `${chunkX},${chunkY}`;
  let chunk = grid.chunks.get(key);
  if (!chunk) {
    const cellsPerChunk = FOG_CHUNK_SIZE * FOG_CHUNK_SIZE;
    const byteLength = Math.ceil(cellsPerChunk / 8);
    chunk = {
      x: chunkX,
      y: chunkY,
      revealed: new Uint8Array(byteLength),
      dirty: false,
      version: 0,
    };
    grid.chunks.set(key, chunk);
  }
  return chunk;
}

/**
 * Set a bit in the chunk's revealed array
 */
function setChunkCell(chunk: FogChunk, localX: number, localY: number, value: boolean): void {
  const index = localY * FOG_CHUNK_SIZE + localX;
  const byteIndex = index >> 3; // index / 8
  const bitIndex = index & 7;   // index % 8
  
  if (value) {
    chunk.revealed[byteIndex] |= (1 << bitIndex);
  } else {
    chunk.revealed[byteIndex] &= ~(1 << bitIndex);
  }
}

/**
 * Get a bit from the chunk's revealed array
 */
function getChunkCell(chunk: FogChunk, localX: number, localY: number): boolean {
  const index = localY * FOG_CHUNK_SIZE + localX;
  const byteIndex = index >> 3;
  const bitIndex = index & 7;
  return (chunk.revealed[byteIndex] & (1 << bitIndex)) !== 0;
}

/**
 * Convert fog cell coordinates to chunk coordinates
 */
function cellToChunk(cellX: number, cellY: number): { chunkX: number; chunkY: number; localX: number; localY: number } {
  return {
    chunkX: Math.floor(cellX / FOG_CHUNK_SIZE),
    chunkY: Math.floor(cellY / FOG_CHUNK_SIZE),
    localX: cellX % FOG_CHUNK_SIZE,
    localY: cellY % FOG_CHUNK_SIZE,
  };
}

/**
 * Reveal cells in the chunked fog grid
 */
export function revealChunkedCells(grid: ChunkedFogGrid, cells: number[]): void {
  for (const cellIdx of cells) {
    const cellY = Math.floor(cellIdx / grid.fogCols);
    const cellX = cellIdx % grid.fogCols;
    
    if (cellX < 0 || cellX >= grid.fogCols || cellY < 0 || cellY >= grid.fogRows) continue;
    
    const { chunkX, chunkY, localX, localY } = cellToChunk(cellX, cellY);
    const chunk = getOrCreateChunk(grid, chunkX, chunkY);
    
    if (!getChunkCell(chunk, localX, localY)) {
      setChunkCell(chunk, localX, localY, true);
      chunk.dirty = true;
      chunk.version++;
    }
  }
  grid.version++;
}

/**
 * Hide cells in the chunked fog grid
 */
export function hideChunkedCells(grid: ChunkedFogGrid, cells: number[]): void {
  for (const cellIdx of cells) {
    const cellY = Math.floor(cellIdx / grid.fogCols);
    const cellX = cellIdx % grid.fogCols;
    
    if (cellX < 0 || cellX >= grid.fogCols || cellY < 0 || cellY >= grid.fogRows) continue;
    
    const { chunkX, chunkY, localX, localY } = cellToChunk(cellX, cellY);
    const chunk = grid.chunks.get(`${chunkX},${chunkY}`);
    
    if (chunk && getChunkCell(chunk, localX, localY)) {
      setChunkCell(chunk, localX, localY, false);
      chunk.dirty = true;
      chunk.version++;
    }
  }
  grid.version++;
}

/**
 * Reveal all cells
 */
export function revealAllChunked(grid: ChunkedFogGrid): void {
  for (let cy = 0; cy < grid.chunkRows; cy++) {
    for (let cx = 0; cx < grid.chunkCols; cx++) {
      const chunk = getOrCreateChunk(grid, cx, cy);
      chunk.revealed.fill(0xFF);
      chunk.dirty = true;
      chunk.version++;
    }
  }
  grid.version++;
}

/**
 * Hide all cells
 */
export function hideAllChunked(grid: ChunkedFogGrid): void {
  for (let cy = 0; cy < grid.chunkRows; cy++) {
    for (let cx = 0; cx < grid.chunkCols; cx++) {
      const chunk = getOrCreateChunk(grid, cx, cy);
      chunk.revealed.fill(0);
      chunk.dirty = true;
      chunk.version++;
    }
  }
  grid.version++;
}

/**
 * Get all dirty chunks since last check
 */
export function getDirtyChunks(grid: ChunkedFogGrid): FogChunk[] {
  const dirty: FogChunk[] = [];
  for (const chunk of grid.chunks.values()) {
    if (chunk.dirty) {
      dirty.push(chunk);
      chunk.dirty = false; // Reset dirty flag
    }
  }
  return dirty;
}

/**
 * Convert chunked grid back to flat FogState for compatibility
 */
export function chunkedToFogState(grid: ChunkedFogGrid): FogState {
  const revealed = new Array(grid.fogCols * grid.fogRows).fill(false);
  
  for (const chunk of grid.chunks.values()) {
    const baseX = chunk.x * FOG_CHUNK_SIZE;
    const baseY = chunk.y * FOG_CHUNK_SIZE;
    const maxLocalX = Math.min(FOG_CHUNK_SIZE, grid.fogCols - baseX);
    const maxLocalY = Math.min(FOG_CHUNK_SIZE, grid.fogRows - baseY);
    
    for (let localY = 0; localY < maxLocalY; localY++) {
      const rowStart = localY * FOG_CHUNK_SIZE;
      const cellY = baseY + localY;
      const targetRowOffset = cellY * grid.fogCols + baseX;

      for (let localX = 0; localX < maxLocalX; localX++) {
        const index = rowStart + localX;
        if (chunk.revealed[index >> 3] & (1 << (index & 7))) {
          revealed[targetRowOffset + localX] = true;
        }
      }
    }
  }
  
  return {
    fogCols: grid.fogCols,
    fogRows: grid.fogRows,
    cellPx: grid.cellPx,
    revealed,
  };
}

/**
 * Convert flat FogState to chunked grid
 */
export function fogStateToChunked(fog: FogState): ChunkedFogGrid {
  const grid = createChunkedFogGrid(fog);
  const { fogCols, fogRows } = fog;

  for (let cy = 0; cy < grid.chunkRows; cy++) {
    const baseY = cy * FOG_CHUNK_SIZE;
    const maxLocalY = Math.min(FOG_CHUNK_SIZE, fogRows - baseY);

    for (let cx = 0; cx < grid.chunkCols; cx++) {
      const baseX = cx * FOG_CHUNK_SIZE;
      const maxLocalX = Math.min(FOG_CHUNK_SIZE, fogCols - baseX);
      let chunk: FogChunk | undefined;

      for (let ly = 0; ly < maxLocalY; ly++) {
        const rowOffset = (baseY + ly) * fogCols + baseX;
        const localRowStart = ly * FOG_CHUNK_SIZE;

        for (let lx = 0; lx < maxLocalX; lx++) {
          if (fog.revealed[rowOffset + lx]) {
            if (!chunk) {
              chunk = getOrCreateChunk(grid, cx, cy);
            }
            const idx = localRowStart + lx;
            chunk.revealed[idx >> 3] |= (1 << (idx & 7));
          }
        }
      }
    }
  }

  return grid;
}

/**
 * Run-length encode a chunk's revealed data for network transmission
 */
export function rleEncodeChunk(chunk: FogChunk): { data: Uint8Array; runs: number[] } {
  const runs: number[] = [];
  let currentValue = 0;
  let runLength = 0;
  
  for (let i = 0; i < chunk.revealed.length * 8; i++) {
    const byteIndex = i >> 3;
    const bitIndex = i & 7;
    const value = (chunk.revealed[byteIndex] & (1 << bitIndex)) ? 1 : 0;
    
    if (value === currentValue) {
      runLength++;
    } else {
      runs.push(runLength);
      currentValue = value;
      runLength = 1;
    }
  }
  runs.push(runLength); // Push final run
  
  return { data: chunk.revealed, runs };
}

/**
 * Decode RLE data back to chunk
 */
export function rleDecodeChunk(runs: number[], chunk: FogChunk): void {
  let bitIndex = 0;
  let currentValue = 0;
  
  for (const runLength of runs) {
    for (let i = 0; i < runLength; i++) {
      const byteIndex = bitIndex >> 3;
      const bitPos = bitIndex & 7;
      
      if (currentValue === 1) {
        chunk.revealed[byteIndex] |= (1 << bitPos);
      } else {
        chunk.revealed[byteIndex] &= ~(1 << bitPos);
      }
      bitIndex++;
    }
    currentValue = 1 - currentValue;
  }
}

/**
 * Get LOD (Level of Detail) simplified fog for low zoom levels
 * Returns a reduced resolution version of the fog
 */
export function getLODFog(grid: ChunkedFogGrid, lodLevel: number): { revealed: boolean[]; scale: number } {
  if (lodLevel <= 0) {
    return { revealed: chunkedToFogState(grid).revealed, scale: 1 };
  }
  
  const scale = 1 << lodLevel; // 2^lodLevel
  const lodCols = Math.ceil(grid.fogCols / scale);
  const lodRows = Math.ceil(grid.fogRows / scale);
  const revealed = new Array(lodCols * lodRows).fill(false);
  
  for (const chunk of grid.chunks.values()) {
    const baseX = chunk.x * FOG_CHUNK_SIZE;
    const baseY = chunk.y * FOG_CHUNK_SIZE;
    const maxLocalX = Math.min(FOG_CHUNK_SIZE, grid.fogCols - baseX);
    const maxLocalY = Math.min(FOG_CHUNK_SIZE, grid.fogRows - baseY);
    
    for (let localY = 0; localY < maxLocalY; localY += scale) {
      for (let localX = 0; localX < maxLocalX; localX += scale) {
        let isRevealed = false;
        const blockEndY = Math.min(maxLocalY, localY + scale);
        const blockEndX = Math.min(maxLocalX, localX + scale);
        for (let by = localY; by < blockEndY && !isRevealed; by++) {
          for (let bx = localX; bx < blockEndX && !isRevealed; bx++) {
            if (getChunkCell(chunk, bx, by)) {
              isRevealed = true;
            }
          }
        }
        if (isRevealed) {
          const cellX = baseX + localX;
          const cellY = baseY + localY;
          const lodX = Math.floor(cellX / scale);
          const lodY = Math.floor(cellY / scale);
          if (lodX < lodCols && lodY < lodRows) {
            revealed[lodY * lodCols + lodX] = true;
          }
        }
      }
    }
  }
  
  return { revealed, scale };
}