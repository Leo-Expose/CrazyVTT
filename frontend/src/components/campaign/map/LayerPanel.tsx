// ============================================
// Layer Panel - Map layer management UI with opacity, merge, reorder
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  GripVertical,
  Plus,
  Trash2,
  Copy,
  MoreHorizontal,
  Image,
  Square,
  Box,
  Lightbulb,
  Cloud,
  Users,
  PenTool,
  ChevronDown,
  Layers as LayersIcon,
  Merge,
  Circle as OpacityIcon,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { LayerType } from '@/types';
import { api } from '@/services/api';
import Button from '@/components/ui/Button';
import { useToast } from '@/contexts/ToastContext';

interface MapLayer {
  id: string;
  mapId: string;
  name: string;
  type: LayerType;
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface LayerPanelProps {
  mapId: string;
  isDM: boolean;
  onClose?: () => void;
  activeLayerId?: string | null;
  onActiveLayerChange?: (layerId: string) => void;
}

const LAYER_TYPE_ICONS: Record<LayerType, React.ReactNode> = {
  TERRAIN: <Image className="w-4 h-4" />,
  STRUCTURE: <Square className="w-4 h-4" />,
  FURNITURE: <Box className="w-4 h-4" />,
  WALLS: <Square className="w-4 h-4" />,
  LIGHTING: <Lightbulb className="w-4 h-4" />,
  FOG: <Cloud className="w-4 h-4" />,
  TOKENS: <Users className="w-4 h-4" />,
  ANNOTATIONS: <PenTool className="w-4 h-4" />,
};

const LAYER_TYPE_LABELS: Record<LayerType, string> = {
  TERRAIN: 'Terrain',
  STRUCTURE: 'Structure',
  FURNITURE: 'Furniture',
  WALLS: 'Walls',
  LIGHTING: 'Lighting',
  FOG: 'Fog of War',
  TOKENS: 'Tokens',
  ANNOTATIONS: 'Annotations',
};

const PROTECTED_LAYER_TYPES = ['WALLS', 'LIGHTING', 'FOG', 'TOKENS'];



export default function LayerPanel({ mapId, isDM, onClose, activeLayerId, onActiveLayerChange }: LayerPanelProps) {
  const { campaign } = useCampaign();
  const { socket } = useWebSocket();
  const { showToast } = useToast();
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ layerId: string; x: number; y: number } | null>(null);
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);
  const [opacityValues, setOpacityValues] = useState<Record<string, number>>({});
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Listen for layer events from WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleLayerAdded = (data: { mapId: string; layer: MapLayer }) => {
      if (data.mapId === mapId) {
        setLayers(prev => [...prev, data.layer].sort((a, b) => a.order - b.order));
      }
    };

    const handleLayerUpdated = (data: { mapId: string; layer: MapLayer }) => {
      if (data.mapId === mapId) {
        setLayers(prev => prev.map(l => l.id === data.layer.id ? { ...data.layer, opacity: opacityValues[data.layer.id] ?? data.layer.opacity } : l).sort((a, b) => a.order - b.order));
      }
    };

    const handleLayerRemoved = (data: { mapId: string; layerId: string }) => {
      if (data.mapId === mapId) {
        setLayers(prev => prev.filter(l => l.id !== data.layerId));
        setOpacityValues(prev => {
          const next = { ...prev };
          delete next[data.layerId];
          return next;
        });
      }
    };

    const handleLayersReordered = (data: { mapId: string; layers: MapLayer[] }) => {
      if (data.mapId === mapId) {
        setLayers(data.layers);
      }
    };

    const handleLayerDataUpdated = (data: { mapId: string; layerId: string; tiles: unknown[] }) => {
      if (data.mapId === mapId) {
        setLayers(prev => prev.map(l =>
          l.id === data.layerId ? { ...l, data: { ...l.data, tiles: data.tiles } } : l
        ));
      }
    };

    socket.on('layer:added', handleLayerAdded);
    socket.on('layer:updated', handleLayerUpdated);
    socket.on('layer:removed', handleLayerRemoved);
    socket.on('layers:reordered', handleLayersReordered);
    socket.on('layer:data:updated', handleLayerDataUpdated);

    return () => {
      socket.off('layer:added', handleLayerAdded);
      socket.off('layer:updated', handleLayerUpdated);
      socket.off('layer:removed', handleLayerRemoved);
      socket.off('layers:reordered', handleLayersReordered);
      socket.off('layer:data:updated', handleLayerDataUpdated);
    };
  }, [socket, mapId, opacityValues]);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchLayers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get<{ layers: MapLayer[] }>(`/campaigns/${campaign?.id}/maps/${mapId}/layers`);
      const fetchedLayers = response.data.layers || [];
      setLayers(fetchedLayers);
      // Initialize opacity values
      const opacityMap: Record<string, number> = {};
      fetchedLayers.forEach(layer => {
        opacityMap[layer.id] = layer.opacity ?? 100;
      });
      setOpacityValues(opacityMap);
    } catch {
      console.error('Failed to fetch layers');
      showToast('Failed to load layers', 'error');
    } finally {
      setLoading(false);
    }
  }, [campaign?.id, mapId, showToast]);

  // Fetch layers on mount and when mapId changes
  useEffect(() => {
    fetchLayers();
  }, [fetchLayers]);

  const updateLayer = async (layerId: string, updates: Partial<MapLayer>) => {
    if (!isDM) return;

    try {
      await api.put(`/campaigns/${campaign?.id}/maps/${mapId}/layers/${layerId}`, updates);
    } catch {
      console.error('Failed to update layer');
      showToast('Failed to update layer', 'error');
    }
  };

  const deleteLayer = async (layerId: string) => {
    if (!isDM) return;

    try {
      await api.delete(`/campaigns/${campaign?.id}/maps/${mapId}/layers/${layerId}`);
      showToast('Layer deleted', 'success');
    } catch {
      console.error('Failed to delete layer');
      showToast('Failed to delete layer', 'error');
    }
  };

  const duplicateLayer = async (layerId: string) => {
    if (!isDM) return;

    try {
      await api.post(`/campaigns/${campaign?.id}/maps/${mapId}/layers/${layerId}/duplicate`);
      showToast('Layer duplicated', 'success');
    } catch {
      console.error('Failed to duplicate layer');
      showToast('Failed to duplicate layer', 'error');
    }
  };

  const mergeLayerDown = async (layerId: string) => {
    if (!isDM) return;

    try {
      await api.post(`/campaigns/${campaign?.id}/maps/${mapId}/layers/${layerId}/merge-down`);
      showToast('Layer merged down', 'success');
    } catch {
      console.error('Failed to merge layer');
      showToast('Failed to merge layer', 'error');
    }
  };

  const reorderLayers = async (layerIds: string[]) => {
    if (!isDM) return;

    try {
      await api.post(`/campaigns/${campaign?.id}/maps/${mapId}/layers/reorder`, { layerIds });
    } catch {
      console.error('Failed to reorder layers');
      showToast('Failed to reorder layers', 'error');
      fetchLayers(); // Refresh to reset
    }
  };

  const initializeLayers = async () => {
    if (!isDM) return;

    try {
      await api.post(`/campaigns/${campaign?.id}/maps/${mapId}/layers/initialize`);
      showToast('Default layers created', 'success');
    } catch {
      console.error('Failed to initialize layers');
      showToast('Failed to initialize layers', 'error');
    }
  };

  const createLayer = async (name: string, type: LayerType) => {
    if (!isDM) return;

    try {
      await api.post(`/campaigns/${campaign?.id}/maps/${mapId}/layers`, {
        name,
        type,
        order: layers.length,
      });
      showToast('Layer created', 'success');
    } catch {
      console.error('Failed to create layer');
      showToast('Failed to create layer', 'error');
    }
  };

  const handleDragStart = (e: React.DragEvent, layerId: string) => {
    if (!isDM) return;
    setDraggingLayerId(layerId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, layerId: string) => {
    if (!isDM || draggingLayerId === layerId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverLayerId(layerId);
  };

  const handleDragLeave = () => {
    setDragOverLayerId(null);
  };

  const handleDrop = (e: React.DragEvent, targetLayerId: string) => {
    if (!isDM || !draggingLayerId || draggingLayerId === targetLayerId) return;
    e.preventDefault();

    const layerIds = layers.map(l => l.id);
    const fromIndex = layerIds.indexOf(draggingLayerId);
    const toIndex = layerIds.indexOf(targetLayerId);

    if (fromIndex === -1 || toIndex === -1) return;

    // Remove from old position and insert at new position
    const newLayerIds = [...layerIds];
    const [removed] = newLayerIds.splice(fromIndex, 1);
    newLayerIds.splice(toIndex, 0, removed);

    reorderLayers(newLayerIds);
    setDraggingLayerId(null);
    setDragOverLayerId(null);
  };

  const handleDragEnd = () => {
    setDraggingLayerId(null);
    setDragOverLayerId(null);
  };

  const startEditing = (layer: MapLayer) => {
    if (!isDM || layer.locked) return;
    setEditingLayerId(layer.id);
    setEditName(layer.name);
  };

  const saveEdit = async (layerId: string) => {
    if (!editName.trim()) return;
    await updateLayer(layerId, { name: editName.trim() });
    setEditingLayerId(null);
  };

  const cancelEdit = () => {
    setEditingLayerId(null);
    setEditName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, layerId: string) => {
    if (e.key === 'Enter') saveEdit(layerId);
    else if (e.key === 'Escape') cancelEdit();
  };

  const showContextMenu = (e: React.MouseEvent, layerId: string) => {
    if (!isDM) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ layerId, x: e.clientX, y: e.clientY });
  };

  const handleContextAction = async (action: string) => {
    if (!contextMenu) return;
    const { layerId } = contextMenu;

    switch (action) {
      case 'duplicate':
        await duplicateLayer(layerId);
        break;
      case 'delete':
        if (confirm('Delete this layer? This cannot be undone.')) await deleteLayer(layerId);
        break;
      case 'mergeDown':
        if (confirm('Merge this layer down into the layer below? This cannot be undone.')) await mergeLayerDown(layerId);
        break;
      case 'lock':
        await updateLayer(layerId, { locked: true });
        break;
      case 'unlock':
        await updateLayer(layerId, { locked: false });
        break;
      case 'createAbove':
        await createLayer(`New ${LAYER_TYPE_LABELS[layers.find(l => l.id === layerId)?.type || 'ANNOTATIONS']}`, LayerType.ANNOTATIONS);
        break;
    }
    setContextMenu(null);
  };

  const isProtected = (layer: MapLayer) => PROTECTED_LAYER_TYPES.includes(layer.type);

  const canMergeDown = (layer: MapLayer, index: number) => {
    if (!isDM || isProtected(layer) || layer.locked) return false;
    const sortedLayers = [...layers].sort((a, b) => a.order - b.order);
    const currentIndex = sortedLayers.findIndex(l => l.id === layer.id);
    if (currentIndex === 0) return false; // Bottom layer
    const layerBelow = sortedLayers[currentIndex - 1];
    return !isProtected(layerBelow) && !layerBelow.locked;
  };

  const getLayerOpacity = (layerId: string) => opacityValues[layerId] ?? 100;

  const handleOpacityChange = (layerId: string, opacity: number) => {
    setOpacityValues(prev => ({ ...prev, [layerId]: opacity }));
    updateLayer(layerId, { opacity: opacity / 100 });
  };

  const handleVisibilityChange = (layerId: string, visible: boolean) => {
    updateLayer(layerId, { visible });
  };

  const handleLockChange = (layerId: string, locked: boolean) => {
    updateLayer(layerId, { locked });
  };

  const handleActiveLayerClick = (layerId: string) => {
    onActiveLayerChange?.(layerId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading layers...
      </div>
    );
  }

  // Sort layers by order (bottom to top for display, but render top to bottom visually)
  const sortedLayers = [...layers].sort((a, b) => a.order - b.order);
  const displayLayers = [...sortedLayers].reverse(); // Top layer first visually

  return (
    <div className="flex flex-col h-full bg-surface border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-medium text-foreground flex items-center gap-2">
          <LayersIcon className="w-5 h-5" />
          Layers
        </h3>
        <div className="flex items-center gap-1">
          {isDM && (
            <Button
              variant="ghost"
              size="sm"
              onClick={initializeLayers}
              title="Initialize default layers"
              disabled={layers.length > 0}
            >
              <Plus className="w-4 h-4" />
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} title="Close" aria-label="Close layer panel">
              <ChevronDown className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Layer List */}
      <div className="flex-1 overflow-y-auto p-2">
        {layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-2">
            <LayersIcon className="w-12 h-12" />
            <p className="text-sm">No layers yet</p>
            {isDM && (
              <Button variant="outline" size="sm" onClick={initializeLayers}>
                Create Default Layers
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-1" role="list">
            {displayLayers.map((layer) => {
              const actualIndex = sortedLayers.findIndex(l => l.id === layer.id);
              const canMerge = canMergeDown(layer, actualIndex);
              const isActive = activeLayerId === layer.id;
              
              return (
                <LayerItem
                  key={layer.id}
                  layer={layer}
                  isDM={isDM}
                  isEditing={editingLayerId === layer.id}
                  isActive={isActive}
                  isExpanded={expandedLayerId === layer.id}
                  editName={editName}
                  setEditName={setEditName}
                  opacity={getLayerOpacity(layer.id)}
                  draggingLayerId={draggingLayerId}
                  dragOverLayerId={dragOverLayerId}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onStartEdit={startEditing}
                  onCancelEdit={cancelEdit}
                  onKeyDown={handleKeyDown}
                  onContextMenu={showContextMenu}
                  onVisibilityChange={handleVisibilityChange}
                  onLockChange={handleLockChange}
                  onOpacityChange={handleOpacityChange}
                  onActiveLayerClick={() => handleActiveLayerClick(layer.id)}
                  onToggleExpand={() => setExpandedLayerId(expandedLayerId === layer.id ? null : layer.id)}
                  onMergeDown={canMerge ? () => mergeLayerDown(layer.id) : undefined}
                  onDuplicate={() => duplicateLayer(layer.id)}
                  onDelete={() => deleteLayer(layer.id)}
                  isProtected={isProtected(layer)}
                  canMerge={canMerge}
                />
              );
            })}
          </ul>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-surface border border-border rounded-md shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent focus:outline-none focus:bg-accent"
            onClick={() => handleContextAction('duplicate')}
          >
            <Copy className="w-4 h-4 inline mr-2" /> Duplicate
          </button>
          <button
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent focus:outline-none focus:bg-accent"
            onClick={() => handleContextAction('mergeDown')}
          >
            <Merge className="w-4 h-4 inline mr-2" /> Merge Down
          </button>
          <hr className="my-1 border-border" />
          <button
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent focus:outline-none focus:bg-accent"
            onClick={() => handleContextAction('lock')}
          >
            <Lock className="w-4 h-4 inline mr-2" /> Lock
          </button>
          <button
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent focus:outline-none focus:bg-accent"
            onClick={() => handleContextAction('unlock')}
          >
            <LockOpen className="w-4 h-4 inline mr-2" /> Unlock
          </button>
          <hr className="my-1 border-border" />
          <button
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent focus:outline-none focus:bg-accent"
            onClick={() => handleContextAction('createAbove')}
          >
            <Plus className="w-4 h-4 inline mr-2" /> New Layer Above
          </button>
          <hr className="my-1 border-border" />
          <button
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent focus:outline-none focus:bg-accent"
            onClick={() => handleContextAction('delete')}
          >
            <Trash2 className="w-4 h-4 inline mr-2" /> Delete
          </button>
        </div>
      )}

      {/* Add Layer Footer (DM only) */}
      {isDM && (
        <div className="p-3 border-t border-border">
          <AddLayerMenu mapId={mapId} campaignId={campaign?.id} onLayerCreate={createLayer} />
        </div>
      )}
    </div>
  );
}

