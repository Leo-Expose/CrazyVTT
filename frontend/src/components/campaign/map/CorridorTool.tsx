// ============================================
// Corridor Tool - Click start, click end to auto-place corridor tiles
// ============================================

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { WallSegment, WallType } from '@/types/walls';
import { api } from '@/services/api';
import { randomId } from '@/utils/uuid';
import { useToast } from '@/contexts/ToastContext';
import Button from '@/components/ui/Button';

interface CorridorToolProps {
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
    data: { tiles?: Array<{ tileId?: string; assetId?: string; [key: string]: unknown }> };
  }>;
  setLayers: (layers: Array<{
    id: string;
    name: string;
    type: string;
    order: number;
    visible: boolean;
    locked: boolean;
    data: Record<string, unknown>;
  }>) => void;
  snapToGrid: boolean;
  corridorWidth: number;
}

interface CorridorTile {
  tileId: string;
  assetId: string;
}

export default function CorridorTool({
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
  corridorWidth = 2,
}: CorridorToolProps) {
  const { showToast } = useToast();

  const [snapToGrid, setSnapToGrid] = useState(initialSnapToGrid);
  const [floorTile, setFloorTile] = useState<CorridorTile | null>(null);
  const [wallType, setWallType] = useState<WallType>('normal');
  const [width, setWidth] = useState(corridorWidth);
  const [autoWalls, setAutoWalls] = useState(true);
  const [autoCorners, setAutoCorners] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [pathPoints, setPathPoints] = useState<Array<{ x: number; y: number }>>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Get floor tiles from TERRAIN layer
  const terrainLayer = useMemo(() => layers.find(l => l.type === 'TERRAIN' && !l.locked), [layers]);
  const floorTiles = useMemo(() => {
    if (!terrainLayer?.data?.tiles) return [];
    return terrainLayer.data.tiles
      .filter((t): t is { tileId: string; assetId?: string } => Boolean(t && typeof t === 'object' && 'tileId' in t && (t as { tileId?: unknown }).tileId))
      .map((t) => ({ tileId: t.tileId, assetId: t.assetId || t.tileId }));
  }, [terrainLayer]);

  const snapPoint = useCallback((point: { x: number; y: number }) => {
    if (!snapToGrid) return point;
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }, [snapToGrid]);

  // Generate corridor path using Bresenham's line algorithm
  const generatePath = useCallback((x1: number, y1: number, x2: number, y2: number): Array<{ x: number; y: number }> => {
    const points: Array<{ x: number; y: number }> = [];
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (true) {
      points.push({ x, y });
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    return points;
  }, []);

  // Expand path to corridor width
  const expandPath = useCallback((path: Array<{ x: number; y: number }>, w: number): Array<{ x: number; y: number }> => {
    const expanded = new Set<string>();
    const halfWidth = Math.floor(w / 2);

    for (const point of path) {
      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        for (let dy = -halfWidth; dy <= halfWidth; dy++) {
          // For even widths, adjust to center properly
          const offsetX = w % 2 === 0 && dx === halfWidth ? dx - 1 : dx;
          const offsetY = w % 2 === 0 && dy === halfWidth ? dy - 1 : dy;
          expanded.add(`${point.x + offsetX},${point.y + offsetY}`);
        }
      }
    }

    return Array.from(expanded).map(s => {
      const [x, y] = s.split(',').map(Number);
      return { x, y };
    });
  }, []);

  // Find corners in path
  const findCorners = useCallback((path: Array<{ x: number; y: number }>): Array<{ x: number; y: number; type: 'convex' | 'concave' }> => {
    const corners: Array<{ x: number; y: number; type: 'convex' | 'concave' }> = [];

    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];

      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;

      // Check if direction changes (it's a corner)
      if (dx1 !== dx2 || dy1 !== dy2) {
        const cross = dx1 * dy2 - dy1 * dx2;
        corners.push({
          x: curr.x,
          y: curr.y,
          type: cross > 0 ? 'convex' : 'concave'
        });
      }
    }

    return corners;
  }, []);

  // Create corridor
  const createCorridor = useCallback(async () => {
    if (!startPoint || pathPoints.length < 2) return;

    const fullPath = pathPoints;
    const expandedTiles = expandPath(fullPath, width);
    const corners = autoCorners ? findCorners(fullPath) : [];

    const newWalls: WallSegment[] = [];
    const newFloorTiles: Array<{ tileId: string; x: number; y: number }> = [];

    // Place floor tiles
    if (floorTile) {
      for (const tile of expandedTiles) {
        newFloorTiles.push({ tileId: floorTile.tileId, x: tile.x, y: tile.y });
      }
    }

    // Create walls along corridor edges if enabled
    if (autoWalls) {
      // This is a simplified wall generation - in practice you'd want more sophisticated edge detection
      const tileSet = new Set(expandedTiles.map(t => `${t.x},${t.y}`));

      for (const tile of expandedTiles) {
        const { x, y } = tile;
        const neighbors = [
          { x: x + 1, y, dir: 'east' as const },
          { x: x - 1, y, dir: 'west' as const },
          { x, y: y + 1, dir: 'south' as const },
          { x, y: y - 1, dir: 'north' as const },
        ];

        for (const neighbor of neighbors) {
          if (!tileSet.has(`${neighbor.x},${neighbor.y}`)) {
            // This is an edge - add wall
            let wallX1 = x, wallY1 = y, wallX2 = x, wallY2 = y;
            switch (neighbor.dir) {
              case 'east': wallX1 = x + 0.5; wallY1 = y - 0.5; wallX2 = x + 0.5; wallY2 = y + 0.5; break;
              case 'west': wallX1 = x - 0.5; wallY1 = y - 0.5; wallX2 = x - 0.5; wallY2 = y + 0.5; break;
              case 'south': wallX1 = x - 0.5; wallY1 = y + 0.5; wallX2 = x + 0.5; wallY2 = y + 0.5; break;
              case 'north': wallX1 = x - 0.5; wallY1 = y - 0.5; wallX2 = x + 0.5; wallY2 = y - 0.5; break;
            }
            newWalls.push({
              id: randomId(),
              x1: wallX1, y1: wallY1, x2: wallX2, y2: wallY2,
              type: wallType,
            });
          }
        }
      }
    }

    // Add corner tiles if enabled (special corner pieces)
    if (autoCorners && corners.length > 0) {
      // In a full implementation, you'd place special corner tiles here
      console.log('Corners found:', corners);
    }

    // Update walls
    const updatedWalls = [...wallSegments, ...newWalls];
    setWallSegments(updatedWalls);

    // Update floor layer
    if (floorTile && terrainLayer) {
      const currentTiles = (terrainLayer.data.tiles || []) as Array<{ tileId?: string; x?: number; y?: number; rotation?: number; flipH?: boolean; flipV?: boolean }>;
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
    if (newWalls.length > 0) {
      try {
        await api.post(`/campaigns/${useGameStore.getState().campaignId}/maps/${mapId}/walls`, {
          segments: newWalls
        });
      } catch {
        console.error('Failed to create corridor walls');
        showToast('Failed to create corridor walls', 'error');
        setWallSegments(wallSegments);
      }
    }

    showToast(`Corridor created: ${expandedTiles.length} tiles, ${corners.length} corners${newWalls.length > 0 ? `, ${newWalls.length} wall segments` : ''}`, 'success');

    // Reset
    setPlacing(false);
    setStartPoint(null);
    setCurrentPoint(null);
    setPathPoints([]);
  }, [startPoint, pathPoints, width, floorTile, wallType, autoWalls, autoCorners, wallSegments, layers, terrainLayer, mapId, setWallSegments, setLayers, expandPath, findCorners, showToast]);

  // Handle click to place points
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDM || !active) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridPos = screenToGrid(x, y);
    const snapped = snapPoint(gridPos);

    if (!placing) {
      // First click - set start point
      setStartPoint(snapped);
      setCurrentPoint(snapped);
      setPathPoints([snapped]);
      setPlacing(true);
    } else {
      // Subsequent clicks - add to path
      const newPath = generatePath(
        pathPoints[pathPoints.length - 1].x,
        pathPoints[pathPoints.length - 1].y,
        snapped.x,
        snapped.y
      );
      // Skip first point as it's the last point of current path
      setPathPoints([...pathPoints, ...newPath.slice(1)]);
      setCurrentPoint(snapped);
    }
    e.preventDefault();
  }, [isDM, active, placing, pathPoints, screenToGrid, snapPoint, generatePath]);

  // Handle right click to finish
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!placing) return;
    e.preventDefault();
    createCorridor();
  }, [placing, createCorridor]);

  // Handle mouse move for preview
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!placing || !startPoint) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridPos = screenToGrid(x, y);
    const snapped = snapPoint(gridPos);

    setCurrentPoint(snapped);
  }, [placing, startPoint, screenToGrid, snapPoint]);

  const drawWall = useCallback((
    ctx: CanvasRenderingContext2D,
    segment: WallSegment,
    _gridSize: number,
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
  }, []);

  const drawCorridorPreview = useCallback((
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    current: { x: number; y: number } | null,
    path: Array<{ x: number; y: number }>,
    gridSize: number,
    viewport: { x: number; y: number; zoom: number },
    gridToScreen: (x: number, y: number) => { x: number; y: number }
  ) => {
    // Draw completed path
    if (path.length > 1) {
      const expanded = expandPath(path, width);

      // Floor preview
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      for (const tile of expanded) {
        const screenPos = gridToScreen(tile.x, tile.y);
        ctx.fillRect(screenPos.x, screenPos.y, gridSize * viewport.zoom, gridSize * viewport.zoom);
      }

      // Path line
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.lineWidth = 3 * viewport.zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([5 * viewport.zoom, 5 * viewport.zoom]);

      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const screenPos = gridToScreen(path[i].x + 0.5, path[i].y + 0.5);
        if (i === 0) ctx.moveTo(screenPos.x, screenPos.y);
        else ctx.lineTo(screenPos.x, screenPos.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw preview to current mouse position
    if (current && path.length > 0) {
      const previewPath = generatePath(
        path[path.length - 1].x,
        path[path.length - 1].y,
        current.x,
        current.y
      );
      const previewExpanded = expandPath(previewPath, width);

      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      for (const tile of previewExpanded) {
        const screenPos = gridToScreen(tile.x, tile.y);
        ctx.fillRect(screenPos.x, screenPos.y, gridSize * viewport.zoom, gridSize * viewport.zoom);
      }

      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
      ctx.lineWidth = 2 * viewport.zoom;
      ctx.lineCap = 'round';
      ctx.setLineDash([5 * viewport.zoom, 5 * viewport.zoom]);

      ctx.beginPath();
      const lastScreen = gridToScreen(path[path.length - 1].x + 0.5, path[path.length - 1].y + 0.5);
      ctx.moveTo(lastScreen.x, lastScreen.y);
      const currentScreen = gridToScreen(current.x + 0.5, current.y + 0.5);
      ctx.lineTo(currentScreen.x, currentScreen.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Start point marker
    const startScreen = gridToScreen(start.x + 0.5, start.y + 0.5);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(startScreen.x, startScreen.y, 6 * viewport.zoom, 0, Math.PI * 2);
    ctx.fill();

    // Current point marker
    if (current) {
      const currentScreen = gridToScreen(current.x + 0.5, current.y + 0.5);
      ctx.fillStyle = 'rgb(59, 130, 246)';
      ctx.beginPath();
      ctx.arc(currentScreen.x, currentScreen.y, 6 * viewport.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [expandPath, generatePath, width]);

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

      // Draw corridor preview
      if (placing && startPoint) {
        drawCorridorPreview(ctx, startPoint, currentPoint, pathPoints, gridSize, viewport, gridToScreen);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameRef.current!);
  }, [wallSegments, placing, startPoint, currentPoint, pathPoints, gridSize, viewport, gridToScreen, drawWall, drawCorridorPreview]);

  // Cleanup
  useEffect(() => {
    return () => {
      setPlacing(false);
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
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onContextMenu={handleContextMenu}
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
              if (!tileId) setFloorTile(null);
              else {
                const tile = floorTiles.find(t => t.tileId === tileId);
                if (tile) setFloorTile(tile);
              }
            }}
            className="px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring min-w-[140px]"
          >
            <option value="">No floor</option>
            {floorTiles.map(tile => (
              <option key={tile.tileId} value={tile.tileId}>Tile {tile.tileId.slice(0, 8)}</option>
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
          </select>
        </div>

        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <span className="text-xs text-muted-foreground">Width:</span>
          <select
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring w-16"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
          </select>
        </div>

        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoWalls}
              onChange={(e) => setAutoWalls(e.target.checked)}
              className="w-4 h-4 accent-ring"
            />
            <span className="text-sm text-foreground">Auto-walls</span>
          </label>
        </div>

        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCorners}
              onChange={(e) => setAutoCorners(e.target.checked)}
              className="w-4 h-4 accent-ring"
            />
            <span className="text-sm text-foreground">Auto-corners</span>
          </label>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {placing ? (
            <>
              <span>Click to add points</span>
              <span>•</span>
              <span className="text-ring">Right-click to finish</span>
            </>
          ) : (
            <span>Click to start corridor</span>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={onDeactivate} title="Exit corridor tool">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
