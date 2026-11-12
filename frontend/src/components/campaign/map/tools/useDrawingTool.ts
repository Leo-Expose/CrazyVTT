// ============================================
// Unified Drawing Tool Hook
// Supports: brush, shape, freehand, text, erase, select
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapTool, PointerAt } from './types';
import { randomId } from '@/utils/uuid';
import { douglasPeucker } from '@/utils/geometry';
import { snapToGrid } from '../drawingGeometry';
import type {
  DrawingMode,
  ShapeType,
  ShapeDefinition,
  FreehandStroke,
  TextAnnotation,
  BrushSettings,
  GridSettings,
  TileVariant,
} from '@/types';
import { useWebSocket } from '@/contexts/WebSocketContext';

interface DrawingToolOptions {
  mode: DrawingMode;
  mapId: string | undefined;
  gridSize: number;
  activeLayerId: string | null;
  brushSettings: BrushSettings;
  shapeSettings: { type: ShapeType; color: string; fillColor: string; strokeWidth: number };
  freehandSettings: { color: string; strokeWidth: number };
  textSettings: { fontSize: number; color: string; fontFamily: string; backgroundColor?: string; backgroundOpacity?: number };
  gridSettings: GridSettings;
  mapControls: ReturnType<typeof import('@/hooks/useMapControls').useMapControls>;
  markDirty: (...layers: string[]) => void;
  onTilePlace?: (tileId: string, x: number, y: number, variant: TileVariant) => void;
  onShapeDraw?: (shape: ShapeDefinition) => void;
  onFreehandDraw?: (stroke: FreehandStroke) => void;
  onTextPlace?: (annotation: TextAnnotation) => void;
  onErase?: (type: 'tile' | 'shape' | 'stroke' | 'text', id: string) => void;
  onSelect?: (type: 'tile' | 'shape' | 'stroke' | 'text', id: string, transform?: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }) => void;
}

interface DrawingState {
  // Brush
  brushStroke: {
    tileId: string;
    variant: TileVariant;
    points: Array<{ x: number; y: number }>;
    previewId: string;
  } | null;
  
  // Shape
  shapeStart: { x: number; y: number } | null;
  shapePreview: ShapeDefinition | null;
  
  // Freehand
  freehandPoints: Array<{ x: number; y: number }>;
  freehandPreviewId: string | null;
  
  // Text
  textPosition: { x: number; y: number } | null;
  textDraft: string;
  textEditing: boolean;
  
  // Select
  selectedElement: { type: string; id: string; element: unknown } | null;
  selectStart: { x: number; y: number } | null;
  selectBox: { x1: number; y1: number; x2: number; y2: number } | null;
  transforming: boolean;
  transformHandle: string | null;
  
  // Erase
  erasing: boolean;
  
  // General
  panning: boolean;
}

const round = (p: { x: number; y: number }) => [Math.round(p.x), Math.round(p.y)] as [number, number];
const FRAME_MS = 50; // ~20fps for preview updates

