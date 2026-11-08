// ============================================
// Fog Worker Manager
//
// Manages the Web Worker for fog calculations, providing
// a Promise-based API for the main thread.
// ============================================

import type { FogState, FogOperation } from '../../types/walls';

class FogWorkerManager {
  /**
   * Apply a fog operation
   */
  async applyOperation(fog: FogState, operation: FogOperation): Promise<FogState> {
    const newFog = { ...fog, revealed: [...fog.revealed] };
    applyWsFogOperation(newFog, operation);
    return newFog;
  }

  /**
   * Terminate any resources
   */
  terminate(): void {
    // No-op in node environment
  }
}

// Main thread fallback functions
function applyWsFogOperation(fog: FogState, operation: FogOperation): void {
  const total = fog.fogCols * fog.fogRows;
  switch (operation.op) {
    case 'reveal_all':
      fog.revealed.fill(true);
      break;
    case 'hide_all':
      fog.revealed.fill(false);
      break;
    case 'reveal':
      for (const idx of operation.cells) {
        if (idx >= 0 && idx < total) fog.revealed[idx] = true;
      }
      break;
    case 'hide':
      for (const idx of operation.cells) {
        if (idx >= 0 && idx < total) fog.revealed[idx] = false;
      }
      break;
  }
}

// Singleton instance
export const fogWorkerManager = new FogWorkerManager();

// Utility functions for main thread use
export async function applyFogOperationAsync(fog: FogState, operation: FogOperation): Promise<FogState> {
  // For now, use main thread directly (worker can be enabled later)
  const newFog = { ...fog, revealed: [...fog.revealed] };
  applyWsFogOperation(newFog, operation);
  return newFog;
}

export function unionExplorations(explorations: Array<{ userId: string; explored: FogState }>): FogState {
  if (explorations.length === 0) {
    return { fogCols: 0, fogRows: 0, cellPx: 0, revealed: [] };
  }
  
  const baseFog = explorations[0].explored;
  const result: FogState = {
    fogCols: baseFog.fogCols,
    fogRows: baseFog.fogRows,
    cellPx: baseFog.cellPx,
    revealed: [...baseFog.revealed],
  };
  
  for (let i = 1; i < explorations.length; i++) {
    const exp = explorations[i].explored;
    for (let j = 0; j < result.revealed.length; j++) {
      if (exp.revealed[j]) result.revealed[j] = true;
    }
  }
  
  return result;
}