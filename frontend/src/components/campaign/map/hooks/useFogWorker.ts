// ============================================
// Frontend Fog Worker Hook
//
// Provides a Promise-based API for offloading fog calculations
// to a Web Worker.
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FogState, FogOperation } from '@/types/walls';
import { calculateFogShapeCells, validateShapeParams, type FogShapeParams, type FogShapeResult } from '../tools/fogShapes';

interface FogWorkerResponse {
  type: string;
  payload: unknown;
  id: number;
}

export function useFogWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>>(new Map());
  const messageIdRef = useRef(0);
  const [isWorkerReady, setIsWorkerReady] = useState(false);

  // Initialize worker
  useEffect(() => {
    try {
      // For now, use a simple inline worker approach
      const blob = new Blob([`
        // Fog Worker
        function applyWsFogOperation(fog, operation) {
          const total = fog.fogCols * fog.fogRows;
          switch (operation.op) {
            case 'reveal_all': fog.revealed.fill(true); break;
            case 'hide_all': fog.revealed.fill(false); break;
            case 'reveal':
              if (operation.cells) for (const idx of operation.cells) if (idx >= 0 && idx < total) fog.revealed[idx] = true;
              break;
            case 'hide':
              if (operation.cells) for (const idx of operation.cells) if (idx >= 0 && idx < total) fog.revealed[idx] = false;
              break;
          }
        }

        self.onmessage = (event) => {
          const { type, payload, id } = event.data;
          try {
            let response;
            switch (type) {
              case 'APPLY_OPERATION': {
                const { fog, operation } = payload;
                const newFog = { ...fog, revealed: [...fog.revealed] };
                applyWsFogOperation(newFog, operation);
                response = { type: 'FOG_STATE', payload: newFog, id };
                break;
              }
              default:
                response = { type: 'ERROR', payload: 'Not implemented', id };
            }
            self.postMessage(response);
          } catch (error) {
            self.postMessage({ type: 'ERROR', payload: error.message, id });
          }
        };
      `], { type: 'application/javascript' });
      
      workerRef.current = new Worker(URL.createObjectURL(blob));
      
      workerRef.current.onmessage = (event: MessageEvent<FogWorkerResponse>) => {
        const { id, type, payload } = event.data;
        const pending = pendingRef.current.get(id);
        if (pending) {
          pendingRef.current.delete(id);
          if (type === 'ERROR') {
            pending.reject(new Error(payload as string));
          } else {
            pending.resolve(payload);
          }
        }
      };
      
      workerRef.current.onerror = () => {
        console.error('Fog worker error');
        // Reject all pending
        for (const [, pending] of pendingRef.current) {
          pending.reject(new Error('Worker error'));
        }
        pendingRef.current.clear();
      };
      
      setIsWorkerReady(true);
      
      return () => {
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
      };
    } catch {
      console.warn('Failed to create fog worker, using main thread');
      setIsWorkerReady(false);
      return undefined;
    }
  }, []);

  /**
   * Apply a fog operation using the worker (with main thread fallback)
   */
  const applyOperation = useCallback(async (fog: FogState, operation: FogOperation): Promise<FogState> => {
    if (!isWorkerReady || !workerRef.current) {
      // Fallback to main thread
      const newFog = { ...fog, revealed: [...fog.revealed] };
      applyWsFogOperationMainThread(newFog, operation);
      return newFog;
    }

    const id = ++messageIdRef.current;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id);
          // Fallback to main thread
          const newFog = { ...fog, revealed: [...fog.revealed] };
          applyWsFogOperationMainThread(newFog, operation);
          resolve(newFog);
        }
      }, 1000);

      pendingRef.current.set(id, { 
        resolve: (value) => { clearTimeout(timeout); resolve(value as FogState); },
        reject: (reason) => { clearTimeout(timeout); reject(reason); } 
      });
      
      workerRef.current!.postMessage({ type: 'APPLY_OPERATION', payload: { fog, operation }, id });
    });
  }, [isWorkerReady]);

  /**
   * Calculate shape cells using the worker
   */
  const calculateShape = useCallback(async (fog: FogState, shape: FogShapeParams): Promise<FogShapeResult> => {
    // For shape calculations, we'll use main thread for now
    // since the logic is already in fogShapes.ts
    const validation = validateShapeParams(fog, shape);
    if (!validation.valid) {
      throw new Error(validation.error ?? 'Invalid shape parameters');
    }
    return calculateFogShapeCells(fog, shape);
  }, []);

  return { applyOperation, calculateShape, isWorkerReady };
}

// Main thread fallback
function applyWsFogOperationMainThread(fog: FogState, operation: FogOperation): void {
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
