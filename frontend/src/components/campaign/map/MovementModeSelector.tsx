// ============================================
// Movement Mode Selector (Phase 6)
// UI for selecting movement mode (Walk, Fly, Swim, Climb, Burrow, Teleport)
// ============================================

import { useEffect, useRef } from 'react';
import { 
  Footprints, 
  Feather, 
  Waves, 
  Mountain, 
  Circle, 
  Zap,
  X,
  ChevronDown,
  Check,
} from 'lucide-react';
import type { MovementMode, Token } from '@/types';
import { cn } from '@/utils/cn';

interface MovementModeSelectorProps {
  token: Token;
  currentMode: MovementMode;
  onModeChange: (mode: MovementMode) => void;
  onClose: () => void;
  isDM: boolean;
  position?: { x: number; y: number }; // Screen position for dropdown
}

const MODE_INFO: Record<MovementMode, { 
  label: string; 
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  getSpeed: (token: Token) => number | undefined;
}> = {
  walk: {
    label: 'Walk',
    icon: Footprints,
    description: 'Standard ground movement',
    getSpeed: (t) => t.movement?.speed,
  },
  fly: {
    label: 'Fly',
    icon: Feather,
    description: 'Aerial movement (ignores ground difficult terrain)',
    getSpeed: (t) => t.movement?.flySpeed ?? t.movement?.speed,
  },
  swim: {
    label: 'Swim',
    icon: Waves,
    description: 'Water movement (half speed unless swim speed)',
    getSpeed: (t) => t.movement?.swimSpeed ?? Math.floor((t.movement?.speed ?? 0) / 2),
  },
  climb: {
    label: 'Climb',
    icon: Mountain,
    description: 'Vertical movement (half speed unless climb speed)',
    getSpeed: (t) => t.movement?.climbSpeed ?? Math.floor((t.movement?.speed ?? 0) / 2),
  },
  burrow: {
    label: 'Burrow',
    icon: Circle,
    description: 'Underground movement (half speed unless burrow speed)',
    getSpeed: (t) => t.movement?.burrowSpeed ?? Math.floor((t.movement?.speed ?? 0) / 2),
  },
  teleport: {
    label: 'Teleport',
    icon: Zap,
    description: 'Instant movement (ignores terrain, AoO)',
    getSpeed: (t) => t.movement?.speed,
  },
};

