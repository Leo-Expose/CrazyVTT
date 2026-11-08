// ============================================
// Wall Tool - Shmeppy-style click-drag wall drawing
// ============================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { WallSegment, WallType } from '@/types/walls';
import { api } from '@/services/api';
import { randomId } from '@/utils/uuid';
import { useToast } from '@/components/Toast';
import Button from '@/components/ui/Button';

interface WallToolProps {
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
  snapToGrid: boolean;
}

const WALL_COLORS: Partial<Record<WallType, string>> = {
  normal: '#6b7280',      // gray
  door: '#f59e0b',        // amber
  secret: '#8b5cf6',      // violet
  portcullis: '#ef4444',  // red
  window: 'rgb(59, 130, 246)',      // blue
  'terrain-boundary': '#22c55e', // green
};

const WALL_THICKNESS = 3;

export default function WallTool({
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
  snapToGrid: initialSnapToGrid,
}: WallToolProps) {
  const { showToast } = useToast();

  // State
  const [snapToGrid, setSnapToGrid] = useState(initialSnapToGrid);
  const [wallType, setWallType] = useState<WallType>('normal');
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ segment: WallSegment; x: number; y: number } | null>(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Merge collinear segments
  const mergeCollinearSegments = useCallback((segments: WallSegment[]): WallSegment[] => {
    const merged: WallSegment[] = [];
    const used = new Set<string>();

    for (const segment of segments) {
      if (used.has(segment.id)) continue;

      let current = { ...segment };
      let changed = true;

      while (changed) {
        changed = false;
        for (const other of segments) {
          if (used.has(other.id) || other.id === current.id) continue;
          if (other.type !== current.type) continue;

          // Check if collinear and connected
          const collinearHorizontal = current.y1 === current.y2 && other.y1 === other.y2 && current.y1 === other.y1;
          const collinearVertical = current.x1 === current.x2 && other.x1 === other.x2 && current.x1 === other.x1;

          if (collinearHorizontal) {
            // Check if they connect end-to-end
            if (current.x2 === other.x1) {
              current = { ...current, x2: other.x2, id: randomId() };
              used.add(other.id);
              changed = true;
            } else if (other.x2 === current.x1) {
              current = { ...current, x1: other.x1, id: randomId() };
              used.add(other.id);
              changed = true;
            }
          } else if (collinearVertical) {
            if (current.y2 === other.y1) {
              current = { ...current, y2: other.y2, id: randomId() };
              used.add(other.id);
              changed = true;
            } else if (other.y2 === current.y1) {
              current = { ...current, y1: other.y1, id: randomId() };
              used.add(other.id);
              changed = true;
            }
          }
        }
      }

      used.add(current.id);
      merged.push(current);
    }

    return merged;
  }, []);

  // Split segments at intersections
  const splitAtIntersections = useCallback((segments: WallSegment[]): WallSegment[] => {
    const result: WallSegment[] = [];

    for (const segment of segments) {
      let currentSegments: WallSegment[] = [segment];

      for (const other of segments) {
        if (other.id === segment.id) continue;

        const newSegments: WallSegment[] = [];
        for (const current of currentSegments) {
          const intersection = findIntersection(current, other);
          if (intersection && !isEndpoint(current, intersection) && !isEndpoint(other, intersection)) {
            // Split current at intersection
            newSegments.push(
              { ...current, x2: intersection.x, y2: intersection.y, id: randomId() },
              { ...current, x1: intersection.x, y1: intersection.y, id: randomId() }
            );
          } else {
            newSegments.push(current);
          }
        }
        currentSegments = newSegments;
      }

      result.push(...currentSegments);
    }

    return result;
  }, []);

  // Find intersection between two line segments
  const findIntersection = (seg1: WallSegment, seg2: WallSegment): { x: number; y: number } | null => {
    const x1 = seg1.x1, y1 = seg1.y1, x2 = seg1.x2, y2 = seg1.y2;
    const x3 = seg2.x1, y3 = seg2.y1, x4 = seg2.x2, y4 = seg2.y2;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.001) return null; // Parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1)
      };
    }
    return null;
  };

  const isEndpoint = (segment: WallSegment, point: { x: number; y: number }): boolean => {
    return (Math.abs(segment.x1 - point.x) < 0.001 && Math.abs(segment.y1 - point.y) < 0.001) ||
           (Math.abs(segment.x2 - point.x) < 0.001 && Math.abs(segment.y2 - point.y) < 0.001);
  };

  // Snap point to grid
  const snapPoint = useCallback((point: { x: number; y: number }) => {
    if (!snapToGrid) return point;
    return {
      x: Math.round(point.x),
      y: Math.round(point.y)
    };
  }, [snapToGrid]);

  const findNearbyEndpoint = useCallback((point: { x: number; y: number }): { x: number; y: number } | null => {
    const threshold = 0.5; // Grid squares
    for (const segment of wallSegments) {
      if (Math.hypot(segment.x1 - point.x, segment.y1 - point.y) < threshold) {
        return { x: segment.x1, y: segment.y1 };
      }
      if (Math.hypot(segment.x2 - point.x, segment.y2 - point.y) < threshold) {
        return { x: segment.x2, y: segment.y2 };
      }
    }
    return null;
  }, [wallSegments]);

  // Handle mouse down - start drawing
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDM || !active) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridPos = screenToGrid(x, y);
    const snapped = snapPoint(gridPos);

    // Check if clicking near existing segment endpoint
    const existingEndpoint = findNearbyEndpoint(snapped);
    if (existingEndpoint) {
      setStartPoint(existingEndpoint);
    } else {
      setStartPoint(snapped);
    }
    setCurrentPoint(snapped);
    setDrawing(true);
    e.preventDefault();
  }, [isDM, active, screenToGrid, snapPoint, findNearbyEndpoint]);

  // Handle mouse move - update preview
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !startPoint) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridPos = screenToGrid(x, y);
    const snapped = snapPoint(gridPos);

    setCurrentPoint(snapped);
  }, [drawing, startPoint, screenToGrid, snapPoint]);

  // Handle mouse up - finish drawing
  const handleMouseUp = useCallback(async () => {
    if (!drawing || !startPoint || !currentPoint) {
      setDrawing(false);
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    // Don't create zero-length walls
    if (startPoint.x === currentPoint.x && startPoint.y === currentPoint.y) {
      setDrawing(false);
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    const newSegment: WallSegment = {
      id: randomId(),
      x1: startPoint.x,
      y1: startPoint.y,
      x2: currentPoint.x,
      y2: currentPoint.y,
      type: wallType,
      doorState: wallType === 'door' ? 'closed' : undefined,
    };

    // Add to local state immediately for responsiveness
    const updatedSegments = [...wallSegments, newSegment];
    const merged = mergeCollinearSegments(updatedSegments);
    const split = splitAtIntersections(merged);
    setWallSegments(split);

    // Send to server
    try {
      await api.post(`/campaigns/${useGameStore.getState().campaignId}/maps/${mapId}/walls`, {
        segments: [newSegment]
      });
      showToast('Wall added', 'success');
    } catch {
      console.error('Failed to add wall');
      showToast('Failed to add wall', 'error');
      setWallSegments(wallSegments); // Revert on error
    }

    setDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  }, [drawing, startPoint, currentPoint, wallType, wallSegments, mapId, mergeCollinearSegments, splitAtIntersections, setWallSegments, showToast]);

  const distanceToSegment = (point: { x: number; y: number }, segment: WallSegment): number => {
    const x = point.x, y = point.y;
    const x1 = segment.x1, y1 = segment.y1, x2 = segment.x2, y2 = segment.y2;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const findSegmentAtPoint = useCallback((point: { x: number; y: number }, segments: WallSegment[]): WallSegment | null => {
    const threshold = 0.3; // Grid squares
    for (const segment of segments) {
      const dist = distanceToSegment(point, segment);
      if (dist < threshold) return segment;
    }
    return null;
  }, []);

  // Handle right click - context menu for walls
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDM || !active) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridPos = screenToGrid(x, y);

    // Find segment under cursor
    const segment = findSegmentAtPoint(gridPos, wallSegments);
    if (segment) {
      e.preventDefault();
      setContextMenu({ segment, x: e.clientX, y: e.clientY });
      setSelectedSegmentId(segment.id);
    }
  }, [isDM, active, screenToGrid, wallSegments, findSegmentAtPoint]);

  // Handle segment type change
  const handleTypeChange = useCallback(async (newType: WallType) => {
    if (!selectedSegmentId) return;

    const segment = wallSegments.find(s => s.id === selectedSegmentId);
    if (!segment) return;

    const updatedSegments: WallSegment[] = wallSegments.map(s =>
      s.id === selectedSegmentId ? { ...s, type: newType, doorState: newType === 'door' ? 'closed' as const : undefined } : s
    );

    setWallSegments(updatedSegments);

    try {
      await api.patch(`/campaigns/${useGameStore.getState().campaignId}/maps/${mapId}/walls/${selectedSegmentId}`, {
        type: newType
      });
    } catch {
      console.error('Failed to update wall type');
      showToast('Failed to update wall type', 'error');
      setWallSegments(wallSegments);
    }

    setShowTypeMenu(false);
    setContextMenu(null);
    setSelectedSegmentId(null);
  }, [selectedSegmentId, wallSegments, mapId, setWallSegments, showToast]);

  // Handle delete segment
  const handleDeleteSegment = useCallback(async () => {
    if (!selectedSegmentId) return;

    const updatedSegments = wallSegments.filter(s => s.id !== selectedSegmentId);
    setWallSegments(updatedSegments);

    try {
      await api.delete(`/campaigns/${useGameStore.getState().campaignId}/maps/${mapId}/walls/${selectedSegmentId}`);
      showToast('Wall deleted', 'success');
    } catch {
      console.error('Failed to delete wall');
      showToast('Failed to delete wall', 'error');
      setWallSegments(wallSegments);
    }

    setContextMenu(null);
    setSelectedSegmentId(null);
  }, [selectedSegmentId, wallSegments, mapId, setWallSegments, showToast]);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setShowTypeMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Render loop for preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw existing walls
      for (const segment of wallSegments) {
        drawWall(ctx, segment, gridSize, viewport, gridToScreen, segment.id === selectedSegmentId);
      }

      // Draw preview
      if (drawing && startPoint && currentPoint) {
        drawPreviewWall(ctx, startPoint, currentPoint, wallType, gridSize, viewport, gridToScreen);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameRef.current!);
  }, [wallSegments, drawing, startPoint, currentPoint, wallType, selectedSegmentId, gridSize, viewport, gridToScreen]);

  const drawWall = (
    ctx: CanvasRenderingContext2D,
    segment: WallSegment,
    gridSize: number,
    viewport: { x: number; y: number; zoom: number },
    gridToScreen: (x: number, y: number) => { x: number; y: number },
    highlighted: boolean = false
  ) => {
    const start = gridToScreen(segment.x1, segment.y1);
    const end = gridToScreen(segment.x2, segment.y2);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);

    const color = WALL_COLORS[segment.type] || WALL_COLORS.normal;
    ctx.strokeStyle = highlighted ? '#fff' : (color ?? '#6b7280');
    ctx.lineWidth = (WALL_THICKNESS * viewport.zoom) + (highlighted ? 2 : 0);
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw door indicator
    if (segment.type === 'door') {
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const angle = Math.atan2(end.y - start.y, end.x - start.x);

      ctx.save();
      ctx.translate(midX, midY);
      ctx.rotate(angle + Math.PI / 2);

      const doorWidth = gridSize * viewport.zoom * 0.8;
      ctx.beginPath();
      ctx.moveTo(-doorWidth / 2, 0);
      ctx.lineTo(doorWidth / 2, 0);
      ctx.strokeStyle = segment.doorState === 'open' ? '#22c55e' : '#f59e0b';
      ctx.lineWidth = WALL_THICKNESS * viewport.zoom * 1.5;
      ctx.stroke();

      // Door arc indicator
      if (segment.doorState === 'closed') {
        ctx.beginPath();
        ctx.arc(0, 0, doorWidth / 2, 0, Math.PI);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1 * viewport.zoom;
        ctx.stroke();
      }

      ctx.restore();
    }
  };

  const drawPreviewWall = (
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    type: WallType,
    _gridSize: number,
    viewport: { x: number; y: number; zoom: number },
    gridToScreen: (x: number, y: number) => { x: number; y: number }
  ) => {
    const screenStart = gridToScreen(start.x, start.y);
    const screenEnd = gridToScreen(end.x, end.y);

    ctx.beginPath();
    ctx.moveTo(screenStart.x, screenStart.y);
    ctx.lineTo(screenEnd.x, screenEnd.y);

    const color = WALL_COLORS[type] || WALL_COLORS.normal;
    ctx.strokeStyle = color ?? '#6b7280';
    ctx.lineWidth = WALL_THICKNESS * viewport.zoom;
    ctx.lineCap = 'round';
    ctx.setLineDash([5 * viewport.zoom, 5 * viewport.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // Cleanup on deactivate
  useEffect(() => {
    return () => {
      setDrawing(false);
      setStartPoint(null);
      setCurrentPoint(null);
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
        onContextMenu={handleContextMenu}
        width={viewport.zoom * mapWidth * gridSize}
        height={viewport.zoom * mapHeight * gridSize}
      />

      {/* Toolbar */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-surface/95 backdrop-blur-sm border border-border rounded-lg p-2 pointer-events-auto">
        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
              className="w-4 h-4 accent-ring"
            />
            <span className="text-sm text-foreground">Snap to Grid</span>
          </label>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Type:</span>
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
            <option value="terrain-boundary">Terrain Boundary</option>
          </select>
        </div>

        <Button variant="ghost" size="sm" onClick={onDeactivate} title="Exit wall tool">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-surface border border-border rounded-md shadow-lg py-1 min-w-[160px] pointer-events-auto"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
            Wall Segment
          </div>
          <button
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent focus:outline-none focus:bg-accent"
            onClick={() => setShowTypeMenu(true)}
          >
            Change Type
          </button>
          <hr className="my-1 border-border" />
          <button
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent focus:outline-none focus:bg-accent"
            onClick={handleDeleteSegment}
          >
            Delete
          </button>
        </div>
      )}

      {/* Type Submenu */}
      {showTypeMenu && contextMenu && (
        <div
          className="fixed z-50 bg-surface border border-border rounded-md shadow-lg py-1 min-w-[140px] pointer-events-auto"
          style={{ left: contextMenu.x + 160, top: contextMenu.y }}
          role="menu"
        >
          {(['normal', 'door', 'secret', 'portcullis', 'window', 'terrain-boundary'] as WallType[]).map(type => (
            <button
              key={type}
              role="menuitem"
              className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                wallType === type ? 'bg-ring/10 text-ring' : 'text-foreground hover:bg-accent'
              }`}
              onClick={() => handleTypeChange(type)}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
