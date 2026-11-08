// ============================================
// Layer Panel - Map layer management UI
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Layers,
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
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { LayerType } from '@/types';
import { api } from '@/services/api';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/Toast';

interface MapLayer {
  id: string;
  mapId: string;
  name: string;
  type: LayerType;
  order: number;
  visible: boolean;
  locked: boolean;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface LayerPanelProps {
  mapId: string;
  isDM: boolean;
  onClose?: () => void;
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

export default function LayerPanel({ mapId, isDM, onClose }: LayerPanelProps) {
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
        setLayers(prev => prev.map(l => l.id === data.layer.id ? data.layer : l).sort((a, b) => a.order - b.order));
      }
    };

    const handleLayerRemoved = (data: { mapId: string; layerId: string }) => {
      if (data.mapId === mapId) {
        setLayers(prev => prev.filter(l => l.id !== data.layerId));
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
  }, [socket, mapId]);

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
      setLayers(response.data.layers || []);
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
        if (confirm('Delete this layer?')) await deleteLayer(layerId);
        break;
      case 'lock':
        await updateLayer(layerId, { locked: true });
        break;
      case 'unlock':
        await updateLayer(layerId, { locked: false });
        break;
    }
    setContextMenu(null);
  };

  const isProtected = (layer: MapLayer) => PROTECTED_LAYER_TYPES.includes(layer.type);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading layers...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-medium text-foreground flex items-center gap-2">
          <Layers className="w-5 h-5" />
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
            <Layers className="w-12 h-12" />
            <p className="text-sm">No layers yet</p>
            {isDM && (
              <Button variant="outline" size="sm" onClick={initializeLayers}>
                Create Default Layers
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-1" role="list">
            {/* Render in reverse order (top layer first visually) */}
            {[...layers].sort((a, b) => b.order - a.order).map((layer, index) => (
              <LayerItem
                key={layer.id}
                layer={layer}
                index={index}
                isDM={isDM}
                isEditing={editingLayerId === layer.id}
                editName={editName}
                setEditName={setEditName}
                draggingLayerId={draggingLayerId}
                dragOverLayerId={dragOverLayerId}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onStartEdit={startEditing}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onKeyDown={handleKeyDown}
                onContextMenu={showContextMenu}
                onVisibilityChange={(visible) => updateLayer(layer.id, { visible })}
                onLockChange={(locked) => updateLayer(layer.id, { locked })}
                isProtected={isProtected(layer)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-surface border border-border rounded-md shadow-lg py-1 min-w-[160px]"
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
            className="w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent focus:outline-none focus:bg-accent"
            onClick={() => handleContextAction('delete')}
          >
            <Trash2 className="w-4 h-4 inline mr-2" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

interface LayerItemProps {
  layer: MapLayer;
  index: number;
  isDM: boolean;
  isEditing: boolean;
  editName: string;
  setEditName: (name: string) => void;
  draggingLayerId: string | null;
  dragOverLayerId: string | null;
  onDragStart: (e: React.DragEvent, layerId: string) => void;
  onDragOver: (e: React.DragEvent, layerId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, layerId: string) => void;
  onDragEnd: () => void;
  onStartEdit: (layer: MapLayer) => void;
  onSaveEdit: (layerId: string) => void;
  onCancelEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent, layerId: string) => void;
  onContextMenu: (e: React.MouseEvent, layerId: string) => void;
  onVisibilityChange: (visible: boolean) => void;
  onLockChange: (locked: boolean) => void;
  isProtected: boolean;
}

function LayerItem({
  layer,
  index: _index,
  isDM,
  isEditing,
  editName,
  setEditName,
  draggingLayerId,
  dragOverLayerId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onStartEdit,
  onSaveEdit: _onSaveEdit,
  onCancelEdit,
  onKeyDown,
  onContextMenu,
  onVisibilityChange,
  onLockChange,
  isProtected,
}: LayerItemProps) {
  const isDragging = draggingLayerId === layer.id;
  const isDragOver = dragOverLayerId === layer.id;

  const handleDoubleClick = () => {
    if (isDM && !layer.locked) onStartEdit(layer);
  };

  return (
    <li
      className={`
        relative group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors
        ${isDragging ? 'opacity-50 bg-accent' : ''}
        ${isDragOver ? 'bg-accent/50 ring-2 ring-accent' : ''}
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
    >
      {/* Drag handle */}
      {isDM && !layer.locked && (
        <GripVertical
          className="w-4 h-4 text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
          aria-hidden="true"
        />
      )}

      {/* Visibility toggle */}
      <button
        className="p-1 rounded hover:bg-accent transition-colors flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onVisibilityChange(!layer.visible);
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
            onLockChange(!layer.locked);
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
      <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-muted-foreground/70">
        {LAYER_TYPE_ICONS[layer.type]}
      </span>

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
            flex-1 text-sm truncate min-w-0
            ${layer.locked ? 'text-muted-foreground' : 'text-foreground'}
            ${isProtected ? 'font-medium' : ''}
          `}
        >
          {layer.name}
        </span>
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
