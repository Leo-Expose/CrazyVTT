// ============================================
// Fog Web Worker
//
// Offloads fog calculations to a background thread.
// Handles: shape calculations, union operations, chunked grid updates
// ============================================

import type { FogState, FogOperation } from '../../types/walls';
import type { FogShapeParams, FogShapeResult } from './shapes';
import { 
  calculateFogShapeCells, 
  validateShapeParams,
} from './shapes';
import {
  ChunkedFogGrid,
  createChunkedFogGrid,
  revealChunkedCells,
  hideChunkedCells,
  revealAllChunked,
  hideAllChunked,
  chunkedToFogState,
  fogStateToChunked,
  getLODFog,
} from './chunkedGrid';

// Worker message types
type WorkerMessage = 
  | { type: 'CALCULATE_SHAPE'; payload: { fog: FogState; shape: FogShapeParams } }
  | { type: 'APPLY_OPERATION'; payload: { fog: FogState; operation: FogOperation } }
  | { type: 'UNION_EXPLORATIONS'; payload: { explorations: Array<{ userId: string; explored: FogState }> } }
  | { type: 'CHUNKED_REVEAL'; payload: { grid: ChunkedFogGrid; cells: number[] } }
  | { type: 'CHUNKED_HIDE'; payload: { grid: ChunkedFogGrid; cells: number[] } }
  | { type: 'CHUNKED_REVEAL_ALL'; payload: { grid: ChunkedFogGrid } }
  | { type: 'CHUNKED_HIDE_ALL'; payload: { grid: ChunkedFogGrid } }
  | { type: 'GET_LOD'; payload: { grid: ChunkedFogGrid; lodLevel: number } }
  | { type: 'INIT_CHUNKED'; payload: { fog: FogState } }
  | { type: 'TO_CHUNKED'; payload: { fog: FogState } }
  | { type: 'TO_FOG_STATE'; payload: { grid: ChunkedFogGrid } };

type WorkerResponse = 
  | { type: 'SHAPE_RESULT'; payload: FogShapeResult; id: number }
  | { type: 'VALIDATION_RESULT'; payload: { valid: boolean; error?: string }; id: number }
  | { type: 'FOG_STATE'; payload: FogState; id: number }
  | { type: 'CHUNKED_GRID'; payload: ChunkedFogGrid; id: number }
  | { type: 'LOD_RESULT'; payload: { revealed: boolean[]; scale: number }; id: number }
  | { type: 'ERROR'; payload: string; id: number };

// Main worker message handler
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = event.data as WorkerMessage & { id: number };
  
  try {
    let response: WorkerResponse;
    
    switch (type) {
      case 'CALCULATE_SHAPE': {
        const { fog, shape } = payload;
        const validation = validateShapeParams(fog, shape);
        if (!validation.valid) {
          response = { type: 'VALIDATION_RESULT', payload: validation, id };
        } else {
          const result = calculateFogShapeCells(fog, shape);
          response = { type: 'SHAPE_RESULT', payload: result, id };
        }
        break;
      }
      
      case 'APPLY_OPERATION': {
        const { fog, operation } = payload;
        const newFog = { ...fog, revealed: [...fog.revealed] };
        applyWsFogOperation(newFog, operation);
        response = { type: 'FOG_STATE', payload: newFog, id };
        break;
      }
      
      case 'UNION_EXPLORATIONS': {
        const { explorations } = payload;
        if (explorations.length === 0) {
          response = { type: 'FOG_STATE', payload: { fogCols: 0, fogRows: 0, cellPx: 0, revealed: [] }, id };
          break;
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
        
        response = { type: 'FOG_STATE', payload: result, id };
        break;
      }
      
      case 'CHUNKED_REVEAL': {
        const { grid, cells } = payload;
        revealChunkedCells(grid, cells);
        response = { type: 'CHUNKED_GRID', payload: grid, id };
        break;
      }
      
      case 'CHUNKED_HIDE': {
        const { grid, cells } = payload;
        hideChunkedCells(grid, cells);
        response = { type: 'CHUNKED_GRID', payload: grid, id };
        break;
      }
      
      case 'CHUNKED_REVEAL_ALL': {
        const { grid } = payload;
        revealAllChunked(grid);
        response = { type: 'CHUNKED_GRID', payload: grid, id };
        break;
      }
      
      case 'CHUNKED_HIDE_ALL': {
        const { grid } = payload;
        hideAllChunked(grid);
        response = { type: 'CHUNKED_GRID', payload: grid, id };
        break;
      }
      
      case 'GET_LOD': {
        const { grid, lodLevel } = payload;
        const result = getLODFog(grid, lodLevel);
        response = { type: 'LOD_RESULT', payload: result, id };
        break;
      }
      
      case 'INIT_CHUNKED': {
        const { fog } = payload;
        const grid = createChunkedFogGrid(fog);
        response = { type: 'CHUNKED_GRID', payload: grid, id };
        break;
      }
      
      case 'TO_CHUNKED': {
        const { fog } = payload;
        const grid = fogStateToChunked(fog);
        response = { type: 'CHUNKED_GRID', payload: grid, id };
        break;
      }
      
      case 'TO_FOG_STATE': {
        const { grid } = payload;
        const fog = chunkedToFogState(grid);
        response = { type: 'FOG_STATE', payload: fog, id };
        break;
      }
      
      default:
        response = { type: 'ERROR', payload: `Unknown message type: ${type}`, id };
    }
    
    self.postMessage(response);
  } catch (error) {
    self.postMessage({ type: 'ERROR', payload: error instanceof Error ? error.message : 'Unknown error', id });
  }
};

/**
 * Apply fog operation to a fog state (copied from shared.ts for worker independence)
 */
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

// Export for TypeScript
export {};
