// ============================================
// Tile Stamp Tool - Click to stamp, drag for rectangle fill
// ============================================

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';
import { useToast } from '@/components/Toast';
import TilePalette from './TilePalette';
import Button from '@/components/ui/Button';

interface TileStampToolProps {
  mapId: string;
  isDM: boolean;
  active: boolean;
  onDeactivate: () => void;
  mapWidth: number;
  mapHeight: number;
  gridSize: number;
  viewport: { x: number; y: number; zoom: number };
  screenToGrid: (x: number, y: number) => { x: number; y: number };
  gridToScreen: (x: number, y: number) => { x: number; y: number };
  layers: Array<{
    id: string;
    name: string;
    type: string;
    order: number;
    visible: boolean;
    locked: boolean;
    data: { tiles?: Array<Record<string, unknown>> };
  }>;
  setLayers: (layers: Array<{
    id: string;
    name: string;
    type: string;
    order: number;
    visible: boolean;
    locked: boolean;
    data: { tiles?: Array<Record<string, unknown>> };
  }>) => void;
  snapToGrid: boolean;
}

interface TileVariant {
  id: string;
  name: string;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

interface PlacedTile {
  tileId: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  variant?: string;
  width?: number;
  height?: number;
}

const DEFAULT_VARIANT: TileVariant = {
  id: 'default',
  name: 'Default',
  rotation: 0,
  flipH: false,
  flipV: false,
};

export default function TileStampTool({
  mapId,
  isDM,
  active,
  onDeactivate,
  mapWidth,
  mapHeight,
  gridSize,
  viewport,
  screenToGrid,
  gridToScreen,
  layers,
  setLayers,
  snapToGrid: initialSnapToGrid,
}: TileStampToolProps) {
  const { showToast } = useToast();

  // State
  const [snapToGrid, setSnapToGrid] = useState(initialSnapToGrid);
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [selectedTile, setSelectedTile] = useState<{ tileId: string; assetId: string; width: number; height: number } | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<TileVariant>(DEFAULT_VARIANT);
  const [showPalette, setShowPalette] = useState(true);
  const [mode, setMode] = useState<'stamp' | 'rectangle' | 'brush'>('stamp');
  const [drawing, setDrawing] = useState(false);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [rectEnd, setRectEnd] = useState<{ x: number; y: number } | null>(null);
  const [previewTiles, setPreviewTiles] = useState<PlacedTile[]>([]);
  const [showVariantPanel, setShowVariantPanel] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Get tile layers (TERRAIN, STRUCTURE, FURNITURE)
  const tileLayers = useMemo(() => layers.filter(l =>
    ['TERRAIN', 'STRUCTURE', 'FURNITURE'].includes(l.type) && !l.locked
  ), [layers]);

  // Auto-select first tile layer
  useEffect(() => {
    if (tileLayers.length > 0 && !selectedLayerId) {
      setSelectedLayerId(tileLayers[0].id);
    }
  }, [tileLayers, selectedLayerId]);

  // Handle tile selection from palette
  const handleTileSelect = useCallback((tile: { id: string; assetId: string; width: number; height: number }, variant: TileVariant) => {
    setSelectedTile({
      tileId: tile.id,
      assetId: tile.assetId,
      width: tile.width,
      height: tile.height,
    });
    setSelectedVariant(variant);
    setShowVariantPanel(false);
  }, []);

  // Snap point to grid
  const snapPoint = useCallback((point: { x: number; y: number }) => {
    if (!snapToGrid) return point;
    return {
      x: Math.round(point.x),
      y: Math.round(point.y)
    };
  }, [snapToGrid]);

  // Get current layer data
  const getCurrentLayerTiles = useCallback((): PlacedTile[] => {
    const layer = layers.find(l => l.id === selectedLayerId);
    return (layer?.data?.tiles || []) as unknown as PlacedTile[];
  }, [layers, selectedLayerId]);

  // Update layer tiles
  const updateLayerTiles = useCallback(async (tiles: PlacedTile[]) => {
    const layerIndex = layers.findIndex(l => l.id === selectedLayerId);
    if (layerIndex === -1) return;

    const updatedLayers = [...layers];
    updatedLayers[layerIndex] = {
      ...updatedLayers[layerIndex],
      data: { ...updatedLayers[layerIndex].data, tiles: tiles as unknown as Record<string, unknown>[] }
    };
    setLayers(updatedLayers);

    // Send to server
    try {
      await api.put(`/campaigns/${useGameStore.getState().campaignId}/maps/${mapId}/layers/${selectedLayerId}`, {
        data: { tiles }
      });
    } catch {
      console.error('Failed to update layer tiles');
      showToast('Failed to update tiles', 'error');
    }
  }, [layers, selectedLayerId, mapId, setLayers, showToast]);

  // Place single tile
  const placeTile = useCallback((x: number, y: number) => {
    if (!selectedTile) return;

    const currentTiles = getCurrentLayerTiles();
    const existingIndex = currentTiles.findIndex(t => t.x === x && t.y === y);
    const newTile: PlacedTile = {
      tileId: selectedTile.tileId,
      x,
      y,
      rotation: selectedVariant.rotation,
      flipH: selectedVariant.flipH,
      flipV: selectedVariant.flipV,
    };

    let updatedTiles: PlacedTile[];
    if (existingIndex >= 0) {
      updatedTiles = [...currentTiles];
      updatedTiles[existingIndex] = newTile;
    } else {
      updatedTiles = [...currentTiles, newTile];
    }

    updateLayerTiles(updatedTiles);
  }, [selectedTile, selectedVariant, getCurrentLayerTiles, updateLayerTiles]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDM || !active || !selectedTile) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridPos = screenToGrid(x, y);
    const snapped = snapPoint(gridPos);

    if (mode === 'stamp') {
      placeTile(snapped.x, snapped.y);
    } else if (mode === 'rectangle') {
      setRectStart(snapped);
      setRectEnd(snapped);
      setDrawing(true);
    } else if (mode === 'brush') {
      setDrawing(true);
      placeTile(snapped.x, snapped.y);
    }

    e.preventDefault();
  }, [isDM, active, selectedTile, mode, screenToGrid, snapPoint, placeTile]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridPos = screenToGrid(x, y);
    const snapped = snapPoint(gridPos);

