/**
 * DmFogControls
 * DM-only fog of war controls panel.
 * Carries the per-map switch: with fog on, the DM reveals or hides regions
 * by dragging a box over the map (the selection snaps to whole grid squares)
 * plus bulk reveal/hide actions; with fog off the panel says so and offers
 * nothing that would change what players see.
 */

import { useId, useState } from 'react';
import { Eye, EyeOff, Zap, Circle, Minus, Square, Hexagon } from 'lucide-react';

export type FogToolMode = 'fog-reveal' | 'fog-hide' | 'fog-shape-cone' | 'fog-shape-radius' | 'fog-shape-line' | 'fog-shape-cube' | 'fog-shape-sphere' | 'fog-shape-custom' | null;

interface DmFogControlsProps {
  fogMode: FogToolMode;
  onFogModeChange: (mode: FogToolMode) => void;
  onRevealAll: () => void;
  onHideAll: () => void;
  /** Whether manual fog applies on this map. */
  fogEnabled: boolean;
  /** The DM ticked or unticked "Fog of war on this map". */
  onFogEnabledChange: (enabled: boolean) => void;
  /**
   * Forget what every player has seen of this map. Absent when the map has
   * no explored memory to forget (lighting off, or the setting off).
   */
  onResetExploration?: () => void;
  /**
   * Called when the panel is folded away, so the tool it holds can be put
   * down with it. Leaving a fog tool armed behind a closed panel means the
   * next drag on the map reveals or hides ground with nothing on screen
   * saying why.
   */
  onCollapse?: () => void;
  /** Party Vision Merge: share explored areas with party */
  fogShareExploredWithParty?: boolean;
  onFogShareExploredWithPartyChange?: (enabled: boolean) => void;
  excludedCharacterIds?: string[];
  currentMap?: { lightingEnabled?: boolean; tokens?: Array<{ characterId?: string | null; name: string }> } | null;
  explorationEnabled?: boolean;
  /** Fog animation configuration */
  fogAnimationConfig?: { duration?: number; respectReducedMotion?: boolean };
  onFogAnimationConfigChange?: (config: { duration?: number; respectReducedMotion?: boolean }) => void;
}

/**
 * A Confirm? state's pulse: a ring round the button, so its label keeps its
 * contrast through the pulse (DmFogControls.test.tsx). Its colour is the fill's.
 */
function ConfirmPulse({ ring }: { ring: 'ring-lime-300' | 'ring-warning' }) {
  return <span aria-hidden="true" className={`absolute inset-0 rounded ring-2 ${ring} animate-pulse pointer-events-none`} />;
}

