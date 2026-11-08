// ============================================
// Frontend Fog Web Worker
//
// Offloads fog calculations to a background thread on the client.
// Handles: shape calculations, union operations, chunked grid updates
// ============================================

import type { FogState } from '@/types/walls';
import type { FogShapeParams, FogShapeResult } from '../tools/fogShapes';
import { calculateFogShapeCells, validateShapeParams } from '../tools/fogShapes';

// Worker message types
type WorkerMessage = 
  | { type: 'CALCULATE_SHAPE'; payload: { fog: FogState; shape: FogShapeParams }; id: number }
  | { type: 'UNION_EXPLORATIONS'; payload: { explorations: Array<{ userId: string; explored: FogState }> }; id: number }
  | { type: 'APPLY_OPERATION'; payload: { fog: FogState; operation: { op: 'reveal' | 'hide' | 'reveal_all' | 'hide_all'; cells?: number[] } }; id: number };

type WorkerResponse = 
  | { type: 'SHAPE_RESULT'; payload: FogShapeResult; id: number }
  | { type: 'VALIDATION_RESULT'; payload: { valid: boolean; error?: string }; id: number }
  | { type: 'FOG_STATE'; payload: FogState; id: number }
  | { type: 'ERROR'; payload: string; id: number };

// Apply fog operation
function applyWsFogOperation(fog: FogState, operation: { op: 'reveal' | 'hide' | 'reveal_all' | 'hide_all'; cells?: number[] }): void {
  const total = fog.fogCols * fog.fogRows;
  switch (operation.op) {
    case 'reveal_all':
      fog.revealed.fill(true);
      break;
    case 'hide_all':
      fog.revealed.fill(false);
      break;
    case 'reveal':
      if (operation.cells) {
        for (const idx of operation.cells) {
          if (idx >= 0 && idx < total) fog.revealed[idx] = true;
        }
      }
      break;
    case 'hide':
      if (operation.cells) {
        for (const idx of operation.cells) {
          if (idx >= 0 && idx < total) fog.revealed[idx] = false;
        }
      }
      break;
  }
}

// Main worker message handler
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = event.data;
  
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
      
      default:
        response = { type: 'ERROR', payload: `Unknown message type: ${type}`, id };
    }
    
    self.postMessage(response);
  } catch (error) {
    self.postMessage({ type: 'ERROR', payload: error instanceof Error ? error.message : 'Unknown error', id });
  }
};

export {};