    if (mode === 'rectangle' && rectStart) {
      setRectEnd(snapped);

      // Show preview
      const minX = Math.min(rectStart.x, snapped.x);
      const maxX = Math.max(rectStart.x, snapped.x);
      const minY = Math.min(rectStart.y, snapped.y);
      const maxY = Math.max(rectStart.y, snapped.y);

      const preview: PlacedTile[] = [];
      for (let px = minX; px <= maxX; px++) {
        for (let py = minY; py <= maxY; py++) {
          preview.push({
            tileId: selectedTile!.tileId,
            x: px,
            y: py,
            rotation: selectedVariant.rotation,
            flipH: selectedVariant.flipH,
            flipV: selectedVariant.flipV,
          });
        }
      }
      setPreviewTiles(preview);
    } else if (mode === 'brush' && selectedTile) {
      placeTile(snapped.x, snapped.y);
    }
  }, [drawing, mode, rectStart, selectedTile, selectedVariant, screenToGrid, snapPoint, placeTile]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (!drawing) return;

    if (mode === 'rectangle' && rectStart && rectEnd && selectedTile) {
      const minX = Math.min(rectStart.x, rectEnd.x);
      const maxX = Math.max(rectStart.x, rectEnd.x);
      const minY = Math.min(rectStart.y, rectEnd.y);
      const maxY = Math.max(rectStart.y, rectEnd.y);

      const currentTiles = getCurrentLayerTiles();
      const newTiles = [...currentTiles];

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const existingIndex = newTiles.findIndex(t => t.x === x && t.y === y);
          const newTile: PlacedTile = {
            tileId: selectedTile.tileId,
            x,
            y,
            rotation: selectedVariant.rotation,
            flipH: selectedVariant.flipH,
            flipV: selectedVariant.flipV,
          };

          if (existingIndex >= 0) {
            newTiles[existingIndex] = newTile;
          } else {
            newTiles.push(newTile);
          }
        }
      }

      updateLayerTiles(newTiles);
      showToast(`Placed ${(maxX - minX + 1) * (maxY - minY + 1)} tiles`, 'success');
    }

    setDrawing(false);
    setRectStart(null);
    setRectEnd(null);
    setPreviewTiles([]);
  }, [drawing, mode, rectStart, rectEnd, selectedTile, selectedVariant, getCurrentLayerTiles, updateLayerTiles, showToast]);

  // Render loop for preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw placed tiles for current layer
      const currentTiles = getCurrentLayerTiles();
      for (const tile of currentTiles) {
        drawTile(ctx, tile, gridSize, viewport, gridToScreen);
      }

      // Draw preview tiles
      for (const tile of previewTiles) {
        drawTile(ctx, tile, gridSize, viewport, gridToScreen, true);
      }

      // Draw rectangle preview
      if (mode === 'rectangle' && rectStart && rectEnd) {
        drawRectPreview(ctx, rectStart, rectEnd, gridSize, viewport, gridToScreen);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameRef.current!);
  }, [previewTiles, rectStart, rectEnd, mode, viewport, gridSize, gridToScreen, getCurrentLayerTiles]);

  const drawTile = (
    ctx: CanvasRenderingContext2D,
    tile: PlacedTile,
    gridSize: number,
    viewport: { x: number; y: number; zoom: number },
    gridToScreen: (x: number, y: number) => { x: number; y: number },
    isPreview: boolean = false
  ) => {
    // Find the asset for this tile
    // In a real implementation, we'd look up the asset URL
    // For now, draw a colored rectangle as placeholder
    const screenPos = gridToScreen(tile.x, tile.y);
    const tileWidth = gridSize * viewport.zoom * (tile.width || 1);
    const tileHeight = gridSize * viewport.zoom * (tile.height || 1);

    ctx.save();
    ctx.translate(screenPos.x + tileWidth / 2, screenPos.y + tileHeight / 2);
    ctx.rotate((tile.rotation * Math.PI) / 180);
    ctx.scale(tile.flipH ? -1 : 1, tile.flipV ? -1 : 1);
    ctx.translate(-tileWidth / 2, -tileHeight / 2);

    // Draw tile placeholder
    ctx.fillStyle = isPreview ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.8)';
    ctx.fillRect(0, 0, tileWidth, tileHeight);

    // Border
    ctx.strokeStyle = isPreview ? 'rgba(59, 130, 246, 0.8)' : 'rgba(59, 130, 246, 1)';
    ctx.lineWidth = 1 * viewport.zoom;
    ctx.strokeRect(0, 0, tileWidth, tileHeight);

    ctx.restore();
  };

  const drawRectPreview = (
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    _gridSize: number,
    viewport: { x: number; y: number; zoom: number },
    gridToScreen: (x: number, y: number) => { x: number; y: number }
  ) => {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    const screenStart = gridToScreen(minX, minY);
    const screenEnd = gridToScreen(maxX + 1, maxY + 1);

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
    ctx.lineWidth = 2 * viewport.zoom;
    ctx.setLineDash([5 * viewport.zoom, 5 * viewport.zoom]);
    ctx.strokeRect(
      screenStart.x,
      screenStart.y,
      screenEnd.x - screenStart.x,
      screenEnd.y - screenStart.y
    );
    ctx.setLineDash([]);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      setDrawing(false);
      setRectStart(null);
      setRectEnd(null);
      cancelAnimationFrame(animationFrameRef.current!);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        style={{
          width: '100%',
          height: '100%',
          touchAction: 'none'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        width={viewport.zoom * mapWidth * gridSize}
        height={viewport.zoom * mapHeight * gridSize}
      />

      {/* Toolbar */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-surface/95 backdrop-blur-sm border border-border rounded-lg p-2 pointer-events-auto flex-wrap">
        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
              className="w-4 h-4 accent-ring"
            />
            <span className="text-sm text-foreground">Snap</span>
          </label>
        </div>

        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <span className="text-xs text-muted-foreground">Layer:</span>
          <select
            value={selectedLayerId}
            onChange={(e) => setSelectedLayerId(e.target.value)}
            className="px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring min-w-[140px]"
          >
            {tileLayers.map(layer => (
              <option key={layer.id} value={layer.id}>
                {layer.name} ({layer.type})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <span className="text-xs text-muted-foreground">Mode:</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'stamp' | 'rectangle' | 'brush')}
            className="px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="stamp">Stamp</option>
            <option value="rectangle">Rectangle</option>
            <option value="brush">Brush</option>
          </select>
        </div>

        {selectedTile && (
          <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
            <span className="text-xs text-muted-foreground">Variant:</span>
            <button
              onClick={() => setShowVariantPanel(true)}
              className="px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {selectedVariant.name}
            </button>
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={() => setShowPalette(!showPalette)} title="Toggle palette">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </Button>

        <Button variant="ghost" size="sm" onClick={onDeactivate} title="Exit tile tool">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>

      {/* Tile Palette */}
      {showPalette && (
        <div className="absolute top-2 right-2 z-10 w-80 max-h-[70vh] pointer-events-auto">
          <TilePalette
            mapId={mapId}
            isDM={isDM}
            onTileSelect={handleTileSelect}
            onClose={() => setShowPalette(false)}
          />
        </div>
      )}

      {/* Variant Panel */}
      {showVariantPanel && selectedTile && (
        <div className="absolute bottom-2 left-2 z-10 w-72 bg-surface border border-border rounded-lg shadow-lg p-3 pointer-events-auto">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-foreground">Tile Variants</h4>
            <button onClick={() => setShowVariantPanel(false)} className="p-1 rounded hover:bg-accent transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {([
              { id: 'default', name: 'Default', rotation: 0, flipH: false, flipV: false },
              { id: 'rot90', name: '90°', rotation: 90, flipH: false, flipV: false },
              { id: 'rot180', name: '180°', rotation: 180, flipH: false, flipV: false },
              { id: 'rot270', name: '270°', rotation: 270, flipH: false, flipV: false },
              { id: 'flipH', name: 'Flip H', rotation: 0, flipH: true, flipV: false },
              { id: 'flipV', name: 'Flip V', rotation: 0, flipH: false, flipV: true },
              { id: 'rot90flipH', name: '90°+H', rotation: 90, flipH: true, flipV: false },
              { id: 'rot90flipV', name: '90°+V', rotation: 90, flipH: false, flipV: true },
            ] as TileVariant[]).map(variant => (
              <button
                key={variant.id}
                onClick={() => setSelectedVariant(variant)}
                className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                  selectedVariant.id === variant.id ? 'border-ring bg-ring/10' : 'border-transparent hover:border-border'
                }`}
                title={variant.name}
              >
                <div className="w-full h-full bg-muted" style={{
                  transform: `rotate(${variant.rotation}deg) scaleX(${variant.flipH ? -1 : 1}) scaleY(${variant.flipV ? -1 : 1})`,
                  transformOrigin: 'center center'
                }}>
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="18" height="18" stroke="currentColor" fill="none" rx="2"/>
                      <path d="M9 12h6M12 9v6" stroke="currentColor"/>
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/70 text-[10px] text-white text-center">
                  {variant.name}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected Tile Indicator */}
      {selectedTile && !showVariantPanel && (
        <div className="absolute bottom-2 right-2 z-10 bg-surface/95 backdrop-blur-sm border border-border rounded-lg p-2 pointer-events-auto">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded overflow-hidden bg-muted relative">
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" stroke="currentColor" fill="none" rx="2"/>
                </svg>
              </div>
              <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/50 text-[10px] text-white font-mono text-center">
                {selectedTile.width}×{selectedTile.height}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">Selected Tile</p>
              <p className="text-xs text-muted-foreground">Click to place • Drag for rectangle</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedTile(null)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