export function useDrawingTool(options: DrawingToolOptions) {
  const {
    mode,
    mapId,
    gridSize,
    activeLayerId,
    brushSettings,
    shapeSettings,
    freehandSettings,
    textSettings,
    gridSettings,
    mapControls,
    markDirty,
    onTilePlace,
    onShapeDraw,
    onFreehandDraw,
    onTextPlace,
    onErase,
    onSelect,
  } = options;

  const { socket } = useWebSocket();
  
  const stateRef = useRef<DrawingState>({
    brushStroke: null,
    shapeStart: null,
    shapePreview: null,
    freehandPoints: [],
    freehandPreviewId: null,
    textPosition: null,
    textDraft: '',
    textEditing: false,
    selectedElement: null,
    selectStart: null,
    selectBox: null,
    transforming: false,
    transformHandle: null,
    erasing: false,
    panning: false,
  });
  
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [textInputRef, setTextInputRef] = useState<HTMLInputElement | null>(null);
  const latest = useRef(options);
  
  useEffect(() => {
    latest.current = options;
  }, [options]);

  const audience = useCallback((): 'ALL' | 'DM' => 'ALL', []);

  const snapped = useCallback((point: { x: number; y: number }) => {
    if (latest.current.gridSettings.snapMode === 'off') return point;
    return snapToGrid(point, latest.current.gridSize);
  }, []);

  const sendPreview = useCallback((event: string, data: unknown) => {
    if (!mapId || !socket) return;
    socket.emit(event, { mapId, layerId: activeLayerId, ...data });
  }, [socket, mapId, activeLayerId]);

  const clearTimer = useCallback((key: string) => {
    if (timersRef.current[key]) {
      clearTimeout(timersRef.current[key]);
      delete timersRef.current[key];
    }
  }, []);

  const setTimer = useCallback((key: string, callback: () => void, delay: number) => {
    clearTimer(key);
    timersRef.current[key] = setTimeout(callback, delay);
  }, [clearTimer]);

  // ============================================
  // BRUSH MODE
  // ============================================
  
  const startBrushStroke = useCallback((at: PointerAt) => {
    const { tileId, variant } = latest.current.brushSettings;
    if (!tileId || !mapId) return false;
    
    const point = round(at.mapPx);
    const previewId = randomId();
    
    stateRef.current.brushStroke = {
      tileId,
      variant,
      points: [point],
      previewId,
    };
    
    // Send preview
    sendPreview('tile:preview', {
      previewId,
      tileId,
      variant,
      points: [point],
    });
    
    markDirty('overlay');
    return true;
  }, [brushSettings, mapId, sendPreview, markDirty]);

  const continueBrushStroke = useCallback((at: PointerAt) => {
    const stroke = stateRef.current.brushStroke;
    if (!stroke) return false;
    
    const point = round(at.mapPx);
    const lastPoint = stroke.points[stroke.points.length - 1];
    
    // Only add if moved enough
    const dist = Math.hypot(point[0] - lastPoint[0], point[1] - lastPoint[1]);
    if (dist < gridSize * 0.5) return true;
    
    stroke.points.push(point);
    
    // Send preview periodically
    setTimer('brush-preview', () => {
      sendPreview('tile:preview', {
        previewId: stroke.previewId,
        tileId: stroke.tileId,
        variant: stroke.variant,
        points: stroke.points.slice(-10), // Send last 10 points
      });
    }, FRAME_MS);
    
    markDirty('overlay');
    return true;
  }, [gridSize, sendPreview, markDirty, setTimer]);

  const endBrushStroke = useCallback(() => {
    const stroke = stateRef.current.brushStroke;
    if (!stroke || !mapId || !onTilePlace) return;
    
    clearTimer('brush-preview');
    
    // Place tiles at all points
    stroke.points.forEach(point => {
      onTilePlace(stroke.tileId, point[0], point[1], stroke.variant);
    });
    
    // Send end preview
    sendPreview('tile:preview:end', { previewId: stroke.previewId });
    
    stateRef.current.brushStroke = null;
    markDirty('overlay');
  }, [mapId, onTilePlace, sendPreview, markDirty, clearTimer]);

  // ============================================
  // SHAPE MODE
  // ============================================
  
  const startShape = useCallback((at: PointerAt) => {
    if (!mapId) return false;
    
    const point = latest.current.gridSettings.snapMode === 'off' ? at.mapPx : snapped(at.mapPx);
    const roundedPoint = round(point);
    
    stateRef.current.shapeStart = roundedPoint;
    stateRef.current.shapePreview = {
      id: randomId(),
      type: latest.current.shapeSettings.type,
      points: [roundedPoint, roundedPoint],
      color: latest.current.shapeSettings.color,
      fillColor: latest.current.shapeSettings.fillColor,
      strokeWidth: latest.current.shapeSettings.strokeWidth,
      rotation: 0,
      locked: false,
    };
    
    markDirty('overlay');
    return true;
  }, [mapId, snapped, shapeSettings, markDirty]);

  const continueShape = useCallback((at: PointerAt) => {
    const start = stateRef.current.shapeStart;
    const preview = stateRef.current.shapePreview;
    if (!start || !preview) return false;
    
    const point = latest.current.gridSettings.snapMode === 'off' ? at.mapPx : snapped(at.mapPx);
    const roundedPoint = round(point);
    
    preview.points = [start, roundedPoint];
    
    // For polygons, we'd need different handling
    if (preview.type === 'polygon') {
      // Handled separately with click-to-add-points
    }
    
    markDirty('overlay');
    return true;
  }, [snapped, markDirty]);

  const endShape = useCallback(() => {
    const preview = stateRef.current.shapePreview;
    if (!preview || !onShapeDraw) return;
    
    // Only create if has size
    const [p1, p2] = preview.points;
    if (p1[0] === p2[0] && p1[1] === p2[1]) {
      stateRef.current.shapeStart = null;
      stateRef.current.shapePreview = null;
      markDirty('overlay');
      return;
    }
    
    onShapeDraw(preview);

    // If Instant Room mode: automatically generate 4 vision-blocking wall segments
    if (preview.type === 'room') {
      const minX = Math.min(p1[0], p2[0]);
      const maxX = Math.max(p1[0], p2[0]);
      const minY = Math.min(p1[1], p2[1]);
      const maxY = Math.max(p1[1], p2[1]);

      const wallCorners = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ];

      for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4;
        socket?.emit('wall:add', {
          mapId,
          wall: {
            id: randomId(),
            ax: wallCorners[i].x,
            ay: wallCorners[i].y,
            bx: wallCorners[next].x,
            by: wallCorners[next].y,
            wallType: 'normal',
            blocksSight: true,
            blocksMovement: true,
          },
        });
      }
    }
    
    stateRef.current.shapeStart = null;
    stateRef.current.shapePreview = null;
    markDirty('overlay');
  }, [onShapeDraw, markDirty, socket, mapId]);

  const addPolygonPoint = useCallback((at: PointerAt) => {
    const preview = stateRef.current.shapePreview;
    if (!preview || preview.type !== 'polygon') return false;
    
    const point = latest.current.gridSettings.snapMode === 'off' ? at.mapPx : snapped(at.mapPx);
    const roundedPoint = round(point);
    
    // Check if clicking near first point to close
    if (preview.points.length >= 3) {
      const firstPoint = preview.points[0];
      const dist = Math.hypot(roundedPoint[0] - firstPoint[0], roundedPoint[1] - firstPoint[1]);
      if (dist < gridSize * 0.5) {
        // Close polygon
        preview.points.push(firstPoint);
        endShape();
        return true;
      }
    }
    
    preview.points.push(roundedPoint);
    markDirty('overlay');
    return true;
  }, [snapped, gridSize, markDirty, endShape]);

  // ============================================
  // FREEHAND MODE
  // ============================================
  
  const startFreehand = useCallback((at: PointerAt) => {
    if (!mapId) return false;
    
    const point = round(at.mapPx);
    const previewId = randomId();
    
    stateRef.current.freehandPoints = [point];
    stateRef.current.freehandPreviewId = previewId;
    
    sendPreview('drawing:preview', {
      previewId,
      kind: 'pen',
      color: latest.current.freehandSettings.color,
      width: latest.current.freehandSettings.strokeWidth,
      points: [point],
      audience: audience(),
    });
    
    markDirty('overlay');
    return true;
  }, [mapId, freehandSettings, audience, sendPreview, markDirty]);

  const continueFreehand = useCallback((at: PointerAt) => {
    const points = stateRef.current.freehandPoints;
    if (points.length === 0) return false;
    
    const point = round(at.mapPx);
    const lastPoint = points[points.length - 1];
    
    const dist = Math.hypot(point[0] - lastPoint[0], point[1] - lastPoint[1]);
    if (dist < 2) return true; // Minimum distance
    
    points.push(point);
    
    setTimer('freehand-preview', () => {
      sendPreview('drawing:preview', {
        previewId: stateRef.current.freehandPreviewId,
        kind: 'pen',
        color: latest.current.freehandSettings.color,
        width: latest.current.freehandSettings.strokeWidth,
        points: points.slice(-20),
        audience: audience(),
      });
    }, FRAME_MS);
    
    markDirty('overlay');
    return true;
  }, [freehandSettings, audience, sendPreview, markDirty, setTimer]);

  const endFreehand = useCallback(() => {
    const points = stateRef.current.freehandPoints;
    const previewId = stateRef.current.freehandPreviewId;
    if (points.length < 2 || !onFreehandDraw) return;
    
    clearTimer('freehand-preview');
    
    // Simplify stroke
    const simplified = douglasPeucker(points.map(([x, y]) => ({ x, y })), 2 / latest.current.mapControls.zoom);
    const simplifiedPoints = simplified.map(p => [Math.round(p.x), Math.round(p.y)] as [number, number]);
    
    const stroke: FreehandStroke = {
      id: randomId(),
      points: simplifiedPoints,
      color: latest.current.freehandSettings.color,
      strokeWidth: latest.current.freehandSettings.strokeWidth,
    };
    
    onFreehandDraw(stroke);
    
    sendPreview('drawing:preview:end', { previewId });
    
    stateRef.current.freehandPoints = [];
    stateRef.current.freehandPreviewId = null;
    markDirty('overlay');
  }, [onFreehandDraw, sendPreview, markDirty, clearTimer]);

  // ============================================
  // TEXT MODE
  // ============================================
  
  const startText = useCallback((at: PointerAt) => {
    if (!mapId) return false;
    
    const point = round(at.mapPx);
    stateRef.current.textPosition = point;
    stateRef.current.textDraft = '';
    stateRef.current.textEditing = true;
    
    // Focus text input after a tick
    setTimeout(() => {
      textInputRef.current?.focus();
    }, 0);
    
    markDirty('overlay');
    return true;
  }, [mapId, markDirty]);

  const commitText = useCallback(() => {
    const position = stateRef.current.textPosition;
    const draft = stateRef.current.textDraft.trim();
    if (!position || !draft || !onTextPlace) return;
    
    const annotation: TextAnnotation = {
      id: randomId(),
      x: position[0],
      y: position[1],
      text: draft,
      fontSize: latest.current.textSettings.fontSize,
      color: latest.current.textSettings.color,
      fontFamily: latest.current.textSettings.fontFamily,
      backgroundColor: latest.current.textSettings.backgroundColor,
      backgroundOpacity: latest.current.textSettings.backgroundOpacity,
      rotation: 0,
    };
    
    onTextPlace(annotation);
    
    stateRef.current.textPosition = null;
    stateRef.current.textDraft = '';
    stateRef.current.textEditing = false;
    markDirty('overlay');
  }, [onTextPlace, textSettings, markDirty]);

  const cancelText = useCallback(() => {
    stateRef.current.textPosition = null;
    stateRef.current.textDraft = '';
    stateRef.current.textEditing = false;
    markDirty('overlay');
  }, [markDirty]);

  // ============================================
  // ERASE MODE
  // ============================================
  
  const eraseAt = useCallback((at: PointerAt) => {
    if (!onErase || !mapId) return;
    
    // This would need hit testing against existing elements
    // For now, we'll emit an erase event
    sendPreview('erase:preview', {
      x: at.mapPx.x,
      y: at.mapPx.y,
      radius: latest.current.brushSettings.size * gridSize,
    });
    
    // Actual erase would be handled by server response
    markDirty('overlay');
  }, [onErase, mapId, brushSettings, gridSize, sendPreview, markDirty]);

  // ============================================
  // SELECT MODE
  // ============================================
  
  const startSelect = useCallback((at: PointerAt) => {
    if (!mapId) return false;
    
    const point = round(at.mapPx);
    stateRef.current.selectStart = point;
    stateRef.current.selectBox = { x1: point[0], y1: point[1], x2: point[0], y2: point[1] };
    
    markDirty('overlay');
    return true;
  }, [mapId, markDirty]);

  const continueSelect = useCallback((at: PointerAt) => {
    const start = stateRef.current.selectStart;
    if (!start) return false;
    
    const point = round(at.mapPx);
    stateRef.current.selectBox = {
      x1: start[0],
      y1: start[1],
      x2: point[0],
      y2: point[1],
    };
    
    markDirty('overlay');
    return true;
  }, [markDirty]);

  const endSelect = useCallback(() => {
    const box = stateRef.current.selectBox;
    if (!box || !onSelect) return;
    
    // Selection logic would go here
    // For now, just clear selection box
    stateRef.current.selectStart = null;
    stateRef.current.selectBox = null;
    markDirty('overlay');
  }, [onSelect, markDirty]);

  // ============================================
  // MAIN TOOL INTERFACE
  // ============================================
  
  const tool: MapTool = {
    down(at: PointerAt) {
      // Right click or two finger = pan
      if (at.e.button === 2 || at.via === 'drag') {
        stateRef.current.panning = true;
        mapControls.startDrag(at.e);
        return true;
      }
      
      // Escape handling
      if (stateRef.current.textEditing) {
        commitText();
      }
      
      switch (latest.current.mode) {
        case 'brush':
          return startBrushStroke(at);
        case 'shape':
          if (latest.current.shapeSettings.type === 'polygon') {
            return addPolygonPoint(at);
          }
          return startShape(at);
        case 'freehand':
          return startFreehand(at);
        case 'text':
          return startText(at);
        case 'erase':
          stateRef.current.erasing = true;
          eraseAt(at);
          return true;
        case 'select':
          return startSelect(at);
      }
      return false;
    },
    
    move(at: PointerAt) {
      if (stateRef.current.panning) {
        mapControls.handleDrag(at.e);
        markDirty('terrain', 'tokens', 'overlay');
        return true;
      }
      
      switch (latest.current.mode) {
        case 'brush':
          return continueBrushStroke(at);
        case 'shape':
          if (latest.current.shapeSettings.type !== 'polygon') {
            return continueShape(at);
          }
          return false; // Polygon points added on click
        case 'freehand':
          return continueFreehand(at);
        case 'erase':
          if (stateRef.current.erasing) {
            eraseAt(at);
            return true;
          }
          return false;
        case 'select':
          if (stateRef.current.selectStart) {
            return continueSelect(at);
          }
          return false;
      }
      return false;
    },
    
    up(at?: PointerAt) {
      stateRef.current.panning = false;
      stateRef.current.erasing = false;
      
      switch (latest.current.mode) {
        case 'brush':
          endBrushStroke();
          break;
        case 'shape':
          if (latest.current.shapeSettings.type !== 'polygon') {
            endShape();
          }
          break;
        case 'freehand':
          endFreehand();
          break;
        case 'select':
          if (stateRef.current.selectStart) {
            endSelect();
          }
          break;
      }
    },
    
    cancel() {
      stateRef.current.panning = false;
      stateRef.current.erasing = false;
      clearTimer('brush-preview');
      clearTimer('freehand-preview');
      
      // Cancel current operation
      stateRef.current.brushStroke = null;
      stateRef.current.shapeStart = null;
      stateRef.current.shapePreview = null;
      stateRef.current.freehandPoints = [];
      stateRef.current.freehandPreviewId = null;
      stateRef.current.textPosition = null;
      stateRef.current.textDraft = '';
      stateRef.current.textEditing = false;
      stateRef.current.selectStart = null;
      stateRef.current.selectBox = null;
      
      // Send cancel previews
      sendPreview('tile:preview:end', { previewId: 'cancel' });
      sendPreview('drawing:preview:end', { previewId: 'cancel' });
      
      markDirty('overlay');
    },
    
    escape() {
      if (stateRef.current.textEditing) {
        cancelText();
        return true;
      }
      if (stateRef.current.shapePreview?.type === 'polygon' && stateRef.current.shapePreview.points.length > 0) {
        stateRef.current.shapePreview = null;
        stateRef.current.shapeStart = null;
        markDirty('overlay');
        return true;
      }
      return false;
    },
    
    leave() {
      // Drop previews when leaving canvas
      if (stateRef.current.brushStroke) {
        sendPreview('tile:preview:end', { previewId: stateRef.current.brushStroke.previewId });
        stateRef.current.brushStroke = null;
      }
      if (stateRef.current.freehandPreviewId) {
        sendPreview('drawing:preview:end', { previewId: stateRef.current.freehandPreviewId });
        stateRef.current.freehandPoints = [];
        stateRef.current.freehandPreviewId = null;
      }
      if (stateRef.current.shapePreview) {
        stateRef.current.shapePreview = null;
        stateRef.current.shapeStart = null;
      }
      markDirty('overlay');
    },
  };

  // ============================================
  // PREVIEW RENDERING DATA
  // ============================================
  
  const getPreviews = useCallback(() => {
    const previews: unknown[] = [];
    const state = stateRef.current;
    
    if (state.brushStroke) {
      previews.push({
        type: 'brush',
        tileId: state.brushStroke.tileId,
        variant: state.brushStroke.variant,
        points: state.brushStroke.points,
      });
    }
    
    if (state.shapePreview) {
      previews.push({
        type: 'shape',
        shape: state.shapePreview,
      });
    }
    
    if (state.freehandPoints.length > 0) {
      previews.push({
        type: 'freehand',
        points: state.freehandPoints,
        color: latest.current.freehandSettings.color,
        strokeWidth: latest.current.freehandSettings.strokeWidth,
      });
    }
    
    if (state.textPosition && state.textDraft) {
      previews.push({
        type: 'text',
        x: state.textPosition[0],
        y: state.textPosition[1],
        text: state.textDraft,
        fontSize: latest.current.textSettings.fontSize,
        color: latest.current.textSettings.color,
        fontFamily: latest.current.textSettings.fontFamily,
      });
    }
    
    if (state.selectBox) {
      previews.push({
        type: 'select',
        box: state.selectBox,
      });
    }
    
    return previews;
  }, [freehandSettings, textSettings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  return {
    tool,
    getPreviews,
    // State accessors for UI
    isDrawing: stateRef.current.brushStroke !== null || 
               stateRef.current.shapePreview !== null || 
               stateRef.current.freehandPoints.length > 0 ||
               stateRef.current.textEditing,
    isTextEditing: stateRef.current.textEditing,
    textDraft: stateRef.current.textDraft,
    setTextDraft: (draft: string) => { stateRef.current.textDraft = draft; },
    commitText,
    cancelText,
    textInputRef: setTextInputRef,
  };
}

export type DrawingTool = ReturnType<typeof useDrawingTool>;