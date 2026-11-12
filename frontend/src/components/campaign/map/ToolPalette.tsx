// ============================================
// Tool Palette - Main toolbar with 6 drawing modes (Shmeppy-style)
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Brush,
  Square,
  PenTool,
  Type,
  Eraser,
  MousePointer,
  Grid,
  Layers,
  Undo2,
  Redo2,
  Download,
  Upload,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { DrawingMode, ShapeType, GridSettings, BrushSettings } from '@/types';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import Button from '@/components/ui/Button';
import { useToast } from '@/contexts/ToastContext';
import { useGameStore } from '@/stores/gameStore';
import { useAuth } from '@/contexts/AuthContext';

interface ToolPaletteProps {
  mapId: string;
  isDM: boolean;
  activeLayerId: string | null;
  onLayerChange: (layerId: string) => void;
  onModeChange: (mode: DrawingMode) => void;
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void;
  onShapeSettingsChange: (settings: { type: ShapeType; color: string; fillColor: string; strokeWidth: number }) => void;
  onFreehandSettingsChange: (settings: { color: string; strokeWidth: number }) => void;
  onTextSettingsChange: (settings: { fontSize: number; color: string; fontFamily: string; backgroundColor?: string; backgroundOpacity?: number }) => void;
  onGridSettingsChange: (settings: Partial<GridSettings>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onImportImage: () => void;
  onExportMap: () => void;
  canUndo: boolean;
  canRedo: boolean;
  gridSettings: GridSettings;
  brushSettings: BrushSettings;
  shapeSettings: { type: ShapeType; color: string; fillColor: string; strokeWidth: number };
  freehandSettings: { color: string; strokeWidth: number };
  textSettings: { fontSize: number; color: string; fontFamily: string; backgroundColor?: string; backgroundOpacity?: number };
  layers: Array<{ id: string; name: string; type: string; visible: boolean; locked: boolean; order: number }>;
}

const DRAWING_MODES: { mode: DrawingMode; label: string; icon: React.ReactNode; shortcut: string; description: string }[] = [
  { mode: 'brush', label: 'Brush', icon: <Brush className="w-5 h-5" />, shortcut: 'B', description: 'Paint tiles continuously' },
  { mode: 'shape', label: 'Shapes', icon: <Square className="w-5 h-5" />, shortcut: 'S', description: 'Draw rectangles, circles, polygons' },
  { mode: 'freehand', label: 'Freehand', icon: <PenTool className="w-5 h-5" />, shortcut: 'F', description: 'Sketch irregular features' },
  { mode: 'text', label: 'Text', icon: <Type className="w-5 h-5" />, shortcut: 'T', description: 'Add labels and notes' },
  { mode: 'erase', label: 'Erase', icon: <Eraser className="w-5 h-5" />, shortcut: 'E', description: 'Remove strokes, tiles, shapes' },
  { mode: 'select', label: 'Select', icon: <MousePointer className="w-5 h-5" />, shortcut: 'V', description: 'Move, resize, rotate elements' },
];

const SHAPE_TYPES: { type: ShapeType; label: string; icon: React.ReactNode }[] = [
  { type: 'rect', label: 'Rectangle', icon: <Square className="w-5 h-5" /> },
  { type: 'circle', label: 'Circle', icon: <CircleIcon className="w-5 h-5" /> },
  { type: 'polygon', label: 'Polygon', icon: <PolygonIcon className="w-5 h-5" /> },
  { type: 'line', label: 'Line', icon: <LineIcon className="w-5 h-5" /> },
  { type: 'arrow', label: 'Arrow', icon: <ArrowIcon className="w-5 h-5" /> },
  { type: 'room', label: 'Instant Room', icon: <Grid className="w-5 h-5" /> },
];

function CircleIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" fill="none" strokeWidth="2" /></svg>;
}

function PolygonIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24"><polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" stroke="currentColor" fill="none" strokeWidth="2" /></svg>;
}

function LineIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" /></svg>;
}

function ArrowIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" /><polygon points="20,12 14,7 14,17" stroke="currentColor" fill="currentColor" /></svg>;
}

export default function ToolPalette({
  mapId,
  isDM,
  activeLayerId,
  onLayerChange,
  onModeChange,
  onBrushSettingsChange,
  onShapeSettingsChange,
  onFreehandSettingsChange,
  onTextSettingsChange,
  onGridSettingsChange,
  onUndo,
  onRedo,
  onImportImage,
  onExportMap,
  canUndo,
  canRedo,
  gridSettings,
  brushSettings,
  shapeSettings,
  freehandSettings,
  textSettings,
  layers,
}: ToolPaletteProps) {
  const { socket } = useWebSocket();
  
  const [activeMode, setActiveMode] = useState<DrawingMode>('select');
  const [activeShapeType, setActiveShapeType] = useState<ShapeType>('rect');
  const [showShapeOptions, setShowShapeOptions] = useState(false);
  const [showBrushOptions, setShowBrushOptions] = useState(false);
  const [showFreehandOptions, setShowFreehandOptions] = useState(false);
  const [showTextOptions, setShowTextOptions] = useState(false);
  const [showGridOptions, setShowGridOptions] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleModeChange = useCallback((mode: DrawingMode) => {
    setActiveMode(mode);
    onModeChange(mode);
    
    // Close option panels when switching modes
    if (mode !== 'brush') setShowBrushOptions(false);
    if (mode !== 'shape') setShowShapeOptions(false);
    if (mode !== 'freehand') setShowFreehandOptions(false);
    if (mode !== 'text') setShowTextOptions(false);
  }, [onModeChange]);

  const handleShapeTypeChange = useCallback((type: ShapeType) => {
    setActiveShapeType(type);
    onShapeSettingsChange({ ...shapeSettings, type });
    setShowShapeOptions(false);
  }, [onShapeSettingsChange, shapeSettings]);

  const handleColorChange = useCallback((target: 'stroke' | 'fill', color: string) => {
    if (target === 'stroke') {
      if (activeMode === 'shape') {
        onShapeSettingsChange({ ...shapeSettings, color });
      } else if (activeMode === 'freehand') {
        onFreehandSettingsChange({ ...freehandSettings, color });
      } else if (activeMode === 'text') {
        onTextSettingsChange({ ...textSettings, color });
      }
    } else {
      onShapeSettingsChange({ ...shapeSettings, fillColor: color });
    }
    setColorPickerOpen(null);
  }, [activeMode, onShapeSettingsChange, onFreehandSettingsChange, onTextSettingsChange, shapeSettings, freehandSettings, textSettings]);

  const handleStrokeWidthChange = useCallback((width: number) => {
    if (activeMode === 'shape') {
      onShapeSettingsChange({ ...shapeSettings, strokeWidth: width });
    } else if (activeMode === 'freehand') {
      onFreehandSettingsChange({ ...freehandSettings, strokeWidth: width });
    }
  }, [activeMode, onShapeSettingsChange, onFreehandSettingsChange, shapeSettings, freehandSettings]);

  const handleGridToggle = useCallback(() => {
    onGridSettingsChange({ enabled: !gridSettings.enabled });
  }, [onGridSettingsChange, gridSettings.enabled]);

  const handleSnapModeChange = useCallback((mode: GridSettings['snapMode']) => {
    onGridSettingsChange({ snapMode: mode });
  }, [onGridSettingsChange]);

  const handleKeyboardShortcuts = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
      } else if (e.key === 'y') {
        e.preventDefault();
        onRedo();
      }
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'b': handleModeChange('brush'); break;
      case 's': handleModeChange('shape'); break;
      case 'f': handleModeChange('freehand'); break;
      case 't': handleModeChange('text'); break;
      case 'e': handleModeChange('erase'); break;
      case 'v': handleModeChange('select'); break;
      case 'g': handleGridToggle(); break;
      case 'escape': 
        handleModeChange('select');
        setShowShapeOptions(false);
        setShowBrushOptions(false);
        setShowFreehandOptions(false);
        setShowTextOptions(false);
        setShowGridOptions(false);
        break;
    }
  }, [handleModeChange, handleGridToggle, onUndo, onRedo]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [handleKeyboardShortcuts]);

  const handleBrushSizeChange = useCallback((size: number) => {
    onBrushSettingsChange({ ...brushSettings, size });
  }, [onBrushSettingsChange, brushSettings]);

  const handleBrushShapeChange = useCallback((shape: 'circle' | 'square') => {
    onBrushSettingsChange({ ...brushSettings, shape });
  }, [onBrushSettingsChange, brushSettings]);

  const handleOpacityChange = useCallback((value: number) => {
    setOpacity(value);
    if (activeLayerId) {
      // Send opacity change via WebSocket
      if (socket) {
        socket.emit('layer:update', {
          mapId,
          layerId: activeLayerId,
          data: { opacity: value / 100 },
        });
      }
    }
  }, [socket, mapId, activeLayerId]);

  const sortedLayers = [...layers].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col h-full bg-surface border-r border-border">
      {/* Main Toolbar */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-1 mb-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">Tools</h3>
          {isDM && (
            <Button variant="ghost" size="sm" onClick={onImportImage} title="Import Image Map (I)">
              <Upload className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Drawing Modes */}
        <div className="grid grid-cols-3 gap-1 mb-3" role="toolbar" aria-label="Drawing tools">
          {DRAWING_MODES.map(({ mode, label, icon, shortcut, description }) => (
            <Button
              key={mode}
              variant={activeMode === mode ? 'primary' : 'ghost'}
              size="sm"
              className="h-10 flex flex-col items-center justify-center gap-0.5 px-2"
              onClick={() => handleModeChange(mode)}
              title={`${label} (${shortcut})`}
              aria-label={`${label} tool`}
              aria-pressed={activeMode === mode}
            >
              <span className="flex items-center justify-center">{icon}</span>
              <span className="text-[10px] font-medium">{label}</span>
              <kbd className="text-[9px] text-muted-foreground px-0.5 rounded">{shortcut}</kbd>
            </Button>
          ))}
        </div>

        {/* Undo/Redo */}
        <div className="flex gap-1 mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </Button>
          <div className="flex-1" />
          {isDM && (
            <Button variant="ghost" size="sm" onClick={onExportMap} title="Export Map">
              <Download className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Mode-specific Options */}
        {activeMode === 'brush' && showBrushOptions && (
          <BrushOptionsPanel
            settings={brushSettings}
            onSizeChange={handleBrushSizeChange}
            onShapeChange={handleBrushShapeChange}
            onClose={() => setShowBrushOptions(false)}
            onColorChange={(color) => handleColorChange('stroke', color)}
          />
        )}

        {activeMode === 'shape' && showShapeOptions && (
          <ShapeOptionsPanel
            settings={shapeSettings}
            activeType={activeShapeType}
            onTypeChange={handleShapeTypeChange}
            onStrokeColorChange={(color) => handleColorChange('stroke', color)}
            onFillColorChange={(color) => handleColorChange('fill', color)}
            onStrokeWidthChange={handleStrokeWidthChange}
            onClose={() => setShowShapeOptions(false)}
          />
        )}

        {activeMode === 'freehand' && showFreehandOptions && (
          <FreehandOptionsPanel
            settings={freehandSettings}
            onStrokeColorChange={(color) => handleColorChange('stroke', color)}
            onStrokeWidthChange={handleStrokeWidthChange}
            onClose={() => setShowFreehandOptions(false)}
          />
        )}

        {activeMode === 'text' && showTextOptions && (
          <TextOptionsPanel
            settings={textSettings}
            onColorChange={(color) => handleColorChange('stroke', color)}
            onFontSizeChange={(size) => onTextSettingsChange({ ...textSettings, fontSize: size })}
            onFontFamilyChange={(family) => onTextSettingsChange({ ...textSettings, fontFamily: family })}
            onBackgroundColorChange={(color) => onTextSettingsChange({ ...textSettings, backgroundColor: color })}
            onBackgroundOpacityChange={(opacity) => onTextSettingsChange({ ...textSettings, backgroundOpacity: opacity })}
            onClose={() => setShowTextOptions(false)}
          />
        )}

        {showGridOptions && (
          <GridOptionsPanel
            settings={gridSettings}
            onEnabledChange={handleGridToggle}
            onSnapModeChange={handleSnapModeChange}
            onColorChange={(color) => onGridSettingsChange({ color })}
            onOpacityChange={(opacity) => onGridSettingsChange({ opacity })}
            onClose={() => setShowGridOptions(false)}
          />
        )}

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 min-w-[80px]"
            onClick={() => setShowBrushOptions(!showBrushOptions)}
            aria-expanded={showBrushOptions}
            aria-controls="brush-options"
          >
            <Brush className="w-4 h-4 mr-1" /> Brush
            <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showBrushOptions ? 'rotate-180' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 min-w-[80px]"
            onClick={() => setShowShapeOptions(!showShapeOptions)}
            aria-expanded={showShapeOptions}
            aria-controls="shape-options"
          >
            <Square className="w-4 h-4 mr-1" /> Shapes
            <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showShapeOptions ? 'rotate-180' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 min-w-[80px]"
            onClick={() => setShowFreehandOptions(!showFreehandOptions)}
            aria-expanded={showFreehandOptions}
            aria-controls="freehand-options"
          >
            <PenTool className="w-4 h-4 mr-1" /> Freehand
            <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showFreehandOptions ? 'rotate-180' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 min-w-[80px]"
            onClick={() => setShowTextOptions(!showTextOptions)}
            aria-expanded={showTextOptions}
            aria-controls="text-options"
          >
            <Type className="w-4 h-4 mr-1" /> Text
            <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showTextOptions ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Grid & View Controls */}
        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border">
          <Button
            variant={gridSettings.enabled ? 'primary' : 'ghost'}
            size="sm"
            className="flex-1 min-w-[80px]"
            onClick={handleGridToggle}
            title="Toggle Grid (G)"
          >
            <Grid className="w-4 h-4 mr-1" />
            Grid
            {gridSettings.enabled && <span className="ml-1 text-[10px] bg-success/20 text-success px-1 rounded">On</span>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 min-w-[80px]"
            onClick={() => setShowGridOptions(!showGridOptions)}
            aria-expanded={showGridOptions}
          >
            <Settings className="w-4 h-4 mr-1" /> Grid
            <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showGridOptions ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Layer Quick Access */}
        <div className="mt-3 pt-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => setShowLayerPanel(!showLayerPanel)}
            aria-expanded={showLayerPanel}
          >
            <Layers className="w-4 h-4 mr-2" />
            Layers ({sortedLayers.length})
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showLayerPanel ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Layer Panel Dropdown */}
      {showLayerPanel && (
        <LayerPanelDropdown
          layers={sortedLayers}
          activeLayerId={activeLayerId}
          onLayerChange={onLayerChange}
          onClose={() => setShowLayerPanel(false)}
          isDM={isDM}
          mapId={mapId}
          socket={socket}
        />
      )}

      {/* History Panel */}
      {showHistory && (
        <HistoryPanel
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

// ============================================
// Sub-components for mode-specific options
// ============================================

interface BrushOptionsPanelProps {
  settings: BrushSettings;
  onSizeChange: (size: number) => void;
  onShapeChange: (shape: 'circle' | 'square') => void;
  onClose: () => void;
  onColorChange: (color: string) => void;
}

function BrushOptionsPanel({ settings, onSizeChange, onShapeChange, onClose, onColorChange }: BrushOptionsPanelProps) {
  return (
    <div id="brush-options" className="p-3 border-t border-border bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Brush Options</h4>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">×</button>
      </div>
      
      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Size:</span>
          <input
            type="range"
            min="1"
            max="20"
            value={settings.size}
            onChange={(e) => onSizeChange(Number(e.target.value))}
            className="flex-1 h-1 accent-ring"
          />
          <span className="w-8 text-right font-mono text-xs">{settings.size}</span>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Shape:</span>
          <select
            value={settings.shape}
            onChange={(e) => onShapeChange(e.target.value as 'circle' | 'square')}
            className="flex-1 px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="circle">Circle</option>
            <option value="square">Square</option>
          </select>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Color:</span>
          <input
            type="color"
            value={settings.tileId || '#000000'} // Would use actual tile color
            onChange={(e) => onColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-input cursor-pointer"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.autoTile}
          onChange={(e) => onBrushSettingsChange({ ...settings, autoTile: e.target.checked })}
        />
        <span>Auto-tile (Wang tiles)</span>
      </label>
    </div>
  );
}

// Need to add onBrushSettingsChange to BrushOptionsPanel props
interface BrushOptionsPanelPropsExtended extends BrushOptionsPanelProps {
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void;
}

function BrushOptionsPanelExtended({ settings, onSizeChange, onShapeChange, onClose, onColorChange, onBrushSettingsChange }: BrushOptionsPanelPropsExtended) {
  return (
    <div id="brush-options" className="p-3 border-t border-border bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Brush Options</h4>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">×</button>
      </div>
      
      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Size:</span>
          <input
            type="range"
            min="1"
            max="20"
            value={settings.size}
            onChange={(e) => onSizeChange(Number(e.target.value))}
            className="flex-1 h-1 accent-ring"
          />
          <span className="w-8 text-right font-mono text-xs">{settings.size}</span>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Shape:</span>
          <select
            value={settings.shape}
            onChange={(e) => onShapeChange(e.target.value as 'circle' | 'square')}
            className="flex-1 px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="circle">Circle</option>
            <option value="square">Square</option>
          </select>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Color:</span>
          <input
            type="color"
            value="#000000"
            onChange={(e) => onColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-input cursor-pointer"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.autoTile}
          onChange={(e) => onBrushSettingsChange({ ...settings, autoTile: e.target.checked })}
        />
        <span>Auto-tile (Wang tiles)</span>
      </label>
    </div>
  );
}

interface ShapeOptionsPanelProps {
  settings: { type: ShapeType; color: string; fillColor: string; strokeWidth: number };
  activeType: ShapeType;
  onTypeChange: (type: ShapeType) => void;
  onStrokeColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onClose: () => void;
}

function ShapeOptionsPanel({ settings, activeType, onTypeChange, onStrokeColorChange, onFillColorChange, onStrokeWidthChange, onClose }: ShapeOptionsPanelProps) {
  return (
    <div id="shape-options" className="p-3 border-t border-border bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Shape Options</h4>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">×</button>
      </div>

      <div>
        <label className="text-sm font-medium">Shape Type:</label>
        <div className="flex gap-1 mt-1 flex-wrap">
          {SHAPE_TYPES.map(({ type, label, icon }) => (
            <Button
              key={type}
              variant={activeType === type ? 'primary' : 'ghost'}
              size="sm"
              className="flex items-center gap-1 px-2 py-1.5"
              onClick={() => onTypeChange(type)}
              title={label}
            >
              {icon}
              <span className="text-xs">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Stroke:</span>
          <input
            type="color"
            value={settings.color}
            onChange={(e) => onStrokeColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-input cursor-pointer"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Fill:</span>
          <input
            type="color"
            value={settings.fillColor}
            onChange={(e) => onFillColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-input cursor-pointer"
          />
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Width:</span>
          <input
            type="range"
            min="1"
            max="20"
            value={settings.strokeWidth}
            onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
            className="flex-1 h-1 accent-ring"
          />
          <span className="w-8 text-right font-mono text-xs">{settings.strokeWidth}</span>
        </label>
      </div>
    </div>
  );
}

interface FreehandOptionsPanelProps {
  settings: { color: string; strokeWidth: number };
  onStrokeColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onClose: () => void;
}

function FreehandOptionsPanel({ settings, onStrokeColorChange, onStrokeWidthChange, onClose }: FreehandOptionsPanelProps) {
  return (
    <div id="freehand-options" className="p-3 border-t border-border bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Freehand Options</h4>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">×</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Color:</span>
          <input
            type="color"
            value={settings.color}
            onChange={(e) => onStrokeColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-input cursor-pointer"
          />
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Width:</span>
          <input
            type="range"
            min="1"
            max="20"
            value={settings.strokeWidth}
            onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
            className="flex-1 h-1 accent-ring"
          />
          <span className="w-8 text-right font-mono text-xs">{settings.strokeWidth}</span>
        </label>
      </div>

      <p className="text-xs text-muted-foreground">Tip: Hold Shift for straight lines</p>
    </div>
  );
}

interface TextOptionsPanelProps {
  settings: { fontSize: number; color: string; fontFamily: string; backgroundColor?: string; backgroundOpacity?: number };
  onColorChange: (color: string) => void;
  onFontSizeChange: (size: number) => void;
  onFontFamilyChange: (family: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onBackgroundOpacityChange: (opacity: number) => void;
  onClose: () => void;
}

function TextOptionsPanel({ settings, onColorChange, onFontSizeChange, onFontFamilyChange, onBackgroundColorChange, onBackgroundOpacityChange, onClose }: TextOptionsPanelProps) {
  const fontFamilies = ['Inter', 'Georgia', 'Roboto', 'Open Sans', 'Lora', 'Merriweather', 'Nunito', 'Poppins'];
  
  return (
    <div id="text-options" className="p-3 border-t border-border bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Text Options</h4>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">×</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Color:</span>
          <input
            type="color"
            value={settings.color}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-input cursor-pointer"
          />
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Size:</span>
          <input
            type="range"
            min="8"
            max="72"
            value={settings.fontSize}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
            className="flex-1 h-1 accent-ring"
          />
          <span className="w-8 text-right font-mono text-xs">{settings.fontSize}px</span>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Font:</span>
          <select
            value={settings.fontFamily}
            onChange={(e) => onFontFamilyChange(e.target.value)}
            className="flex-1 px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {fontFamilies.map(font => (
              <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">BG Color:</span>
          <input
            type="color"
            value={settings.backgroundColor || '#ffffff'}
            onChange={(e) => onBackgroundColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-input cursor-pointer"
          />
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">BG Opacity:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.backgroundOpacity ?? 100}
            onChange={(e) => onBackgroundOpacityChange(Number(e.target.value))}
            className="flex-1 h-1 accent-ring"
          />
          <span className="w-8 text-right font-mono text-xs">{settings.backgroundOpacity ?? 100}%</span>
        </label>
      </div>
    </div>
  );
}

interface GridOptionsPanelProps {
  settings: GridSettings;
  onEnabledChange: () => void;
  onSnapModeChange: (mode: GridSettings['snapMode']) => void;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  onClose: () => void;
}

function GridOptionsPanel({ settings, onEnabledChange, onSnapModeChange, onColorChange, onOpacityChange, onClose }: GridOptionsPanelProps) {
  return (
    <div id="grid-options" className="p-3 border-t border-border bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Grid Settings</h4>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">×</button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={onEnabledChange}
        />
        <span>Show Grid</span>
      </label>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Color:</span>
          <input
            type="color"
            value={settings.color}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-input cursor-pointer"
          />
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Opacity:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.opacity * 100}
            onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
            className="flex-1 h-1 accent-ring"
          />
          <span className="w-8 text-right font-mono text-xs">{Math.round(settings.opacity * 100)}%</span>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Snap:</span>
          <select
            value={settings.snapMode}
            onChange={(e) => onSnapModeChange(e.target.value as GridSettings['snapMode'])}
            className="flex-1 px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="intersections">Intersections</option>
            <option value="centers">Cell Centers</option>
            <option value="off">Off</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.showCoordinates}
          onChange={(e) => onGridSettingsChange({ showCoordinates: e.target.checked })}
        />
        <span>Show Coordinates</span>
      </label>
    </div>
  );
}

function GridOptionsPanelExtended({ settings, onEnabledChange, onSnapModeChange, onColorChange, onOpacityChange, onClose, onGridSettingsChange }: GridOptionsPanelProps & { onGridSettingsChange: (settings: Partial<GridSettings>) => void }) {
  return (
    <div id="grid-options" className="p-3 border-t border-border bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Grid Settings</h4>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">×</button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={onEnabledChange}
        />
        <span>Show Grid</span>
      </label>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Color:</span>
          <input
            type="color"
            value={settings.color}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-input cursor-pointer"
          />
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Opacity:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.opacity * 100}
            onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
            className="flex-1 h-1 accent-ring"
          />
          <span className="w-8 text-right font-mono text-xs">{Math.round(settings.opacity * 100)}%</span>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16">Snap:</span>
          <select
            value={settings.snapMode}
            onChange={(e) => onSnapModeChange(e.target.value as GridSettings['snapMode'])}
            className="flex-1 px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="intersections">Intersections</option>
            <option value="centers">Cell Centers</option>
            <option value="off">Off</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.showCoordinates}
          onChange={(e) => onGridSettingsChange({ showCoordinates: e.target.checked })}
        />
        <span>Show Coordinates</span>
      </label>
    </div>
  );
}

interface LayerPanelDropdownProps {
  layers: Array<{ id: string; name: string; type: string; visible: boolean; locked: boolean; order: number }>;
  activeLayerId: string | null;
  onLayerChange: (layerId: string) => void;
  onClose: () => void;
  isDM: boolean;
  mapId: string;
  socket: any;
}

function LayerPanelDropdown({ layers, activeLayerId, onLayerChange, onClose, isDM, mapId, socket }: LayerPanelDropdownProps) {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [opacityValues, setOpacityValues] = useState<Record<string, number>>({});

  const handleOpacityChange = (layerId: string, opacity: number) => {
    setOpacityValues(prev => ({ ...prev, [layerId]: opacity }));
    if (socket) {
      socket.emit('layer:update', {
        mapId,
        layerId,
        data: { opacity: opacity / 100 },
      });
    }
  };

  const handleVisibilityChange = (layerId: string, visible: boolean) => {
    if (socket) {
      socket.emit('layer:update', { mapId, layerId, visible });
    }
  };

  const handleLockChange = (layerId: string, locked: boolean) => {
    if (socket) {
      socket.emit('layer:update', { mapId, layerId, locked });
    }
  };

  const startEdit = (layer: typeof layers[0]) => {
    if (isDM && !layer.locked) {
      setEditingLayerId(layer.id);
      setEditName(layer.name);
    }
  };

  const saveEdit = async (layerId: string) => {
    if (!editName.trim()) return;
    if (socket) {
      socket.emit('layer:update', { mapId, layerId, name: editName.trim() });
    }
    setEditingLayerId(null);
    setEditName('');
  };

  const cancelEdit = () => {
    setEditingLayerId(null);
    setEditName('');
  };

  return (
    <div className="border-t border-border bg-surface p-3 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">Layers</h4>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">×</button>
      </div>

      <ul className="space-y-1" role="list">
        {[...layers].sort((a, b) => b.order - a.order).map((layer) => (
          <LayerDropdownItem
            key={layer.id}
            layer={layer}
            isActive={activeLayerId === layer.id}
            isEditing={editingLayerId === layer.id}
            editName={editName}
            setEditName={setEditName}
            opacity={opacityValues[layer.id] ?? 100}
            onSelect={onLayerChange}
            onStartEdit={startEdit}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
            onVisibilityChange={handleVisibilityChange}
            onLockChange={handleLockChange}
            onOpacityChange={handleOpacityChange}
            isDM={isDM}
          />
        ))}
      </ul>

      {isDM && (
        <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => {
          // Create new layer
          if (socket) {
            socket.emit('layer:create', {
              mapId,
              name: `Layer ${layers.length + 1}`,
              type: 'ANNOTATIONS',
              order: layers.length,
            });
          }
        }}>
          + Add Layer
        </Button>
      )}
    </div>
  );
}

interface LayerDropdownItemProps {
  layer: { id: string; name: string; type: string; visible: boolean; locked: boolean; order: number };
  isActive: boolean;
  isEditing: boolean;
  editName: string;
  setEditName: (name: string) => void;
  opacity: number;
  onSelect: (layerId: string) => void;
  onStartEdit: (layer: typeof layers[0]) => void;
  onSaveEdit: (layerId: string) => void;
  onCancelEdit: () => void;
  onVisibilityChange: (layerId: string, visible: boolean) => void;
  onLockChange: (layerId: string, locked: boolean) => void;
  onOpacityChange: (layerId: string, opacity: number) => void;
  isDM: boolean;
}

function LayerDropdownItem({
  layer,
  isActive,
  isEditing,
  editName,
  setEditName,
  opacity,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onVisibilityChange,
  onLockChange,
  onOpacityChange,
  isDM,
}: LayerDropdownItemProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSaveEdit(layer.id);
    else if (e.key === 'Escape') onCancelEdit();
  };

  return (
    <li className={`relative group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${isActive ? 'bg-ring/10' : ''} ${layer.locked ? 'opacity-60' : ''}`} onClick={() => onSelect(layer.id)}>
      <input
        type="checkbox"
        checked={layer.visible}
        onChange={(e) => { e.stopPropagation(); onVisibilityChange(layer.id, e.target.checked); }}
        className="w-4 h-4"
        title={layer.visible ? 'Hide' : 'Show'}
      />
      {isDM && (
        <input
          type="checkbox"
          checked={layer.locked}
          onChange={(e) => { e.stopPropagation(); onLockChange(layer.id, e.target.checked); }}
          className="w-4 h-4"
          title={layer.locked ? 'Unlock' : 'Lock'}
        />
      )}
      {isEditing ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={onCancelEdit}
          onKeyDown={handleKeyDown}
          className="flex-1 px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring min-w-0"
          autoFocus
        />
      ) : (
        <span className={`flex-1 text-sm truncate min-w-0 ${layer.locked ? 'text-muted-foreground' : 'text-foreground'}`} onDoubleClick={() => onStartEdit(layer)}>
          {layer.name}
        </span>
      )}
      {isDM && (
        <input
          type="range"
          min="0"
          max="100"
          value={opacity}
          onChange={(e) => { e.stopPropagation(); onOpacityChange(layer.id, Number(e.target.value)); }}
          className="w-20 h-1 accent-ring"
          title="Opacity"
        />
      )}
      <span className="px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground font-medium flex-shrink-0">
        {layer.type}
      </span>
    </li>
  );
}

function HistoryPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="border-t border-border bg-surface p-3 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">History</h4>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">×</button>
      </div>
      <p className="text-sm text-muted-foreground text-center py-8">History panel - coming soon</p>
    </div>
  );
}