export default function DmFogControls({
  fogMode,
  onFogModeChange,
  onRevealAll,
  onHideAll,
  fogEnabled,
  onFogEnabledChange,
  onResetExploration,
  onCollapse,
  fogShareExploredWithParty = false,
  onFogShareExploredWithPartyChange,
  excludedCharacterIds = [],
  currentMap = null,
  explorationEnabled = false,
  fogAnimationConfig,
  onFogAnimationConfigChange,
}: DmFogControlsProps) {
  const [confirmRevealAll, setConfirmRevealAll] = useState(false);
  const [confirmHideAll, setConfirmHideAll] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleResetExploration = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    setConfirmReset(false);
    onResetExploration?.();
  };
  // Folded away to begin with, like the other map tools: a DM arriving at the
  // table wants to see the map, not three open panels over it.
  const [collapsed, setCollapsed] = useState(true);
  const bodyId = useId();

  const handleRevealAll = () => {
    if (!confirmRevealAll) { setConfirmRevealAll(true); return; }
    setConfirmRevealAll(false);
    onRevealAll();
  };

  const handleHideAll = () => {
    if (!confirmHideAll) { setConfirmHideAll(true); return; }
    setConfirmHideAll(false);
    onHideAll();
  };

  return (
    <div className="flex flex-col gap-0 bg-stone-800/90 rounded-lg border border-warm-amber/20 min-w-[160px] overflow-hidden">
      {/* Header with collapse toggle */}
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className="touch-target w-full flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-stone-700/50 select-none"
        onClick={() => {
          const next = !collapsed;
          setCollapsed(next);
          if (next) onCollapse?.();
        }}
      >
        <span className="text-xs text-amber-300 font-medium uppercase tracking-wide">Fog of War</span>
        <span className="text-stone-400 text-xs" aria-hidden="true">{collapsed ? '▶' : '▼'}</span>
      </button>
    {!collapsed && (
      <div id={bodyId} className="flex flex-col gap-2 p-2 pt-1">

      {/* The per-map switch. Off puts an armed tool down first: a reveal box
          dragged with fog off would change nothing players can see. */}
      <label className="touch-target flex items-center gap-2 px-1 py-0.5 text-xs text-stone-300 cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-3.5 h-3.5 accent-lime-500"
          checked={fogEnabled}
          onChange={(e) => {
            const next = e.target.checked;
            if (!next) onFogModeChange(null);
            onFogEnabledChange(next);
          }}
          aria-label="Fog of war on this map"
        />
        Fog of war on this map
      </label>

      {!fogEnabled && (
        <p className="px-1 text-[11px] leading-snug text-stone-400">
          Fog is off. Players see the whole map (dynamic lighting still applies).
          What you had revealed is kept for when you turn it back on.
        </p>
      )}

      {fogEnabled && (<>
      {/* Mode toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-reveal' ? null : 'fog-reveal')}
          className={`touch-target flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-reveal'
              ? 'bg-lime-600/30 text-lime-400 border border-lime-500/50'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
          }`}
          title="Reveal — drag a box over the map to reveal it to players"
          aria-label="Fog reveal box"
        >
          <Eye className="w-3.5 h-3.5" />
          Reveal
        </button>
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-hide' ? null : 'fog-hide')}
          className={`touch-target flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-hide'
              ? 'bg-warning/30 text-warning-ink border border-warning/50'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
          }`}
          title="Hide — drag a box over the map to hide it from players"
          aria-label="Fog hide box"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Hide
        </button>
      </div>

      {/* Shape Tools */}
      <div className="flex flex-wrap gap-1 pt-1 border-t border-stone-700/50">
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-shape-cone' ? null : 'fog-shape-cone')}
          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-shape-cone'
              ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
          }`}
          title="Cone — click origin, drag for direction and length (Burning Hands, Cone of Cold)"
          aria-label="Fog cone shape"
        >
          <Zap className="w-3.5 h-3.5" />
          Cone
        </button>
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-shape-radius' ? null : 'fog-shape-radius')}
          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-shape-radius'
              ? 'bg-orange-600/30 text-orange-400 border border-orange-500/50'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
          }`}
          title="Radius — click center, drag for radius (Fireball, Darkness, Light)"
          aria-label="Fog radius shape"
        >
          <Circle className="w-3.5 h-3.5" />
          Radius
        </button>
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-shape-line' ? null : 'fog-shape-line')}
          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-shape-line'
              ? 'bg-yellow-600/30 text-yellow-400 border border-yellow-500/50'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
          }`}
          title="Line — click start, drag to end (Lightning Bolt, Wall of Fire)"
          aria-label="Fog line shape"
        >
          <Minus className="w-3.5 h-3.5" />
          Line
        </button>
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-shape-cube' ? null : 'fog-shape-cube')}
          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-shape-cube'
              ? 'bg-purple-600/30 text-purple-400 border border-purple-500/50'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
          }`}
          title="Cube — click origin, drag for size (Cube, Wall of Force)"
          aria-label="Fog cube shape"
        >
          <Square className="w-3.5 h-3.5" />
          Cube
        </button>
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-shape-sphere' ? null : 'fog-shape-sphere')}
          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-shape-sphere'
              ? 'bg-pink-600/30 text-pink-400 border border-pink-500/50'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
          }`}
          title="Sphere — click center, drag for radius (Sphere, Projected)"
          aria-label="Fog sphere shape"
        >
          <Circle className="w-3.5 h-3.5" style={{ strokeDasharray: '4 4' }} />
          Sphere
        </button>
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-shape-custom' ? null : 'fog-shape-custom')}
          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-shape-custom'
              ? 'bg-teal-600/30 text-teal-400 border border-teal-500/50'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
          }`}
          title="Custom — click to place polygon points, Enter to confirm (Freehand)"
          aria-label="Fog custom shape"
        >
          <Hexagon className="w-3.5 h-3.5" />
          Custom
        </button>
      </div>

      {/* How-to hint — only while a mode is armed */}
      {fogMode && (
        <p className="px-1 text-[11px] leading-snug text-stone-400">
          {(() => {
            switch (fogMode) {
              case 'fog-reveal':
              case 'fog-hide':
                return `Drag a box over the map. The selection snaps to whole squares — click a single square to ${fogMode === 'fog-reveal' ? 'reveal' : 'hide'} just that one.`;
              case 'fog-shape-cone':
                return 'Click to set cone origin, then drag for direction and length. Click again to confirm.';
              case 'fog-shape-radius':
              case 'fog-shape-sphere':
                return 'Click to set center, then drag for radius. Click again to confirm.';
              case 'fog-shape-line':
                return 'Click to set start point, then drag to end point. Click again to confirm.';
              case 'fog-shape-cube':
                return 'Click to set cube origin, then drag for size. Click again to confirm.';
              case 'fog-shape-custom':
                return 'Click to place polygon points. Press Enter or click first point to close and confirm.';
              default:
                return 'Drag a box over the map.';
            }
          })()}
          <span className="block mt-0.5 text-stone-500">Esc or right-drag cancels.</span>
        </p>
      )}

      {/* Bulk actions */}
      <div className="flex gap-1 pt-1 border-t border-stone-700/50">
        {/* Each Confirm? state takes dark text on its light fill, readable
            in every theme, and pulses a ring round it, never its label. */}
        <button
          onClick={handleRevealAll}
          className={`touch-target relative flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            confirmRevealAll
              ? 'bg-lime-500 text-stone-900'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-lime-700/30 hover:text-lime-400'
          }`}
          title={confirmRevealAll ? 'Click again to confirm: reveal entire map' : 'Reveal all — show entire map to players'}
          aria-label="Reveal entire map"
          onBlur={() => setConfirmRevealAll(false)}
        >
          {confirmRevealAll && <ConfirmPulse ring="ring-lime-300" />}
          {confirmRevealAll ? 'Confirm?' : 'Reveal all'}
        </button>
        <button
          onClick={handleHideAll}
          className={`touch-target relative flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            confirmHideAll
              ? 'bg-warning text-stone-900'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-warning/30 hover:text-warning-ink'
          }`}
          title={confirmHideAll ? 'Click again to confirm: hide entire map' : 'Hide all — cover entire map with fog'}
          aria-label="Hide entire map"
          onBlur={() => setConfirmHideAll(false)}
        >
          {confirmHideAll && <ConfirmPulse ring="ring-warning" />}
          {confirmHideAll ? 'Confirm?' : 'Hide all'}
        </button>
      </div>

      {/* Party Vision Merge */}
      {(currentMap?.lightingEnabled ?? false) && explorationEnabled && (
        <div className="pt-1 border-t border-stone-700/50">
          <label className="flex items-center gap-2 px-1 py-0.5 text-xs text-stone-300 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-blue-500"
              checked={fogShareExploredWithParty}
              onChange={(e) => onFogShareExploredWithPartyChange?.(e.target.checked)}
              aria-label="Share explored areas with party"
            />
            Share explored areas with party
          </label>
          <p className="px-1 mt-1 text-[10px] leading-snug text-stone-500">
            When enabled, all party members share their explored areas (union of explored cells).
            Excluded characters (familiars, scouts) keep their own separate memory.
          </p>
          {fogShareExploredWithParty && excludedCharacterIds.length > 0 && (
            <p className="px-1 mt-1 text-[10px] leading-snug text-stone-400">
              Excluded: {excludedCharacterIds.map(id => currentMap?.tokens?.find(t => t.characterId === id)?.name ?? id).join(', ')}
            </p>
          )}
        </div>
      )}
      </>)}

      {/* Explored memory is separate from fog: it is what players' own
          vision has uncovered on a lit map, and only the DM can forget it. */}
      {onResetExploration && (
        <div className="pt-1 border-t border-stone-700/50">
          <button
            onClick={handleResetExploration}
            className={`touch-target relative w-full px-2 py-1 rounded text-xs font-medium transition-colors ${
              confirmReset
                ? 'bg-warning text-stone-900'
                : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-warning/30 hover:text-warning-ink'
            }`}
            title={confirmReset ? 'Click again to confirm: forget what every player has seen' : 'Reset explored areas: players forget what they have seen of this map'}
            aria-label="Reset explored areas"
            onBlur={() => setConfirmReset(false)}
          >
            {confirmReset && <ConfirmPulse ring="ring-warning" />}
            {confirmReset ? 'Confirm?' : 'Reset explored areas'}
          </button>
          <p className="px-1 mt-1 text-[10px] leading-snug text-stone-500">
            Forgets what every player has seen of this map. Their view now is unchanged.
          </p>
        </div>
      )}

      {/* Fog Animation Settings */}
      {fogEnabled && (
        <div className="pt-1 border-t border-stone-700/50">
          <p className="px-1 text-xs font-medium text-stone-300 mb-1">Animation</p>
          <div className="flex items-center gap-2 px-1">
            <label className="flex items-center gap-1.5 text-xs text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-lime-500"
                checked={fogAnimationConfig?.respectReducedMotion ?? true}
                onChange={(e) => onFogAnimationConfigChange?.({ respectReducedMotion: e.target.checked })}
              />
              Respect reduced motion
            </label>
          </div>
          <div className="flex items-center gap-2 px-1">
            <label className="flex items-center gap-1.5 text-xs text-stone-300 cursor-pointer w-full">
              <span className="w-20">Duration</span>
              <input
                type="range"
                min="0"
                max="1000"
                step="50"
                value={fogAnimationConfig?.duration ?? 300}
                onChange={(e) => onFogAnimationConfigChange?.({ duration: parseInt(e.target.value, 10) })}
                className="flex-1 h-1.5 accent-lime-500"
              />
              <span className="w-16 text-right text-stone-400">
                {(fogAnimationConfig?.duration ?? 300)}ms
              </span>
            </label>
          </div>
          <p className="px-1 mt-1 text-[10px] leading-snug text-stone-500">
            Configure fog reveal/hide animation. Reduced motion disables animations for accessibility.
          </p>
        </div>
      )}
    </div>
    )}
    </div>
  );
}
