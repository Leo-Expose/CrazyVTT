// ============================================
// DM Fog Shape Tool — Spell/AoE fog reveal shapes
//
// Extends the existing fog box tool with spell-specific shapes:
// - Cone (burning hands, cone of cold)
// - Radius (fireball, darkness, light)
// - Line (lightning bolt, wall of fire)
// - Cube (cube, sphere projected to 2D)
// - Custom (freehand polygon)
//
// Workflow: DM selects shape → clicks origin → drags for size/direction → confirm
// ============================================

import { useCallback, useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { FogState } from '@/types/walls';
import type { FogShapeParams, FogShapeResult } from './fogShapes';
import { calculateFogShapeCells, validateShapeParams } from './fogShapes';
import type { MapLayer } from '../useRenderLoop';
import type { MapControls, MapTool, PointerAt, ToolSocketSource } from './types';

export type FogShapeToolMode =
  | 'fog-shape-cone'
  | 'fog-shape-radius'
  | 'fog-shape-line'
  | 'fog-shape-cube'
  | 'fog-shape-sphere'
  | 'fog-shape-custom'
  | null;

export interface FogShapeToolState {
  /** Current shape being configured */
  mode: FogShapeToolMode;
  /** Shape-specific configuration */
  config: {
    // Cone
    angleDegrees?: number;
    // Radius/Sphere
    radius?: number;
    // Line
    width?: number;
    // Cube
    size?: number;
    rotationDegrees?: number;
    // Custom
    points?: { x: number; y: number }[];
  };
  /** Origin point (map pixels) where shape placement started */
  origin: { x: number; y: number } | null;
  /** Current drag position (map pixels) */
  current: { x: number; y: number } | null;
  /** Whether we're in the second phase (dragging for size/direction) */
  dragging: boolean;
  /** Preview shape result for visual feedback */
  preview: FogShapeResult | null;
  /** Error message if validation failed */
  error: string | null;
}

interface UseFogShapeToolArgs {
  isDM: boolean;
  mapId: string | undefined;
  fogMode: FogShapeToolMode;
  fogState: FogState | null;
  setFogState: Dispatch<SetStateAction<FogState | null>>;
  socket: ToolSocketSource | null | undefined;
  mapControls: MapControls;
  /** True while the right button pans the map under a DM tool (MapCanvas starts it). */
  rightPanActiveRef: RefObject<boolean>;
  markDirty: (...layers: MapLayer[]) => void;
  /** Callback when a shape is confirmed and sent to server */
  onShapeConfirm?: (cells: number[], operation: 'reveal' | 'hide') => void;
}

export function useFogShapeTool({
  isDM,
  mapId,
  fogMode,
  fogState,
  setFogState,
  socket,
  mapControls,
  rightPanActiveRef,
  markDirty,
  onShapeConfirm,
}: UseFogShapeToolArgs) {
  // Shape tool state
  const [shapeState, setShapeState] = useState<FogShapeToolState>({
    mode: null,
    config: {},
    origin: null,
    current: null,
    dragging: false,
    preview: null,
    error: null,
  });

  // Reset shape state when mode changes
  useEffect(() => {
    setShapeState({
      mode: null,
      config: {},
      origin: null,
      current: null,
      dragging: false,
      preview: null,
      error: null,
    });
  }, [fogMode]);

  // Set default config based on shape type
  useEffect(() => {
    if (!fogMode || !fogState) return;

    const defaults: Partial<FogShapeToolState['config']> = {};
    switch (fogMode) {
      case 'fog-shape-cone':
        defaults.angleDegrees = 60; // Burning hands default
        break;
      case 'fog-shape-radius':
      case 'fog-shape-sphere':
        defaults.radius = 4; // Fireball default (20ft = 4 cells at 5ft)
        break;
      case 'fog-shape-line':
        defaults.width = 1; // Lightning bolt default (5ft = 1 cell)
        break;
      case 'fog-shape-cube':
        defaults.size = 3; // Cube default (15ft = 3 cells)
        defaults.rotationDegrees = 0;
        break;
      case 'fog-shape-custom':
        defaults.points = [];
        break;
    }
    setShapeState(prev => ({ ...prev, mode: fogMode, config: { ...prev.config, ...defaults } }));
  }, [fogMode, fogState]);

  /**
   * Update preview based on current origin and drag position
   */
  const updatePreview = useCallback((
    origin: { x: number; y: number },
    current: { x: number; y: number },
    config: FogShapeToolState['config']
  ) => {
    if (!fogState || !fogMode) return;

    const cellPx = fogState.cellPx;

    // Convert map pixels to fog grid coordinates
    const originCol = origin.x / cellPx;
    const originRow = origin.y / cellPx;
    const currentCol = current.x / cellPx;
    const currentRow = current.y / cellPx;

    let shapeParams: FogShapeParams | null = null;

    switch (fogMode) {
      case 'fog-shape-cone': {
        const angle = config.angleDegrees ?? 60;
        const length = Math.hypot(currentCol - originCol, currentRow - originRow);
        const direction = {
          col: currentCol - originCol,
          row: currentRow - originRow,
        };
        shapeParams = {
          type: 'cone',
          params: { origin: { col: originCol, row: originRow }, direction, angleDegrees: angle, length },
        };
        break;
      }
      case 'fog-shape-radius':
      case 'fog-shape-sphere': {
        const radius = config.radius ?? 4;
        shapeParams = {
          type: fogMode === 'fog-shape-radius' ? 'radius' : 'sphere',
          params: { center: { col: originCol, row: originRow }, radius },
        };
        break;
      }
      case 'fog-shape-line': {
        const width = config.width ?? 1;
        shapeParams = {
          type: 'line',
          params: {
            start: { col: originCol, row: originRow },
            end: { col: currentCol, row: currentRow },
            width,
          },
        };
        break;
      }
      case 'fog-shape-cube': {
        const size = config.size ?? 3;
        const rotation = config.rotationDegrees ?? 0;
        shapeParams = {
          type: 'cube',
          params: { origin: { col: originCol, row: originRow }, size, rotationDegrees: rotation },
        };
        break;
      }
      case 'fog-shape-custom': {
        // Custom shape uses points from config
        if (config.points && config.points.length >= 3) {
          shapeParams = {
            type: 'custom',
            params: { points: config.points.map(p => ({ col: p.x / cellPx, row: p.y / cellPx })) },
          };
        }
        break;
      }
    }

    if (shapeParams) {
      const validation = validateShapeParams(fogState, shapeParams);
      if (!validation.valid) {
        setShapeState(prev => ({ ...prev, error: validation.error ?? 'Invalid shape', preview: null }));
        return;
      }

      const result = calculateFogShapeCells(fogState, shapeParams);
      setShapeState(prev => ({ ...prev, preview: result, error: null }));
    }
  }, [fogMode, fogState]);

  /**
   * Update shape config (e.g., angle, radius, width)
   */
  const updateConfig = useCallback(<K extends keyof FogShapeToolState['config']>(
    key: K,
    value: FogShapeToolState['config'][K]
  ) => {
    setShapeState(prev => {
      const nextConfig = { ...prev.config, [key]: value };
      if (prev.origin && prev.current && fogState) {
        updatePreview(prev.origin, prev.current, nextConfig);
      }
      return {
        ...prev,
        config: nextConfig,
        error: null,
      };
    });
  }, [fogState, updatePreview]);

  /**
   * Apply the shape cells to fog (optimistic update + server emit)
   */
  const applyShapeCells = useCallback((cells: number[], operation: 'reveal' | 'hide') => {
    if (!mapId || !fogState || cells.length === 0) return;

    setFogState(prev => {
      if (!prev) return prev;
      const revealed = [...prev.revealed];
      for (const idx of cells) {
        if (idx >= 0 && idx < revealed.length) revealed[idx] = operation === 'reveal';
      }
      return { ...prev, revealed };
    });

    socket?.getSocket()?.emit('fog:reveal_shape', { mapId, shape: shapeState.mode ? { type: shapeState.mode.replace('fog-shape-', ''), params: shapeState.config } : null, operation });
    onShapeConfirm?.(cells, operation);
  }, [mapId, fogState, setFogState, socket, shapeState.mode, shapeState.config, onShapeConfirm]);

  /**
   * Start placing a shape (first click - set origin)
   */
  const startShape = useCallback((mapPx: { x: number; y: number }) => {
    if (!fogMode || !isDM || !fogState) return false;

    setShapeState(prev => ({
      ...prev,
      origin: mapPx,
      current: mapPx,
      dragging: false,
      error: null,
    }));
    return true;
  }, [fogMode, isDM, fogState]);

  /**
   * Update shape during drag (second phase - drag for size/direction)
   */
  const updateShape = useCallback((mapPx: { x: number; y: number }) => {
    if (!fogMode || !isDM || !fogState || !shapeState.origin) return false;

    setShapeState(prev => ({ ...prev, current: mapPx, dragging: true }));
    updatePreview(shapeState.origin, mapPx, shapeState.config);
    markDirty('overlay');
    return true;
  }, [fogMode, isDM, fogState, markDirty, shapeState.origin, shapeState.config, updatePreview]);

  /**
   * Confirm shape placement (mouse up)
   */
  const confirmShape = useCallback(() => {
    if (!fogMode || !shapeState.origin || !shapeState.preview) return;

    const operation = fogMode.includes('hide') ? 'hide' : 'reveal'; // This would need a separate mode for hide
    // For now, all shapes reveal. Could add fog-shape-hide-* modes or a modifier key.
    applyShapeCells(shapeState.preview.cells, operation === 'hide' ? 'hide' : 'reveal');

    setShapeState(prev => ({
      ...prev,
      origin: null,
      current: null,
      dragging: false,
      preview: null,
    }));
  }, [fogMode, shapeState.origin, shapeState.preview, applyShapeCells]);

  /**
   * Cancel shape placement (Escape, right-click, map change)
   */
  const cancelShape = useCallback(() => {
    setShapeState(prev => ({
      ...prev,
      origin: null,
      current: null,
      dragging: false,
      preview: null,
      error: null,
    }));
  }, []);

  // Cleanup on mode/map change
  useEffect(() => {
    cancelShape();
  }, [fogMode, mapId, cancelShape]);

  const tool: MapTool = {
    down({ e, mapPx }: PointerAt) {
      if (!(fogMode && isDM && fogState)) return false;
      if (shapeState.dragging || shapeState.origin) {
        // Second click confirms
        confirmShape();
        return true;
      }
      e.preventDefault();
      return startShape(mapPx);
    },
    move({ e, mapPx }: PointerAt) {
      if (!(fogMode && isDM && fogState)) return false;
      if (rightPanActiveRef.current) {
        mapControls.handleDrag(e);
        markDirty('terrain', 'tokens', 'overlay');
        return true;
      }
      if (shapeState.origin && !shapeState.dragging) {
        return updateShape(mapPx);
      }
      return false;
    },
    up() {
      // Handled in down for two-click workflow
    },
    escape() {
      if (!shapeState.origin) return false;
      cancelShape();
      return true;
    },
  };

  return {
    tool,
    shapeState,
    updateConfig,
    cancelShape,
    // Expose for rendering preview
    shapeOrigin: shapeState.origin,
    shapeCurrent: shapeState.current,
    shapePreview: shapeState.preview,
    shapeError: shapeState.error,
    shapeDragging: shapeState.dragging,
  };
}