export function MovementModeSelector({
  token,
  currentMode,
  onModeChange,
  onClose,
  isDM,
  position,
}: MovementModeSelectorProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
          onClose();
        }
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  
  // Auto-close after selection
  const handleModeSelect = (mode: MovementMode) => {
    onModeChange(mode);
    onClose();
  };
  
  const movement = token.movement;
  const baseSpeed = movement?.speed ?? 30;
  const remaining = movement?.remainingThisTurn ?? baseSpeed;
  const used = movement?.usedThisTurn ?? 0;
  
  return (
    <div 
      ref={dropdownRef}
      className="fixed z-50 pointer-events-none"
      style={{
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="pointer-events-auto">
        {/* Dropdown panel */}
        <div className="bg-surface border border-border/50 rounded-lg shadow-xl p-2 min-w-[180px] animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-2 py-1.5 mb-1">
            <span className="text-sm font-medium text-ink">Movement Mode</span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-surface-light transition-colors text-ink-muted hover:text-ink"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Current mode display */}
          <div className="px-2 py-2 mb-2 bg-brand/10 rounded border border-brand/20">
            <div className="flex items-center gap-2">
              {(() => {
                const CurrentModeIcon = MODE_INFO[currentMode].icon;
                return <CurrentModeIcon className="w-5 h-5 text-brand-ink" />;
              })()}
              <div>
                <p className="text-sm font-medium text-brand-ink">{MODE_INFO[currentMode].label}</p>
                <p className="text-xs text-brand-ink/80">
                  {remaining}ft remaining
                </p>
              </div>
            </div>
          </div>
          
          {/* Available speeds */}
          {isDM && movement && (
            <div className="px-2 py-2 mb-2 text-xs text-ink-muted border-t border-border/30">
              <p className="font-medium mb-1">Available Speeds:</p>
              <div className="space-y-0.5">
                {Object.entries(MODE_INFO).map(([modeKey, info]) => {
                  const speed = info.getSpeed(token);
                  if (speed === undefined) return null;
                  return (
                    <div 
                      key={modeKey}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
                        currentMode === modeKey 
                          ? 'bg-brand/10 text-brand-ink' 
                          : 'text-ink-secondary hover:bg-surface-light'
                      )}
                      onClick={() => handleModeSelect(modeKey as MovementMode)}
                    >
                      <info.icon className={cn('w-4 h-4', currentMode === modeKey ? 'text-brand-ink' : 'text-ink-muted')} />
                      <span className="flex-1 truncate">{info.label}</span>
                      <span className="font-mono text-ink-muted">
                        {speed}ft
                      </span>
                      {currentMode === modeKey && <Check className="w-4 h-4 text-brand-ink" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Mode descriptions */}
          <div className="px-2 pb-2">
            <p className="text-xs text-ink-muted mb-2">Hover for details</p>
            <div className="space-y-1">
              {Object.entries(MODE_INFO).map(([modeKey, info]) => (
                <button
                  key={modeKey}
                  onClick={() => handleModeSelect(modeKey as MovementMode)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded text-xs transition-colors',
                    currentMode === modeKey
                      ? 'bg-brand/10 text-brand-ink'
                      : 'text-ink-secondary hover:bg-surface-light'
                  )}
                  title={info.description}
                >
                  <div className="flex items-center gap-2">
                    <info.icon className={cn('w-4 h-4', currentMode === modeKey ? 'text-brand-ink' : 'text-ink-muted')} />
                    <span className="font-medium">{info.label}</span>
                    <span className="ml-auto font-mono text-ink-muted">
                      {info.getSpeed(token) ?? '—'}ft
                    </span>
                    {currentMode === modeKey && <Check className="w-4 h-4 text-brand-ink" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
          
          {/* Movement stats */}
          {movement && (
            <div className="px-2 pt-2 border-t border-border/30">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-1.5 bg-surface-light rounded">
                  <p className="font-mono text-brand-ink">{baseSpeed}</p>
                  <p className="text-ink-muted">Base Speed</p>
                </div>
                <div className="text-center p-1.5 bg-surface-light rounded">
                  <p className="font-mono text-success-ink">{remaining}</p>
                  <p className="text-ink-muted">Remaining</p>
                </div>
                <div className="text-center p-1.5 bg-surface-light rounded">
                  <p className="font-mono text-warning-ink">{used}</p>
                  <p className="text-ink-muted">Used</p>
                </div>
              </div>
              
              {movement.difficultTerrainMultiplier > 1 && (
                <p className="text-xs text-warning-ink mt-2 text-center">
                  ⚠ Difficult terrain: ×{movement.difficultTerrainMultiplier} cost
                </p>
              )}
            </div>
          )}
        </div>
        
        {/* Arrow pointer */}
        <div className="w-0 h-0 border-l-4 border-r-4 border-t-0 border-b-4 border-surface border-l-transparent border-r-transparent mb-1 ml-[calc(50%-4px)]" />
      </div>
    </div>
  );
}

// Tooltip version for hover
interface MovementModeTooltipProps {
  token: Token;
  currentMode: MovementMode;
}

export function MovementModeTooltip({ token, currentMode }: MovementModeTooltipProps) {
  const movement = token.movement;
  if (!movement) return null;
  
  const baseSpeed = movement.speed ?? 30;
  const remaining = movement.remainingThisTurn ?? baseSpeed;
  const modeInfo = MODE_INFO[currentMode];
  const currentSpeed = modeInfo.getSpeed(token) ?? baseSpeed;
  
  return (
    <div className="bg-surface border border-border/50 rounded-lg shadow-xl p-3 min-w-[200px] animate-in fade-in-0 zoom-in-95 duration-100">
      <div className="flex items-center gap-2 mb-2">
        <modeInfo.icon className="w-5 h-5 text-brand-ink" />
        <div>
          <p className="text-sm font-medium text-ink">{modeInfo.label} Mode</p>
          <p className="text-xs text-ink-muted">{modeInfo.description}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="bg-surface-light rounded p-2 text-center">
          <p className="font-mono text-lg text-brand-ink">{currentSpeed}</p>
          <p className="text-xs text-ink-muted">Speed</p>
        </div>
        <div className="bg-surface-light rounded p-2 text-center">
          <p className="font-mono text-lg text-success-ink">{remaining}</p>
          <p className="text-xs text-ink-muted">Remaining</p>
        </div>
      </div>
      
      <div className="border-t border-border/30 pt-2">
        <p className="text-xs text-ink-muted mb-1">Available Modes:</p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(MODE_INFO).map(([modeKey, info]) => {
            const speed = info.getSpeed(token);
            if (speed === undefined) return null;
            return (
              <span
                key={modeKey}
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-mono border',
                  currentMode === modeKey
                    ? 'bg-brand/10 text-brand-ink border-brand/30'
                    : 'text-ink-secondary border-border/30 hover:bg-surface-light'
                )}
              >
                {info.label} {speed}ft
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Inline button for token HUD
interface MovementModeButtonProps {
  token: Token;
  currentMode: MovementMode;
  onClick: () => void;
  className?: string;
}

export function MovementModeButton({ token, currentMode, onClick, className }: MovementModeButtonProps) {
  const modeInfo = MODE_INFO[currentMode];
  const speed = modeInfo.getSpeed(token) ?? token.movement?.speed ?? 30;
  const remaining = token.movement?.remainingThisTurn ?? speed;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded border border-border/50 bg-surface/80 backdrop-blur-sm',
        'text-ink-secondary hover:text-ink hover:border-brand/50 transition-colors',
        'text-xs font-medium',
        className
      )}
      title={`Movement Mode: ${modeInfo.label} (${remaining}ft remaining)`}
    >
      <modeInfo.icon className="w-4 h-4 text-brand-ink" />
      <span className="hidden sm:inline">{modeInfo.label}</span>
      <span className="font-mono text-brand-ink">{remaining}ft</span>
      <ChevronDown className="w-3 h-3 text-ink-muted" />
    </button>
  );
}