interface LayerItemProps {
  layer: MapLayer;
  isDM: boolean;
  isEditing: boolean;
  isActive: boolean;
  isExpanded: boolean;
  editName: string;
  setEditName: (name: string) => void;
  opacity: number;
  draggingLayerId: string | null;
  dragOverLayerId: string | null;
  onDragStart: (e: React.DragEvent, layerId: string) => void;
  onDragOver: (e: React.DragEvent, layerId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, layerId: string) => void;
  onDragEnd: () => void;
  onStartEdit: (layer: MapLayer) => void;
  onCancelEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent, layerId: string) => void;
  onContextMenu: (e: React.MouseEvent, layerId: string) => void;
  onVisibilityChange: (layerId: string, visible: boolean) => void;
  onLockChange: (layerId: string, locked: boolean) => void;
  onOpacityChange: (layerId: string, opacity: number) => void;
  onActiveLayerClick: () => void;
  onToggleExpand: () => void;
  onMergeDown: (() => void) | undefined;
  onDuplicate: () => void;
  onDelete: () => void;
  isProtected: boolean;
  canMerge: boolean;
}

function LayerItem({
  layer,
  isDM,
  isEditing,
  isActive,
  isExpanded,
  editName,
  setEditName,
  opacity,
  draggingLayerId,
  dragOverLayerId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onStartEdit,
  onCancelEdit,
  onKeyDown,
  onContextMenu,
  onVisibilityChange,
  onLockChange,
  onOpacityChange,
  onActiveLayerClick,
  onToggleExpand,
  onMergeDown,
  onDuplicate,
  onDelete,
  isProtected,
  canMerge,
}: LayerItemProps) {
  const isDragging = draggingLayerId === layer.id;
  const isDragOver = dragOverLayerId === layer.id;

  const handleDoubleClick = () => {
    if (isDM && !layer.locked) onStartEdit(layer);
    else onActiveLayerClick();
  };

  return (
    <li
      className={`
        relative group flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors
        ${isDragging ? 'opacity-50 bg-accent' : ''}
        ${isDragOver ? 'bg-accent/50 ring-2 ring-accent' : ''}
        ${isActive ? 'bg-ring/10 ring-1 ring-ring' : ''}
        ${!isDM ? 'cursor-default' : 'cursor-grab'}
        ${layer.locked && !isDM ? 'opacity-60' : ''}
      `}
      draggable={isDM && !layer.locked}
      onDragStart={(e) => onDragStart(e, layer.id)}
      onDragOver={(e) => onDragOver(e, layer.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, layer.id)}
      onDragEnd={onDragEnd}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => onContextMenu(e, layer.id)}
      onKeyDown={(e) => onKeyDown(e, layer.id)}
      onClick={onActiveLayerClick}
    >
      {/* Drag handle */}
      {isDM && !layer.locked && (
        <button
          className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing flex-shrink-0 p-0.5"
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}

      {/* Visibility toggle */}
      <button
        className="p-1 rounded hover:bg-accent transition-colors flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onVisibilityChange(layer.id, !layer.visible);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        title={layer.visible ? 'Hide layer' : 'Show layer'}
        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
      >
        {layer.visible ? (
          <Eye className="w-4 h-4 text-foreground" />
        ) : (
          <EyeOff className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Lock toggle */}
      {isDM && (
        <button
          className="p-1 rounded hover:bg-accent transition-colors flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onLockChange(layer.id, !layer.locked);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          title={layer.locked ? 'Unlock layer' : 'Lock layer'}
          aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
        >
          {layer.locked ? (
            <Lock className="w-4 h-4 text-foreground" />
          ) : (
            <LockOpen className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      )}

      {/* Layer type icon */}
      <button
        className="p-1 rounded hover:bg-accent transition-colors flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        title="Expand layer options"
      >
        <span className="w-6 h-6 flex items-center justify-center text-muted-foreground/70">
          {LAYER_TYPE_ICONS[layer.type]}
        </span>
      </button>

      {/* Layer name */}
      {isEditing ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={onCancelEdit}
          onKeyDown={(e) => onKeyDown(e, layer.id)}
          className="flex-1 px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring min-w-0"
          autoFocus
        />
      ) : (
        <span
          className={`
            flex-1 text-sm truncate min-w-0 cursor-pointer
            ${layer.locked ? 'text-muted-foreground' : 'text-foreground'}
            ${isProtected ? 'font-medium' : ''}
          `}
        >
          {layer.name}
        </span>
      )}

      {/* Expandable controls */}
      {isExpanded && (
        <div className="flex items-center gap-1 ml-2 pt-1 border-l border-border pl-2">
          {/* Opacity */}
          <div className="flex items-center gap-1">
            <OpacityIcon className="w-3 h-3 text-muted-foreground" />
            <input
              type="range"
              min="0"
              max="100"
              value={opacity}
              onChange={(e) => { e.stopPropagation(); onOpacityChange(layer.id, Number(e.target.value)); }}
              className="w-20 h-1 accent-ring"
              title="Opacity"
            />
            <span className="text-xs text-muted-foreground font-mono w-8">{opacity}%</span>
          </div>

          {/* Merge down */}
          {canMerge && onMergeDown && (
            <button
              className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onMergeDown(); }}
              title="Merge down"
            >
              <Merge className="w-3 h-3" />
            </button>
          )}

          {/* Duplicate */}
          {isDM && (
            <button
              className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              title="Duplicate"
            >
              <Copy className="w-3 h-3" />
            </button>
          )}

          {/* Delete */}
          {isDM && !isProtected && (
            <button
              className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Layer type badge */}
      <span
        className="px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground font-medium flex-shrink-0"
        title={LAYER_TYPE_LABELS[layer.type]}
      >
        {LAYER_TYPE_LABELS[layer.type]}
      </span>

      {/* Protected indicator */}
      {isProtected && (
        <span className="flex-shrink-0 text-muted-foreground/50" title="System layer">
          <Lock className="w-3 h-3" />
        </span>
      )}

      {/* More actions menu (DM only) */}
      {isDM && !isProtected && (
        <button
          className="p-1 rounded hover:bg-accent transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e as unknown as React.MouseEvent, layer.id);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label="Layer options"
        >
          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
    </li>
  );
}

interface AddLayerMenuProps {
  mapId: string;
  campaignId: string | undefined;
  onLayerCreate: (name: string, type: LayerType) => void;
}

function AddLayerMenu({ mapId, campaignId, onLayerCreate }: AddLayerMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [selectedType, setSelectedType] = useState<LayerType>(LayerType.ANNOTATIONS);
  const [newLayerName, setNewLayerName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const layerTypes: { type: LayerType; label: string; icon: React.ReactNode }[] = [
    { type: LayerType.TERRAIN, label: 'Terrain (Ground)', icon: <Image className="w-4 h-4" /> },
    { type: LayerType.STRUCTURE, label: 'Structure (Walls/Corners)', icon: <Square className="w-4 h-4" /> },
    { type: LayerType.FURNITURE, label: 'Furniture/Props', icon: <Box className="w-4 h-4" /> },
    { type: LayerType.ANNOTATIONS, label: 'Annotations (Drawings)', icon: <PenTool className="w-4 h-4" /> },
  ];

  const handleCreate = () => {
    if (newLayerName.trim()) {
      onLayerCreate(newLayerName.trim(), selectedType);
      setNewLayerName('');
      setShowMenu(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        onClick={() => { setShowMenu(!showMenu); setNewLayerName(`Layer ${Date.now().toString(36).toUpperCase()}`); }}
      >
        <Plus className="w-4 h-4" />
        <span>Add Layer</span>
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showMenu ? 'rotate-180' : ''}`} />
      </Button>

      {showMenu && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-border rounded-md shadow-lg p-3 z-10 animate-slide-down">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Layer Name</label>
              <input
                type="text"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                className="w-full px-2 py-1.5 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Layer Type</label>
              <div className="grid grid-cols-2 gap-1">
                {layerTypes.map(({ type, label, icon }) => (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors ${
                      selectedType === type
                        ? 'bg-ring text-ring-foreground'
                        : 'text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {icon}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setShowMenu(false); setNewLayerName(''); }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" className="flex-1" onClick={handleCreate}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}