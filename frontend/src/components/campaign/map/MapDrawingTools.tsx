// ============================================
// MapDrawingTools - Integration component for Shmeppy-style drawing
// Adds ToolPalette, enhanced TilePalette, LayerPanel, and drawing hooks
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { useToast } from '@/contexts/ToastContext';
import { randomId } from '@/utils/uuid';
import {
  DrawingMode,
  ShapeType,
  BrushSettings,
  GridSettings,
  ShapeDefinition,
  FreehandStroke,
  TextAnnotation,
  TileVariant,
  ImageMapData,
  MapLayer,
} from '@/types';
import ToolPalette from './ToolPalette';
import TilePalette from './TilePalette';
import LayerPanel from './LayerPanel';
import { useDrawingTool } from './tools/useDrawingTool';
import { useImageImport } from './tools/useImageImport';
import { drawDrawingPreviews } from './layers/drawDrawings';

interface MapDrawingToolsProps {
  mapId: string;
  isDM: boolean;
  mapControls: ReturnType<typeof import('@/hooks/useMapControls').useMapControls>;
  markDirty: (...layers: string[]) => void;
  currentMap: {
    id: string;
    width: number;
    height: number;
    gridSize: number;
    imageUrl: string;
  } | null;
  viewport: {
    zoom: number;
    panOffset: { x: number; y: number };
    gridSize: number;
    mapWidth: number;
    mapHeight: number;
  };
  dpr: number;
  tileImages: Map<string, HTMLImageElement>;
}

const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  tileId: '',
  variant: { id: 'default', name: 'Default', rotation: 0, flipH: false, flipV: false },
  size: 1,
  shape: 'circle',
  opacity: 1,
  autoTile: false,
};

const DEFAULT_SHAPE_SETTINGS = {
  type: 'rect' as ShapeType,
  color: '#ff0000',
  fillColor: '#ff0000',
  strokeWidth: 2,
};

const DEFAULT_FREEHAND_SETTINGS = {
  color: '#000000',
  strokeWidth: 2,
};

const DEFAULT_TEXT_SETTINGS = {
  fontSize: 16,
  color: '#000000',
  fontFamily: 'Inter',
  backgroundColor: '#ffffff',
  backgroundOpacity: 0.8,
};

const DEFAULT_GRID_SETTINGS: GridSettings = {
  enabled: true,
  size: 50,
  color: '#000000',
  opacity: 0.3,
  snapMode: 'intersections',
  showCoordinates: false,
};

