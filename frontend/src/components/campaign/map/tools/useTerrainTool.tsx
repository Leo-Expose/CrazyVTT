// ============================================
// Terrain Tool (Phase 6)
// Painting difficult/hazardous/impassable terrain on map
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CampaignMap, TerrainType } from '@/types';
import type { MapControls, MapTool, PointerAt, ToolSocketSource } from './types';
import type { MapLayer } from '../useRenderLoop';
import type { TerrainLayerData } from '@/types';

interface UseTerrainToolArgs {
  isDM: boolean;
  currentMap: CampaignMap | null;
  terrainLayer: TerrainLayerData | null;
  setTerrainLayer: (data: TerrainLayerData) => void;
  pushTerrainHistory: (data: TerrainLayerData) => void;
  socket: ToolSocketSource | null | undefined;
  mapControls: MapControls;
  markDirty: (...layers: MapLayer[]) => void;
  rightPanActiveRef: React.RefObject<boolean>;
  mapImage: HTMLImageElement | null;
}

export function useTerrainTool({
  isDM,
  currentMap,
  terrainLayer,
  setTerrainLayer: _setTerrainLayer,
  pushTerrainHistory,
  socket,
  mapControls,
  markDirty,
  rightPanActiveRef,
  mapImage: _mapImage,
}: UseTerrainToolArgs) {
  // All hooks must be called unconditionally at the top level (rules-of-hooks)
  const [terrainMode, setTerrainMode] = useState<TerrainType>('difficult');
  const [brushSize, setBrushSize] = useState(1); // In grid squares
  const [terrainPaintActive, setTerrainPaintActive] = useState(false);
  const [terrainEraseActive, setTerrainEraseActive] = useState(false);
  const [fillMode, setFillMode] = useState(false);
  const [_hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);

  const paintCellsRef = useRef<Set<string>>(new Set());

  const [hazardDamage, setHazardDamage] = useState({ type: 'fire', amount: '1d6' });

  const sendTerrainUpdate = useCallback((data: TerrainLayerData) => {
    const socketInstance = socket?.getSocket();
    if (socketInstance && currentMap) {
      socketInstance.emit('terrain:update', { mapId: currentMap.id, data });
    }
  }, [socket, currentMap]);

  const commitTerrain = useCallback((nextData: TerrainLayerData) => {
    pushTerrainHistory(nextData);
    sendTerrainUpdate(nextData);
  }, [pushTerrainHistory, sendTerrainUpdate]);

  const snapToGrid = useCallback((mapPx: { x: number; y: number }): { x: number; y: number } => {
    if (!currentMap) return mapPx;
    const gs = currentMap.gridSize;
    return {
      x: Math.floor(mapPx.x / gs),
      y: Math.floor(mapPx.y / gs),
    };
  }, [currentMap]);

  const getCellKey = (x: number, y: number) => `${x},${y}`;

  const getBrushCells = useCallback((centerX: number, centerY: number, size: number): { x: number; y: number }[] => {
    if (!currentMap) return [];
    const cells: { x: number; y: number }[] = [];
    const radius = Math.floor(size / 2);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (x >= 0 && x < currentMap.width && y >= 0 && y < currentMap.height) {
          // For circular brush, check distance
          if (size > 1 && dx * dx + dy * dy > radius * radius) continue;
          cells.push({ x, y });
        }
      }
    }
    return cells;
  }, [currentMap]);

  const applyTerrainToCells = useCallback((cells: { x: number; y: number }[], type: TerrainType, hazardInfo?: { type: string; amount: string }) => {
    if (!currentMap || !terrainLayer) return;

    const newTiles = [...terrainLayer.tiles];
    const existingMap = new Map(newTiles.map(t => [`${t.x},${t.y}`, t]));

    for (const cell of cells) {
      const key = getCellKey(cell.x, cell.y);
      const existing = existingMap.get(key);

      if (type === 'normal') {
        // Remove normal terrain (default)
        if (existing) {
          existingMap.delete(key);
        }
      } else {
        if (existing) {
          existing.type = type;
          if (type === 'hazardous' && hazardInfo) {
            existing.hazardDamage = hazardInfo;
          } else {
            delete existing.hazardDamage;
          }
        } else {
          const newTile = {
            x: cell.x,
            y: cell.y,
            type,
            hazardDamage: type === 'hazardous' ? hazardInfo : undefined,
          };
          existingMap.set(key, newTile);
        }
      }
    }

    const updatedTiles = Array.from(existingMap.values());
    const newData: TerrainLayerData = { tiles: updatedTiles };

    commitTerrain(newData);
  }, [currentMap, terrainLayer, commitTerrain]);

  // Flood fill for fill mode
  const floodFill = useCallback((startX: number, startY: number, targetType: TerrainType, replacementType: TerrainType) => {
    if (!currentMap || !terrainLayer) return;

    const _startKey = getCellKey(startX, startY);
    void _startKey;
    const startTile = terrainLayer.tiles.find(t => t.x === startX && t.y === startY);
    const startTileType = startTile?.type ?? 'normal';

    if (startTileType !== targetType) return;

    const visited = new Set<string>();
    const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];
    const cellsToChange: { x: number; y: number }[] = [];

    const tileMap = new Map(terrainLayer.tiles.map(t => [`${t.x},${t.y}`, t.type]));

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      const key = getCellKey(x, y);

      if (visited.has(key)) continue;
      if (x < 0 || x >= currentMap.width || y < 0 || y >= currentMap.height) continue;

      const tileType = tileMap.get(key) ?? 'normal';
      if (tileType !== targetType) continue;

      visited.add(key);
      cellsToChange.push({ x, y });

      // Add neighbors
      queue.push({ x: x + 1, y });
      queue.push({ x: x - 1, y });
      queue.push({ x, y: y + 1 });
      queue.push({ x, y: y - 1 });
    }

    if (cellsToChange.length > 0) {
      applyTerrainToCells(cellsToChange, replacementType);
    }
  }, [currentMap, terrainLayer, applyTerrainToCells]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isDM) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      const modes: TerrainType[] = ['normal', 'difficult', 'hazardous', 'impassable'];
      const currentIndex = modes.indexOf(terrainMode);

      switch (e.key.toLowerCase()) {
        case '1': setTerrainMode('normal'); break;
        case '2': setTerrainMode('difficult'); break;
        case '3': setTerrainMode('hazardous'); break;
        case '4': setTerrainMode('impassable'); break;
        case 'f': setFillMode(!fillMode); break;
        case '[':
          if (currentIndex > 0) setTerrainMode(modes[currentIndex - 1]);
          break;
        case ']':
          if (currentIndex < modes.length - 1) setTerrainMode(modes[currentIndex + 1]);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDM, terrainMode, fillMode]);

  // Clean up on map change
  useEffect(() => {
    if (!isDM) return;
    setTerrainPaintActive(false);
    setTerrainEraseActive(false);
    setFillMode(false);
    paintCellsRef.current.clear();
  }, [isDM, currentMap?.id]);

  if (!isDM) {
    return { tool: {} as MapTool, panel: null };
  }

  const terrainTypes: { value: TerrainType; label: string; icon: string; color: string; description: string }[] = [
    { value: 'normal', label: 'Normal', icon: '🟢', color: '#22c55e', description: 'Standard terrain (1× cost)' },
    { value: 'difficult', label: 'Difficult', icon: '🟡', color: '#eab308', description: 'Difficult terrain (2× cost)' },
    { value: 'hazardous', label: 'Hazardous', icon: '🟠', color: '#f97316', description: 'Hazardous terrain (2× cost + damage)' },
    { value: 'impassable', label: 'Impassable', icon: '🔴', color: '#ef4444', description: 'Cannot move through' },
  ];

  const hazardDamageTypes = [
    { value: 'fire', label: 'Fire', icon: '🔥' },
    { value: 'cold', label: 'Cold', icon: '❄️' },
    { value: 'acid', label: 'Acid', icon: '☠️' },
    { value: 'poison', label: 'Poison', icon: '☠️' },
    { value: 'lightning', label: 'Lightning', icon: '⚡' },
    { value: 'force', label: 'Force', icon: '✨' },
    { value: 'necrotic', label: 'Necrotic', icon: '💀' },
    { value: 'radiant', label: 'Radiant', icon: '✨' },
  ];

  const tool: MapTool = {
    down({ e, mapPx }: PointerAt) {
      if (!isDM || !currentMap) return false;

      const gridPos = snapToGrid(mapPx);
      const { x, y } = gridPos;

      // Right click to erase
      if (e.button === 2) {
        e.preventDefault();
        if (rightPanActiveRef.current) {
          mapControls.handleDrag(e);
        } else {
          setTerrainEraseActive(true);
          const cells = getBrushCells(x, y, brushSize);
          applyTerrainToCells(cells, 'normal');
        }
        markDirty('overlay');
        return true;
      }

      // Left click
      if (e.button === 0) {
        if (rightPanActiveRef.current) {
          mapControls.handleDrag(e);
        } else if (fillMode) {
          // Flood fill
          const existing = terrainLayer?.tiles.find(t => t.x === x && t.y === y);
          const existingType = existing?.type ?? 'normal';
          if (existingType !== terrainMode) {
            floodFill(x, y, existingType, terrainMode);
          }
        } else {
          // Paint
          setTerrainPaintActive(true);
          paintCellsRef.current.clear();
          const cells = getBrushCells(x, y, brushSize);
          cells.forEach(c => paintCellsRef.current.add(getCellKey(c.x, c.y)));
          applyTerrainToCells(cells, terrainMode, terrainMode === 'hazardous' ? hazardDamage : undefined);
        }
        markDirty('overlay');
        return true;
      }

      return false;
    },

    move({ e, mapPx }: PointerAt) {
      if (!isDM || !currentMap) return false;

      const gridPos = snapToGrid(mapPx);
      const { x, y } = gridPos;
      setHoveredCell({ x, y });

      if (rightPanActiveRef.current) {
        mapControls.handleDrag(e);
        markDirty('terrain', 'tokens', 'overlay');
        return true;
      }

      if (terrainPaintActive) {
        const cells = getBrushCells(x, y, brushSize);
        const newCells = cells.filter(c => !paintCellsRef.current.has(getCellKey(c.x, c.y)));
        if (newCells.length > 0) {
          newCells.forEach(c => paintCellsRef.current.add(getCellKey(c.x, c.y)));
          applyTerrainToCells(newCells, terrainMode, terrainMode === 'hazardous' ? hazardDamage : undefined);
        }
        markDirty('overlay');
        return true;
      }

      if (terrainEraseActive) {
        const cells = getBrushCells(x, y, brushSize);
        applyTerrainToCells(cells, 'normal');
        markDirty('overlay');
        return true;
      }

      markDirty('overlay');
      return true;
    },

    up() {
      setTerrainPaintActive(false);
      setTerrainEraseActive(false);
      paintCellsRef.current.clear();
      markDirty('overlay');
    },

    escape() {
      setFillMode(false);
      setTerrainPaintActive(false);
      setTerrainEraseActive(false);
      return true;
    },
  };

  const panel = (
    <div className="p-2 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-ink">Terrain Painter</h3>
        <button onClick={() => setFillMode(!fillMode)} className="p-1 rounded hover:bg-surface-light transition-colors" title="Fill (F)">
          {fillMode ? '🪣' : '🖌️'}
        </button>
      </div>

      {/* Terrain Type Selector */}
      <div className="space-y-1">
        <label className="text-xs text-ink-muted">Terrain Type</label>
        <div className="grid grid-cols-2 gap-1">
          {terrainTypes.map(({ value, label, icon, color, description }) => (
            <button
              key={value}
              onClick={() => setTerrainMode(value)}
              className={cn(
                'relative p-2 rounded border text-xs transition-all',
                terrainMode === value
                  ? 'border-brand bg-brand/10 text-brand-ink'
                  : 'border-border/30 text-ink-secondary hover:border-brand/50'
              )}
              title={description}
            >
              <span className="text-lg">{icon}</span>
              <span className="ml-1 font-medium">{label}</span>
              <div className="w-full h-1 mt-1 rounded" style={{ backgroundColor: color }} />
            </button>
          ))}
        </div>
      </div>

      {/* Hazard Damage Config */}
      {terrainMode === 'hazardous' && (
        <div className="space-y-1 border-t border-border/30 pt-2">
          <label className="text-xs text-ink-muted">Hazard Damage</label>
          <div className="flex items-center gap-2">
            <select
              value={hazardDamage.type}
              onChange={(e) => setHazardDamage({ ...hazardDamage, type: e.target.value })}
              className="flex-1 px-2 py-1 text-xs bg-surface border border-border/30 rounded"
            >
              {hazardDamageTypes.map(({ value, label, icon }) => (
                <option key={value} value={value}>{icon} {label}</option>
              ))}
            </select>
            <input
              type="text"
              value={hazardDamage.amount}
              onChange={(e) => setHazardDamage({ ...hazardDamage, amount: e.target.value })}
              placeholder="1d6"
              className="w-20 px-2 py-1 text-xs bg-surface border border-border/30 rounded font-mono"
              title="Damage expression (e.g., 1d6, 2d4+1)"
            />
          </div>
        </div>
      )}

      {/* Brush Size */}
      <div className="space-y-1 border-t border-border/30 pt-2">
        <label className="text-xs text-ink-muted flex justify-between">
          <span>Brush Size</span>
          <span className="font-mono">{brushSize}×{brushSize}</span>
        </label>
        <input
          type="range"
          min="1"
          max="10"
          step="1"
          value={brushSize}
          onChange={(e) => setBrushSize(parseInt(e.target.value))}
          className="w-full h-2 accent-brand"
        />
        <div className="flex justify-between text-xs text-ink-muted">
          <span>1 (Single)</span>
          <span>10 (Large)</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="border-t border-border/30 pt-2 space-y-1">
        <button
          onClick={() => {
            if (!currentMap || !terrainLayer) return;
            // Clear all terrain
            commitTerrain({ tiles: [] });
          }}
          className="w-full px-2 py-1.5 text-xs text-danger-ink bg-danger/10 border border-danger/30 rounded hover:bg-danger/20 transition-colors"
        >
          Clear All Terrain
        </button>
      </div>

      {/* Legend */}
      <div className="border-t border-border/30 pt-2">
        <p className="text-xs text-ink-muted mb-1">Legend:</p>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2 text-ink-secondary">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }} />
            <span>Normal (1×)</span>
          </div>
          <div className="flex items-center gap-2 text-ink-secondary">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: '#eab308' }} />
            <span>Difficult (2×)</span>
          </div>
          <div className="flex items-center gap-2 text-ink-secondary">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: '#f97316' }} />
            <span>Hazardous (2× + dmg)</span>
          </div>
          <div className="flex items-center gap-2 text-ink-secondary">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} />
            <span>Impassable</span>
          </div>
        </div>
      </div>
    </div>
  );

  return { tool, panel };
}

// Helper for classnames
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
