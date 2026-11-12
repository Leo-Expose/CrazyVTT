// ============================================
// Room Tool - Click-drag rectangle to auto-place floor + walls + doors
// ============================================

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { WallSegment, WallType } from '@/types/walls';
import { api } from '@/services/api';
import { randomId } from '@/utils/uuid';
import { useToast } from '@/contexts/ToastContext';
import Button from '@/components/ui/Button';

interface RoomToolProps {
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
  wallSegments: WallSegment[];
  setWallSegments: (segments: WallSegment[]) => void;
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
  defaultWallThickness: number;
  defaultDoorWidth: number;
}

interface FloorTile {
  tileId: string;
  assetId: string;
}

export default function RoomTool({
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
  wallSegments,
  setWallSegments,
  layers,
  setLayers,
  snapToGrid: initialSnapToGrid,
  defaultWallThickness = 1,
  defaultDoorWidth = 1,
}: RoomToolProps) {
  const { showToast } = useToast();

  const [snapToGrid, setSnapToGrid] = useState(initialSnapToGrid);
  const [floorTile, setFloorTile] = useState<FloorTile | null>(null);
  const [wallType, setWallType] = useState<WallType>('normal');
  const [wallThickness, setWallThickness] = useState(defaultWallThickness);
  const [doorWidth, setDoorWidth] = useState(defaultDoorWidth);
  const [autoDoors, setAutoDoors] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [rectEnd, setRectEnd] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Get floor tiles from TERRAIN layer
  const terrainLayer = useMemo(() => layers.find(l => l.type === 'TERRAIN' && !l.locked), [layers]);
  const floorTiles = useMemo(() => {
    if (!terrainLayer?.data?.tiles) return [];
    return terrainLayer.data.tiles
      .filter((t): t is Record<string, unknown> & { tileId: string } => typeof t?.tileId === 'string')
      .map(t => ({ tileId: t.tileId, assetId: t.tileId }));
  }, [terrainLayer]);

  const snapPoint = useCallback((point: { x: number; y: number }) => {
    if (!snapToGrid) return point;
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }, [snapToGrid]);

  // Create room with walls and floor
  const createRoom = useCallback(async (
    x1: number, y1: number, x2: number, y2: number
  ) => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;

    if (width < 2 || height < 2) {
      showToast('Room must be at least 2x2 squares', 'error');
      return;
    }

    const newWalls: WallSegment[] = [];
    const newFloorTiles: Array<{ tileId: string; x: number; y: number }> = [];

    // Place floor tiles
    if (floorTile) {
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          newFloorTiles.push({ tileId: floorTile.tileId, x, y });
        }
      }
    }

    // Create perimeter walls
    // Top wall
    for (let x = minX; x <= maxX; x++) {
      if (autoDoors && x === minX + Math.floor(width / 2) && doorWidth === 1) {
        newWalls.push({
          id: randomId(),
          x1: x, y1: minY - 0.5,
          x2: x + 1, y2: minY - 0.5,
          type: 'door',
          doorState: 'closed',
        });
        x += doorWidth - 1;
      } else {
        newWalls.push({
          id: randomId(),
          x1: x, y1: minY - 0.5,
          x2: x + 1, y2: minY - 0.5,
          type: wallType,
        });
      }
    }

    // Bottom wall
    for (let x = minX; x <= maxX; x++) {
      if (autoDoors && x === minX + Math.floor(width / 2) && doorWidth === 1) {
        newWalls.push({
          id: randomId(),
          x1: x, y1: maxY + 0.5,
          x2: x + 1, y2: maxY + 0.5,
          type: 'door',
          doorState: 'closed',
        });
        x += doorWidth - 1;
      } else {
        newWalls.push({
          id: randomId(),
          x1: x, y1: maxY + 0.5,
          x2: x + 1, y2: maxY + 0.5,
          type: wallType,
        });
      }
    }

    // Left wall
    for (let y = minY; y <= maxY; y++) {
      if (autoDoors && y === minY + Math.floor(height / 2) && doorWidth === 1) {
        newWalls.push({
          id: randomId(),
          x1: minX - 0.5, y1: y,
          x2: minX - 0.5, y2: y + 1,
          type: 'door',
          doorState: 'closed',
        });
        y += doorWidth - 1;
      } else {
        newWalls.push({
          id: randomId(),
          x1: minX - 0.5, y1: y,
          x2: minX - 0.5, y2: y + 1,
          type: wallType,
        });
      }
    }

    // Right wall
    for (let y = minY; y <= maxY; y++) {
      if (autoDoors && y === minY + Math.floor(height / 2) && doorWidth === 1) {
        newWalls.push({
          id: randomId(),
          x1: maxX + 0.5, y1: y,
          x2: maxX + 0.5, y2: y + 1,
          type: 'door',
          doorState: 'closed',
        });
        y += doorWidth - 1;
      } else {
        newWalls.push({
          id: randomId(),
          x1: maxX + 0.5, y1: y,
          x2: maxX + 0.5, y2: y + 1,
          type: wallType,
        });
      }
    }

    // Update walls
    const updatedWalls = [...wallSegments, ...newWalls];
    setWallSegments(updatedWalls);

    // Update floor layer
    if (floorTile && terrainLayer) {
      const currentTiles = (terrainLayer.data.tiles || []) as Array<Record<string, unknown>>;
      const newTiles = [...currentTiles];

      for (const ft of newFloorTiles) {
        const existingIndex = newTiles.findIndex(t => t.x === ft.x && t.y === ft.y);
        const newTile = { tileId: ft.tileId, x: ft.x, y: ft.y, rotation: 0, flipH: false, flipV: false };
        if (existingIndex >= 0) {
          newTiles[existingIndex] = newTile;
        } else {
          newTiles.push(newTile);
        }
      }

      const layerIndex = layers.findIndex(l => l.id === terrainLayer.id);
      if (layerIndex >= 0) {
        const updatedLayers = [...layers];
        updatedLayers[layerIndex] = {
          ...updatedLayers[layerIndex],
          data: { ...updatedLayers[layerIndex].data, tiles: newTiles }
        };
        setLayers(updatedLayers);

        try {
          await api.put(`/campaigns/${useGameStore.getState().campaignId}/maps/${mapId}/layers/${terrainLayer.id}`, {
            data: { tiles: newTiles }
          });
        } catch {
          console.error('Failed to update floor tiles');
        }
      }
    }

    // Send walls to server
    try {
      await api.post(`/campaigns/${useGameStore.getState().campaignId}/maps/${mapId}/walls`, {
        segments: newWalls
      });
      showToast(`Room created: ${width}×${height} (${newWalls.length} walls${floorTile ? `, ${newFloorTiles.length} floor tiles` : ''})`, 'success');
    } catch {
      console.error('Failed to create room walls');
      showToast('Failed to create room', 'error');
      setWallSegments(wallSegments);
    }
  }, [wallSegments, layers, terrainLayer, floorTile, wallType, doorWidth, autoDoors, mapId, setWallSegments, setLayers, showToast]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDM || !active) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridPos = screenToGrid(x, y);
    const snapped = snapPoint(gridPos);

    setRectStart(snapped);
    setRectEnd(snapped);
    setDrawing(true);
    e.preventDefault();
  }, [isDM, active, screenToGrid, snapPoint]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !rectStart) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridPos = screenToGrid(x, y);
    const snapped = snapPoint(gridPos);

    setRectEnd(snapped);
  }, [drawing, rectStart, screenToGrid, snapPoint]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (!drawing || !rectStart || !rectEnd) {
      setDrawing(false);
      return;
    }

    createRoom(rectStart.x, rectStart.y, rectEnd.x, rectEnd.y);
    setDrawing(false);
    setRectStart(null);
    setRectEnd(null);
  }, [drawing, rectStart, rectEnd, createRoom]);

  const drawWall = useCallback((
    ctx: CanvasRenderingContext2D,
    segment: WallSegment,
    gridSize: number,
    viewport: { x: number; y: number; zoom: number },
    gridToScreen: (x: number, y: number) => { x: number; y: number }
  ) => {
    const start = gridToScreen(segment.x1, segment.y1);
    const end = gridToScreen(segment.x2, segment.y2);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);

    const colors: Partial<Record<WallType, string>> = {
      normal: '#6b7280', door: '#f59e0b', secret: '#8b5cf6',
      portcullis: '#ef4444', window: 'rgb(59, 130, 246)', 'terrain-boundary': '#22c55e'
    };
    ctx.strokeStyle = colors[segment.type] || colors.normal || '#6b7280';
    ctx.lineWidth = 2 * viewport.zoom;
    ctx.lineCap = 'round';
    ctx.stroke();

    if (segment.type === 'door') {
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const angle = Math.atan2(end.y - start.y, end.x - start.x);

      ctx.save();
      ctx.translate(midX, midY);
      ctx.rotate(angle + Math.PI / 2);
      const doorWidthPx = gridSize * viewport.zoom * 0.8;
      ctx.beginPath();
      ctx.moveTo(-doorWidthPx / 2, 0);
      ctx.lineTo(doorWidthPx / 2, 0);
      ctx.strokeStyle = segment.doorState === 'open' ? '#22c55e' : '#f59e0b';
      ctx.lineWidth = 3 * viewport.zoom;
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  const drawRoomPreview = useCallback((
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

    // Floor preview
    ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
    ctx.fillRect(screenStart.x, screenStart.y, screenEnd.x - screenStart.x, screenEnd.y - screenStart.y);

    // Wall preview
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
    ctx.lineWidth = 2 * viewport.zoom;
    ctx.setLineDash([5 * viewport.zoom, 5 * viewport.zoom]);
    ctx.strokeRect(screenStart.x, screenStart.y, screenEnd.x - screenStart.x, screenEnd.y - screenStart.y);
    ctx.setLineDash([]);

    // Door indicators
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (autoDoors) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.8)';
      // Top door
      const topDoorX = gridToScreen(minX + Math.floor(width / 2), minY - 0.5).x;
      ctx.fillRect(topDoorX - 4 * viewport.zoom, screenStart.y - 3 * viewport.zoom, 8 * viewport.zoom, 6 * viewport.zoom);
      // Bottom door
      const bottomDoorX = gridToScreen(minX + Math.floor(width / 2), maxY + 0.5).x;
      ctx.fillRect(bottomDoorX - 4 * viewport.zoom, screenEnd.y - 3 * viewport.zoom, 8 * viewport.zoom, 6 * viewport.zoom);
      // Left door
      const leftDoorY = gridToScreen(minX - 0.5, minY + Math.floor(height / 2)).y;
      ctx.fillRect(screenStart.x - 3 * viewport.zoom, leftDoorY - 4 * viewport.zoom, 6 * viewport.zoom, 8 * viewport.zoom);
      // Right door
      const rightDoorY = gridToScreen(maxX + 0.5, minY + Math.floor(height / 2)).y;
      ctx.fillRect(screenEnd.x - 3 * viewport.zoom, rightDoorY - 4 * viewport.zoom, 6 * viewport.zoom, 8 * viewport.zoom);
    }

    // Dimensions label
    ctx.fillStyle = 'rgba(34, 197, 94, 1)';
    ctx.font = `${12 * viewport.zoom}px monospace`;
    ctx.fillText(`${width}×${height}`, screenStart.x + 4, screenStart.y + 16 * viewport.zoom);
  }, [autoDoors]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw existing walls
      for (const segment of wallSegments) {
        drawWall(ctx, segment, gridSize, viewport, gridToScreen);
      }

      // Draw room preview
      if (drawing && rectStart && rectEnd) {
        drawRoomPreview(ctx, rectStart, rectEnd, gridSize, viewport, gridToScreen);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameRef.current!);
  }, [wallSegments, drawing, rectStart, rectEnd, gridSize, viewport, gridToScreen, drawWall, drawRoomPreview]);

  // Cleanup
  useEffect(() => {
    return () => {
      setDrawing(false);
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
          <span className="text-xs text-muted-foreground">Floor:</span>
          <select
            value={floorTile?.tileId || ''}
            onChange={(e) => {
              const tileId = e.target.value;
              if (!tileId) {
                setFloorTile(null);
              } else {
                const tile = floorTiles.find(t => t.tileId === tileId);
                if (tile) setFloorTile(tile);
              }
            }}
            className="px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring min-w-[140px]"
          >
            <option value="">No floor (walls only)</option>
            {floorTiles.map(tile => (
              <option key={tile.tileId} value={tile.tileId}>
                Tile {tile.tileId.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <span className="text-xs text-muted-foreground">Wall:</span>
          <select
            value={wallType}
            onChange={(e) => setWallType(e.target.value as WallType)}
            className="px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="normal">Wall</option>
            <option value="door">Door</option>
            <option value="secret">Secret</option>
            <option value="portcullis">Portcullis</option>
            <option value="window">Window</option>
            <option value="terrain-boundary">Terrain</option>
          </select>
        </div>

        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <span className="text-xs text-muted-foreground">Thickness:</span>
          <select
            value={wallThickness}
            onChange={(e) => setWallThickness(Number(e.target.value))}
            className="px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring w-16"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>

        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoDoors}
              onChange={(e) => setAutoDoors(e.target.checked)}
              className="w-4 h-4 accent-ring"
            />
            <span className="text-sm text-foreground">Auto-doors</span>
          </label>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Door width:</span>
          <select
            value={doorWidth}
            onChange={(e) => setDoorWidth(Number(e.target.value))}
            className="px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring w-16"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>

        <Button variant="ghost" size="sm" onClick={onDeactivate} title="Exit room tool">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
