// ============================================
// Tile Palette - Searchable, categorized tile selection UI with brush mode
// ============================================

import { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  Search,
  ChevronDown,
  Grid,
  List,
  X,
  Brush,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Copy,
  Trash2,
  MoreHorizontal,
  Palette,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { TileCategory, BrushSettings, TileVariant } from '@/types';
import { api } from '@/services/api';
import Button from '@/components/ui/Button';
import { useToast } from '@/contexts/ToastContext';
import { randomId } from '@/utils/uuid';

interface MapTile {
  id: string;
  name: string;
  category: TileCategory;
  assetId: string;
  width: number;
  height: number;
  connections?: Record<string, boolean>;
  asset: {
    id: string;
    filePath: string;
    thumbnailPath: string | null;
    originalName: string;
    mimeType: string;
  };
  createdBy?: { id: string; displayName: string } | null;
}

interface TilePaletteProps {
  mapId: string;
  isDM: boolean;
  onTileSelect: (tile: MapTile, variant: TileVariant) => void;
  onBrushTileSelect?: (tile: MapTile, brushSettings: BrushSettings) => void;
  brushSettings?: BrushSettings;
  onClose?: () => void;
}

const CATEGORIES: { value: TileCategory; label: string; icon: React.ReactNode }[] = [
  { value: 'FLOOR', label: 'Floor', icon: <Grid className="w-4 h-4" /> },
  { value: 'WALL', label: 'Walls', icon: <div className="w-4 h-4 border-b-2 border-current" /> },
  { value: 'CORNER', label: 'Corners', icon: <div className="w-4 h-4 border-r-2 border-b-2 border-current rounded-br" /> },
  { value: 'DOOR', label: 'Doors', icon: <div className="w-4 h-4 border-l-2 border-r-2 border-current" /> },
  { value: 'FURNITURE', label: 'Furniture', icon: <div className="w-4 h-4"><svg viewBox="0 0 24 24"><rect x="4" y="12" width="16" height="8" stroke="currentColor" fill="none"/><rect x="6" y="6" width="12" height="6" stroke="currentColor" fill="none"/></svg></div> },
  { value: 'PROP', label: 'Props', icon: <div className="w-4 h-4"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" stroke="currentColor" fill="none"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor"/></svg></div> },
  { value: 'STAIRS', label: 'Stairs', icon: <div className="w-4 h-4"><svg viewBox="0 0 24 24"><path d="M3 21h18M3 21L9 9M9 9L15 3" stroke="currentColor" fill="none"/></svg></div> },
  { value: 'SPECIAL', label: 'Special', icon: <div className="w-4 h-4"><svg viewBox="0 0 24 24"><polygon points="12 2 15 8.5 22 9.3 17 14 18 21 12 17.5 6 21 7 14 2 9.3 9 8.5" stroke="currentColor" fill="none"/></svg></div> },
];

const DEFAULT_VARIANTS: TileVariant[] = [
  { id: 'default', name: 'Default', rotation: 0, flipH: false, flipV: false },
  { id: 'rot90', name: '90°', rotation: 90, flipH: false, flipV: false },
  { id: 'rot180', name: '180°', rotation: 180, flipH: false, flipV: false },
  { id: 'rot270', name: '270°', rotation: 270, flipH: false, flipV: false },
  { id: 'flipH', name: 'Flip H', rotation: 0, flipH: true, flipV: false },
  { id: 'flipV', name: 'Flip V', rotation: 0, flipH: false, flipV: true },
  { id: 'rot90flipH', name: '90° + Flip H', rotation: 90, flipH: true, flipV: false },
  { id: 'rot90flipV', name: '90° + Flip V', rotation: 90, flipH: false, flipV: true },
];

const CATEGORY_ORDER: TileCategory[] = ['FLOOR', 'WALL', 'CORNER', 'DOOR', 'FURNITURE', 'PROP', 'STAIRS', 'SPECIAL'];

const TilePalette = forwardRef<HTMLDivElement, TilePaletteProps>(({
  mapId: _mapId,
  isDM,
  onTileSelect,
  onBrushTileSelect,
  brushSettings,
  onClose,
}, ref) => {
  const { campaign } = useCampaign();
  const { showToast } = useToast();
  const [tiles, setTiles] = useState<MapTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TileCategory | 'ALL'>('ALL');
  const [expandedCategories, setExpandedCategories] = useState<Set<TileCategory>>(new Set(['FLOOR', 'WALL']));
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTile, setSelectedTile] = useState<MapTile | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<TileVariant>(DEFAULT_VARIANTS[0]);
  const [showVariantPanel, setShowVariantPanel] = useState(false);
  const [tileSize, setTileSize] = useState(64);
  const [draggedTile, setDraggedTile] = useState<MapTile | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusSearch: () => searchInputRef.current?.focus(),
    clearSelection: () => setSelectedTile(null),
  }));

  const fetchTiles = useCallback(async () => {
    if (!campaign?.id) return;
    try {
      setLoading(true);
      const response = await api.get<{ tiles: MapTile[] }>(`/campaigns/${campaign.id}/tiles`);
      setTiles(response.data.tiles || []);
    } catch {
      console.error('Failed to fetch tiles');
      showToast('Failed to load tiles', 'error');
    } finally {
      setLoading(false);
    }
  }, [campaign?.id, showToast]);

  useEffect(() => {
    fetchTiles();
  }, [fetchTiles]);

  const filteredTiles = useMemo(() => {
    return tiles.filter(tile => {
      const matchesSearch = tile.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'ALL' || tile.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [tiles, searchQuery, selectedCategory]);

  const tilesByCategory = useMemo(() => {
    const grouped: Record<TileCategory, MapTile[]> = {
      FLOOR: [], WALL: [], CORNER: [], DOOR: [],
      FURNITURE: [], PROP: [], STAIRS: [], SPECIAL: [],
    };
    filteredTiles.forEach(tile => {
      grouped[tile.category].push(tile);
    });
    return grouped;
  }, [filteredTiles]);

  const toggleCategory = (category: TileCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const getTileImageUrl = (tile: MapTile) => {
    if (tile.asset.thumbnailPath) {
      return `/api/assets/${tile.asset.id}/thumbnail`;
    }
    return `/api/assets/${tile.asset.id}/download`;
  };

  const handleTileClick = (tile: MapTile, e?: React.MouseEvent) => {
    // Check for drag start (hold or right-click for brush mode)
    if (e && (e.shiftKey || e.button === 1 || e.button === 2)) {
      // Middle click or Shift+click for brush mode
      if (onBrushTileSelect && brushSettings) {
        onBrushTileSelect(tile, brushSettings);
      }
      return;
    }
    
    setSelectedTile(tile);
    setShowVariantPanel(true);
  };

  const handleTileDragStart = (tile: MapTile, e: React.DragEvent) => {
    if (!isDM) return;
    setDraggedTile(tile);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-tile', JSON.stringify({
      tileId: tile.id,
      variant: selectedVariant,
    }));
    
    // Create drag image
    const img = new Image();
    img.src = getTileImageUrl(tile);
    img.width = 64;
    img.height = 64;
    e.dataTransfer.setDragImage(img, 32, 32);
  };

  const handleTileDragEnd = () => {
    setDraggedTile(null);
  };

  const handleVariantSelect = (variant: TileVariant) => {
    if (selectedTile) {
      onTileSelect(selectedTile, variant);
      setSelectedVariant(variant);
    }
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading tiles...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface border-l border-border">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search tiles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={handleSearchClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} title="Close" aria-label="Close tile palette">
            <ChevronDown className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Mode Indicator */}
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 bg-background rounded text-muted-foreground">
            {brushSettings?.size ? (
              <>
                <Brush className="w-3 h-3 inline mr-1" />
                Brush Mode (Size: {brushSettings.size})
              </>
            ) : (
              <>
                <Palette className="w-3 h-3 inline mr-1" />
                Stamp Mode
              </>
            )}
          </span>
          {brushSettings?.autoTile && (
            <span className="px-2 py-0.5 bg-success/20 text-success rounded">Auto-tile</span>
          )}
        </div>
      </div>

      {/* Category Filter */}
      <div className="px-3 pb-2 border-b border-border">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {CATEGORY_ORDER.map(cat => {
            const categoryInfo = CATEGORIES.find(c => c.value === cat)!;
            const count = tilesByCategory[cat]?.length || 0;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? 'ALL' : cat)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-ring text-ring-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                <span className="flex items-center justify-center w-4 h-4">{categoryInfo.icon}</span>
                {categoryInfo.label}
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    selectedCategory === cat ? 'bg-ring-foreground/20 text-ring-foreground' : 'bg-background text-muted-foreground'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-ring text-ring-foreground' : 'text-muted-foreground hover:bg-accent'}`}
            aria-label="Grid view"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-ring text-ring-foreground' : 'text-muted-foreground hover:bg-accent'}`}
            aria-label="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Size:</span>
          <input
            type="range"
            min="48"
            max="128"
            step="8"
            value={tileSize}
            onChange={(e) => setTileSize(Number(e.target.value))}
            className="w-24 h-1 accent-ring"
            aria-label="Tile size"
          />
        </div>
      </div>

      {/* Tile Grid/List */}
      <div className="flex-1 overflow-y-auto p-3">
        {tiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-2">
            <Grid className="w-12 h-12" />
            <p className="text-sm">No tiles available</p>
            {isDM && (
              <Button variant="outline" size="sm" onClick={() => setShowUploadModal(true)}>
                Add Tiles
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {CATEGORY_ORDER.map(category => {
              const categoryTiles = tilesByCategory[category];
              if (!categoryTiles || categoryTiles.length === 0) return null;

              const categoryInfo = CATEGORIES.find(c => c.value === category)!;
              const isExpanded = expandedCategories.has(category);

              return (
                <div key={category} className="border border-border rounded-lg overflow-hidden">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
                  >
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    <span className="flex items-center justify-center w-5 h-5">{categoryInfo.icon}</span>
                    <span className="font-medium text-foreground capitalize">{categoryInfo.label.toLowerCase()}</span>
                    <span className="ml-auto px-2 py-0.5 text-xs bg-background text-muted-foreground rounded">
                      {categoryTiles.length}
                    </span>
                  </button>

                  {/* Category Content */}
                  {isExpanded && (
                    <div className={viewMode === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))]' : ''} style={{
                      gridTemplateColumns: viewMode === 'grid' ? `repeat(auto-fill, minmax(${tileSize}px, 1fr))` : undefined
                    }}>
                      {categoryTiles.map(tile => (
                        <TileCard
                          key={tile.id}
                          tile={tile}
                          size={tileSize}
                          selected={selectedTile?.id === tile.id}
                          onClick={handleTileClick}
                          onDragStart={(e) => handleTileDragStart(tile, e)}
                          onDragEnd={handleTileDragEnd}
                          getImageUrl={getTileImageUrl}
                          viewMode={viewMode}
                          isDragging={draggedTile?.id === tile.id}
                          brushMode={!!brushSettings}
                          onBrushSelect={(e) => handleTileClick(tile, e)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Variant Panel */}
      {showVariantPanel && selectedTile && (
        <VariantPanel
          tile={selectedTile}
          selectedVariant={selectedVariant}
          onVariantSelect={handleVariantSelect}
          onClose={() => setShowVariantPanel(false)}
          variants={DEFAULT_VARIANTS}
        />
      )}
    </div>
  );
});

TilePalette.displayName = 'TilePalette';

export default TilePalette;

interface TileCardProps {
  tile: MapTile;
  size: number;
  selected: boolean;
  onClick: (tile: MapTile, e?: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  getImageUrl: (tile: MapTile) => string;
  viewMode: 'grid' | 'list';
  isDragging: boolean;
  brushMode: boolean;
  onBrushSelect: (e: React.MouseEvent) => void;
}

function TileCard({ tile, size, selected, onClick, onDragStart, onDragEnd, getImageUrl, viewMode, isDragging, brushMode, onBrushSelect }: TileCardProps) {
  const imageUrl = getImageUrl(tile);

  if (viewMode === 'list') {
    return (
      <button
        onClick={(e) => onClick(tile, e)}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        draggable={true}
        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
          selected ? 'bg-ring/10 border border-ring' : 'hover:bg-accent'
        } ${isDragging ? 'opacity-50' : ''}`}
        title={tile.name}
      >
        <div className="relative w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-muted">
          <img src={imageUrl} alt={tile.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{tile.name}</p>
          <p className="text-xs text-muted-foreground">{tile.width}×{tile.height} squares</p>
        </div>
        {selected && <div className="w-2 h-2 bg-ring rounded-full" />}
      </button>
    );
  }

  return (
    <button
      onClick={(e) => onClick(tile, e)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseDown={brushMode ? onBrushSelect : undefined}
      draggable={true}
      className={`relative aspect-square rounded-lg overflow-hidden transition-all ${
        selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-surface' : 'hover:shadow-md'
      } ${isDragging ? 'opacity-50 ring-2 ring-ring' : ''}`}
      title={tile.name}
      style={{ width: size, height: size }}
    >
      <div className="w-full h-full relative bg-muted">
        <img
          src={imageUrl}
          alt={tile.name}
          className="w-full h-full object-cover transition-transform duration-200 hover:scale-105"
          loading="lazy"
        />
        {/* Tile dimensions badge */}
        <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/50 text-[10px] text-white font-mono">
          {tile.width}×{tile.height}
        </div>
        {tile.connections?.autoTile && (
          <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-success rounded-full" title="Auto-tile" />
        )}
        {brushMode && (
          <div className="absolute top-1 left-1 w-5 h-5 bg-primary/90 text-primary-foreground rounded flex items-center justify-center">
            <Brush className="w-3 h-3" />
          </div>
        )}
      </div>
      {selected && (
        <div className="absolute inset-0 bg-ring/20 pointer-events-none" />
      )}
    </button>
  );
}

interface VariantPanelProps {
  tile: MapTile;
  selectedVariant: TileVariant;
  onVariantSelect: (variant: TileVariant) => void;
  onClose: () => void;
  variants: TileVariant[];
}

function VariantPanel({ tile, selectedVariant, onVariantSelect, onClose, variants }: VariantPanelProps) {
  const [customVariant, setCustomVariant] = useState<TileVariant>(selectedVariant);

  const handleRotationChange = (rotation: 0 | 90 | 180 | 270) => {
    setCustomVariant(prev => ({ ...prev, rotation }));
  };

  const handleFlipHChange = (flipH: boolean) => {
    setCustomVariant(prev => ({ ...prev, flipH }));
  };

  const handleFlipVChange = (flipV: boolean) => {
    setCustomVariant(prev => ({ ...prev, flipV }));
  };

  return (
    <div className="border-t border-border bg-surface/95 backdrop-blur-sm p-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-foreground">Variants: {tile.name}</h4>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent transition-colors" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Preset Variants */}
      <div className="mb-3">
        <p className="text-xs text-muted-foreground mb-2">Presets</p>
        <div className="grid grid-cols-4 gap-2">
          {variants.map(variant => (
            <button
              key={variant.id}
              onClick={() => onVariantSelect(variant)}
              className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                selectedVariant.id === variant.id
                  ? 'border-ring bg-ring/10'
                  : 'border-transparent hover:border-border'
              }`}
              title={variant.name}
            >
              <div className="w-full h-full relative bg-muted" style={{
                transform: `rotate(${variant.rotation}deg) scaleX(${variant.flipH ? -1 : 1}) scaleY(${variant.flipV ? -1 : 1})`,
                transformOrigin: 'center center'
              }}>
                <img
                  src={`/api/assets/${tile.asset.id}/thumbnail`}
                  alt={tile.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/70 text-[10px] text-white text-center">
                {variant.name}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Variant Controls */}
      <div className="border-t border-border pt-3">
        <p className="text-xs text-muted-foreground mb-2">Custom</p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Rotation:</label>
            <select
              value={customVariant.rotation}
              onChange={(e) => handleRotationChange(Number(e.target.value) as 0 | 90 | 180 | 270)}
              className="px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={customVariant.flipH}
                onChange={(e) => handleFlipHChange(e.target.checked)}
                className="w-3 h-3"
              />
              <FlipHorizontal className="w-3 h-3" />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={customVariant.flipV}
                onChange={(e) => handleFlipVChange(e.target.checked)}
                className="w-3 h-3"
              />
              <FlipVertical className="w-3 h-3" />
            </label>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => {
            setCustomVariant({ ...DEFAULT_VARIANTS[0] });
            onVariantSelect(DEFAULT_VARIANTS[0]);
          }}>
            <RotateCw className="w-4 h-4 mr-1" /> Reset
          </Button>
          <Button variant="primary" size="sm" className="flex-1" onClick={() => {
            onVariantSelect(customVariant);
            onClose();
          }}>
            <Copy className="w-4 h-4 mr-1" /> Use This Variant
          </Button>
        </div>
      </div>
    </div>
  );
}