export function MapDrawingTools({
  mapId,
  isDM,
  mapControls,
  markDirty,
  currentMap,
  viewport,
  dpr,
  tileImages,
}: MapDrawingToolsProps) {
  const { campaign } = useCampaign();
  const { socket } = useWebSocket();
  const { user } = useAuth();
  const { showToast } = useToast();
  
  // Drawing state
  const [activeMode, setActiveMode] = useState<DrawingMode>('select');
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [brushSettings, setBrushSettings] = useState<BrushSettings>(DEFAULT_BRUSH_SETTINGS);
  const [shapeSettings, setShapeSettings] = useState(DEFAULT_SHAPE_SETTINGS);
  const [freehandSettings, setFreehandSettings] = useState(DEFAULT_FREEHAND_SETTINGS);
  const [textSettings, setTextSettings] = useState(DEFAULT_TEXT_SETTINGS);
  const [gridSettings, setGridSettings] = useState<GridSettings>({ ...DEFAULT_GRID_SETTINGS, size: currentMap?.gridSize || 50 });
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const [showTilePalette, setShowTilePalette] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showImageImport, setShowImageImport] = useState(false);
  const [drawingPreviews, setDrawingPreviews] = useState<Array<{
    type: 'brush' | 'shape' | 'freehand' | 'text' | 'select';
    [key: string]: unknown;
  }>>([]);
  const [history, setHistory] = useState<Array<{ id: string; action: string; data: unknown }>>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectedTile, setSelectedTile] = useState<{ tile: any; variant: TileVariant } | null>(null);
  
  // Use ref for isDM to avoid stale closures
  const isDMRef = useRef(isDM);
  isDMRef.current = isDM;

  // Initialize layers
  useEffect(() => {
    if (!campaign || !mapId) return;
    let cancelled = false;
    api.get<{ layers: MapLayer[] }>(`/campaigns/${campaign.id}/maps/${mapId}/layers`)
      .then(res => {
        if (!cancelled) setLayers(res.data.layers || []);
      })
      .catch(err => console.error('Failed to fetch layers:', err));
    return () => { cancelled = true; };
  }, [campaign, mapId]);

  // WebSocket listeners for layer updates
  useEffect(() => {
    if (!socket) return;
    
    const handleLayerAdded = (data: { mapId: string; layer: MapLayer }) => {
      if (data.mapId === mapId) setLayers(prev => [...prev, data.layer].sort((a, b) => a.order - b.order));
    };
    const handleLayerUpdated = (data: { mapId: string; layer: MapLayer }) => {
      if (data.mapId === mapId) setLayers(prev => prev.map(l => l.id === data.layer.id ? data.layer : l).sort((a, b) => a.order - b.order));
    };
    const handleLayerRemoved = (data: { mapId: string; layerId: string }) => {
      if (data.mapId === mapId) setLayers(prev => prev.filter(l => l.id !== data.layerId));
    };
    const handleLayersReordered = (data: { mapId: string; layers: MapLayer[] }) => {
      if (data.mapId === mapId) setLayers(data.layers);
    };

    socket.on('layer:added', handleLayerAdded);
    socket.on('layer:updated', handleLayerUpdated);
    socket.on('layer:removed', handleLayerRemoved);
    socket.on('layers:reordered', handleLayersReordered);

    return () => {
      socket.off('layer:added', handleLayerAdded);
      socket.off('layer:updated', handleLayerUpdated);
      socket.off('layer:removed', handleLayerRemoved);
      socket.off('layers:reordered', handleLayersReordered);
    };
  }, [socket, mapId]);

  // Tile placement handler
  const handleTilePlace = useCallback(async (tileId: string, x: number, y: number, variant: TileVariant) => {
    if (!activeLayerId || !socket || !campaign) return;
    
    const layer = layers.find(l => l.id === activeLayerId);
    if (!layer) return;

    // Send via WebSocket
    socket.emit('tile:place', {
      mapId,
      layerId: activeLayerId,
      tileId,
      x,
      y,
      rotation: variant.rotation,
      flipH: variant.flipH,
      flipV: variant.flipV,
      variant: variant.id,
    });

    // Optimistic update
    const currentData = layer.data as any;
    const tiles = currentData?.tiles || [];
    const newTile = { tileId, x, y, rotation: variant.rotation, flipH: variant.flipH, flipV: variant.flipV, variant: variant.id };
    const existingIndex = tiles.findIndex((t: any) => t.x === x && t.y === y);
    if (existingIndex >= 0) tiles[existingIndex] = newTile;
    else tiles.push(newTile);
    
    setLayers(prev => prev.map(l => l.id === activeLayerId ? { ...l, data: { ...l.data, tiles } } : l));
    
    // Add to history
    addToHistory('tile:place', { tileId, x, y, variant });
  }, [activeLayerId, socket, campaign, mapId, layers]);

  // Shape draw handler
  const handleShapeDraw = useCallback((shape: ShapeDefinition) => {
    if (!activeLayerId || !socket || !campaign) return;
    
    socket.emit('shape:draw', { mapId, layerId: activeLayerId, shape });
    addToHistory('shape:draw', shape);
  }, [activeLayerId, socket, campaign, mapId]);

  // Freehand draw handler
  const handleFreehandDraw = useCallback((stroke: FreehandStroke) => {
    if (!activeLayerId || !socket || !campaign) return;
    
    socket.emit('drawing:stroke', { mapId, layerId: activeLayerId, stroke });
    addToHistory('freehand:draw', stroke);
  }, [activeLayerId, socket, campaign, mapId]);

  // Text place handler
  const handleTextPlace = useCallback((annotation: TextAnnotation) => {
    if (!activeLayerId || !socket || !campaign) return;
    
    socket.emit('text:place', { mapId, layerId: activeLayerId, annotation });
    addToHistory('text:place', annotation);
  }, [activeLayerId, socket, campaign, mapId]);

  // Erase handler
  const handleErase = useCallback((type: string, id: string) => {
    if (!activeLayerId || !socket || !campaign) return;
    
    socket.emit('erase', { mapId, layerId: activeLayerId, type, id });
    addToHistory('erase', { type, id });
  }, [activeLayerId, socket, campaign, mapId]);

  // Select handler
  const handleSelect = useCallback((type: string, id: string, transform?: { x?: number; y?: number; rotation?: number; scale?: number }) => {
    if (!activeLayerId || !socket || !campaign) return;
    
    socket.emit('shape:update', {
      mapId,
      layerId: activeLayerId,
      shapeId: id,
      updates: transform || {},
    });
    addToHistory('shape:update', { type, id, transform });
  }, [activeLayerId, socket, campaign, mapId]);

  // Image import handler
  const handleImageImport = useCallback((imageMap: ImageMapData) => {
    if (!socket || !campaign) return;
    
    socket.emit('image:upload', { mapId, imageMap });
    addToHistory('image:upload', imageMap);
  }, [socket, campaign, mapId]);

  // History management
  const addToHistory = useCallback((action: string, data: unknown) => {
    const entry = { id: randomId(), action, data, timestamp: Date.now() };
    setHistory(prev => [...prev.slice(0, historyIndex + 1), entry]);
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex < 0) return;
    const entry = history[historyIndex];
    // Send undo via WebSocket
    socket?.emit('map:undo', { mapId, entryId: entry.id });
    setHistoryIndex(prev => prev - 1);
    showToast('Undo', 'info');
  }, [history, historyIndex, socket, mapId, showToast]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const entry = history[historyIndex + 1];
    // Send redo via WebSocket
    socket?.emit('map:redo', { mapId, entryId: entry.id });
    setHistoryIndex(prev => prev + 1);
    showToast('Redo', 'info');
  }, [history, historyIndex, socket, mapId, showToast]);

  // Use drawing tool hook
  const drawingTool = useDrawingTool({
    mode: activeMode,
    mapId,
    gridSize: currentMap?.gridSize || 50,
    activeLayerId,
    brushSettings,
    shapeSettings,
    freehandSettings,
    textSettings,
    gridSettings,
    mapControls,
    markDirty,
    onTilePlace: handleTilePlace,
    onShapeDraw: handleShapeDraw,
    onFreehandDraw: handleFreehandDraw,
    onTextPlace: handleTextPlace,
    onErase: handleErase,
    onSelect: handleSelect,
  });

  // Use image import hook
  const imageImport = useImageImport({
    mapId,
    campaignId: campaign?.id || '',
    gridSize: currentMap?.gridSize || 50,
    onImagePlaced: handleImageImport,
  });

  // Render drawing previews on overlay
  useEffect(() => {
    const previews = drawingTool.getPreviews();
    setDrawingPreviews(previews);
  }, [drawingTool, activeMode]);

  // Render function for overlay canvas
  const renderDrawingPreviews = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!currentMap) return;
    drawDrawingPreviews(
      ctx,
      {
        previews: drawingPreviews as any,
        now: Date.now(),
        reducedMotion: false,
        showDmOnly: isDM,
        laser: false,
      },
      viewport,
    );
  }, [drawingPreviews, viewport, currentMap, isDM]);

  // Return the UI components and render function
  return {
    // State
    activeMode,
    activeLayerId,
    brushSettings,
    shapeSettings,
    freehandSettings,
    textSettings,
    gridSettings,
    layers: [...layers].sort((a, b) => b.order - a.order), // Top first
    showTilePalette,
    showLayerPanel,
    showImageImport,
    drawingPreviews,
    history,
    historyIndex,
    canUndo: historyIndex >= 0,
    canRedo: historyIndex < history.length - 1,
    selectedTile,
    
    // Setters
    setActiveMode,
    setActiveLayerId,
    setBrushSettings,
    setShapeSettings,
    setFreehandSettings,
    setTextSettings,
    setGridSettings,
    setLayers,
    setShowTilePalette,
    setShowLayerPanel,
    setShowImageImport,
    setSelectedTile,
    
    // Handlers
    handleTilePlace,
    handleShapeDraw,
    handleFreehandDraw,
    handleTextPlace,
    handleErase,
    handleSelect,
    handleImageImport,
    undo,
    redo,
    
    // Tools
    drawingTool,
    imageImport,
    
    // Render
    renderDrawingPreviews,
    
    // Components
    ToolPalette,
    TilePalette,
    LayerPanel,
  };
}