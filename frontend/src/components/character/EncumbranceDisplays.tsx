/**
 * Encumbrance Status Display Components
 * Used in character sheet header, roster, map token, and initiative tracker
 */

import { AlertTriangle, RotateCcw, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { Tooltip } from '../ui';

export interface EncumbranceStatus {
  currentWeight: number;
  maxWeight: number;
  pushDragLift: number;
  status: 'NORMAL' | 'ENCUMBERED' | 'HEAVILY_ENCUMBERED';
  speedPenalty: number;
  dexCheckDisadvantage: boolean;
  strDexCheckPenalty: number;
  statusLabel: string;
  statusColor: string;
  capacityPercent: number;
  remainingCapacity: number;
  system: string;
  bulk?: number;
  maxBulk?: number;
  checkPenalty?: number;
}

/**
 * Encumbrance Badge - Compact version for headers and roster
 */
interface EncumbranceBadgeProps {
  status: EncumbranceStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showProgress?: boolean;
  onClick?: () => void;
}

export function EncumbranceBadge({ 
  status, 
  size = 'md', 
  showLabel = true, 
  showProgress = false,
  onClick 
}: EncumbranceBadgeProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NORMAL': return 'bg-success/15 text-success-ink border-success/30';
      case 'ENCUMBERED': return 'bg-warning/15 text-warning-ink border-warning/30';
      case 'HEAVILY_ENCUMBERED': return 'bg-danger/15 text-danger-ink border-danger/30';
      default: return 'bg-surface-light text-ink-secondary border-edge';
    }
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return 'bg-danger';
    if (percent >= 75) return 'bg-warning';
    return 'bg-success';
  };

  const sizes = {
    sm: { badge: 'px-2 py-0.5 text-xs', progress: 'h-1', icon: 'w-3 h-3' },
    md: { badge: 'px-3 py-1 text-sm', progress: 'h-2', icon: 'w-4 h-4' },
    lg: { badge: 'px-4 py-2 text-base', progress: 'h-3', icon: 'w-5 h-5' },
  };

  const s = sizes[size];

  if (!status) return null;

  return (
    <div 
      className={`flex items-center gap-2 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={`flex items-center gap-1 px-2 py-1 rounded-full border ${getStatusColor(status.status)}`}>
        {status.status === 'HEAVILY_ENCUMBERED' && <AlertTriangle className={s.icon} />}
        {status.status === 'ENCUMBERED' && <Package className={s.icon} />}
        {status.status === 'NORMAL' && <Package className={s.icon} />}
        {showLabel && <span className="font-medium">{status.statusLabel}</span>}
      </div>

      {showProgress && (
        <div className="w-24" title={`${status.capacityPercent}% capacity`}>
          <div className="bg-surface-dark rounded-full overflow-hidden" style={{ height: s.progress }}>
            <div 
              className={`${getProgressColor(status.capacityPercent)} rounded-full transition-all duration-300`}
              style={{ width: `${Math.min(100, status.capacityPercent)}%` }}
            />
          </div>
        </div>
      )}

      {size === 'lg' && (
        <div className="ml-2 flex items-center gap-3 text-sm text-ink-muted">
          <span className="font-mono">
            {status.system === 'PATHFINDER_2E' 
              ? `${status.bulk?.toFixed(1) || 0} / ${status.maxBulk || 0} Bulk`
              : `${status.currentWeight.toFixed(1)} / ${status.maxWeight} lbs`}
          </span>
          {status.speedPenalty > 0 && (
            <Tooltip content={`Speed penalty: -${status.speedPenalty} ft`}>
              <span className="flex items-center gap-1 text-danger-ink">
                <RotateCcw className={s.icon} /> -{status.speedPenalty} ft
              </span>
            </Tooltip>
          )}
          {status.dexCheckDisadvantage && (
            <Tooltip content="Disadvantage on Dexterity checks">
              <AlertTriangle className={`${s.icon} text-danger-ink`} />
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Encumbrance Tooltip Content - Detailed breakdown for hover
 */
interface EncumbranceTooltipProps {
  status: EncumbranceStatus;
  weightBreakdown?: {
    equipped: number;
    carried: number;
    stowed: number;
    containers: { [key: string]: number };
    total: number;
  };
}

export function EncumbranceTooltip({ status, weightBreakdown }: EncumbranceTooltipProps) {
  if (!status) return null;

  const formatWeight = (w: number) => {
    if (status.system === 'PATHFINDER_2E') return `${w.toFixed(1)} Bulk`;
    return `${w.toFixed(1)} lbs`;
  };

  return (
    <div className="p-3 min-w-[280px] space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Encumbrance Status</h4>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          status.status === 'NORMAL' ? 'bg-success/15 text-success-ink' :
          status.status === 'ENCUMBERED' ? 'bg-warning/15 text-warning-ink' :
          'bg-danger/15 text-danger-ink'
        }`}>
          {status.statusLabel}
        </span>
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-xs text-ink-muted mb-1">
          <span>Capacity Used</span>
          <span>{status.capacityPercent}%</span>
        </div>
        <div className="bg-surface-dark rounded-full h-2 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-300 ${
              status.capacityPercent >= 100 ? 'bg-danger' :
              status.capacityPercent >= 75 ? 'bg-warning' : 'bg-success'
            }`}
            style={{ width: `${Math.min(100, status.capacityPercent)}%` }}
          />
        </div>
      </div>

      {/* Weight Details */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-ink-muted">Current</span>
          <div className="font-mono font-medium">{formatWeight(status.currentWeight)}</div>
        </div>
        <div>
          <span className="text-ink-muted">Maximum</span>
          <div className="font-mono font-medium">{formatWeight(status.maxWeight)}</div>
        </div>
        <div>
          <span className="text-ink-muted">Remaining</span>
          <div className="font-mono font-medium text-success-ink">{formatWeight(status.remainingCapacity)}</div>
        </div>
        <div>
          <span className="text-ink-muted">Push/Drag/Lift</span>
          <div className="font-mono font-medium">{formatWeight(status.pushDragLift)}</div>
        </div>
      </div>

      {/* Penalties */}
      {status.speedPenalty > 0 || status.dexCheckDisadvantage || (status.strDexCheckPenalty && status.strDexCheckPenalty < 0) && (
        <div className="border-t pt-3 space-y-2">
          <h5 className="font-medium text-ink-secondary">Penalties</h5>
          {status.speedPenalty > 0 && (
            <div className="flex items-center gap-2 text-danger-ink">
              <RotateCcw className="w-4 h-4" />
              <span>Speed reduced by {status.speedPenalty} ft</span>
            </div>
          )}
          {status.dexCheckDisadvantage && (
            <div className="flex items-center gap-2 text-danger-ink">
              <AlertTriangle className="w-4 h-4" />
              <span>Disadvantage on Dexterity checks</span>
            </div>
          )}
          {status.strDexCheckPenalty && status.strDexCheckPenalty < 0 && (
            <div className="flex items-center gap-2 text-danger-ink">
              <AlertTriangle className="w-4 h-4" />
              <span>Disadvantage on Strength/Dexterity checks</span>
            </div>
          )}
          {status.checkPenalty && status.checkPenalty < 0 && (
            <div className="flex items-center gap-2 text-danger-ink">
              <AlertTriangle className="w-4 h-4" />
              <span>Check penalty: {status.checkPenalty}</span>
            </div>
          )}
        </div>
      )}

      {/* Weight Breakdown */}
      {weightBreakdown && (
        <div className="border-t pt-3 space-y-1">
          <h5 className="font-medium text-ink-secondary">Weight Distribution</h5>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-ink-muted">Equipped</span>
              <span className="font-mono">{formatWeight(weightBreakdown.equipped)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Carried</span>
              <span className="font-mono">{formatWeight(weightBreakdown.carried)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Stowed</span>
              <span className="font-mono">{formatWeight(weightBreakdown.stowed)}</span>
            </div>
            {Object.keys(weightBreakdown.containers).length > 0 && (
              <>
                <div className="border-t my-1" />
                {Object.entries(weightBreakdown.containers).map(([id, weight]) => (
                  <div key={id} className="flex justify-between text-xs">
                    <span className="text-ink-muted">Container {id.slice(0, 8)}</span>
                    <span className="font-mono">{formatWeight(weight)}</span>
                  </div>
                ))}
              </>
            )}
            <div className="border-t pt-1 flex justify-between font-medium">
              <span>Total</span>
              <span className="font-mono">{formatWeight(weightBreakdown.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Encumbrance Status Panel - Expanded view for character sheet
 */
interface EncumbrancePanelProps {
  status: EncumbranceStatus;
  weightBreakdown?: {
    equipped: number;
    carried: number;
    stowed: number;
    containers: { [key: string]: number };
    total: number;
  };
  onToggleDetails?: () => void;
  showDetails?: boolean;
}

export function EncumbrancePanel({ status, weightBreakdown, onToggleDetails, showDetails = false }: EncumbrancePanelProps) {
  if (!status) return null;

  const formatWeight = (w: number) => {
    if (status.system === 'PATHFINDER_2E') return `${w.toFixed(1)} Bulk`;
    return `${w.toFixed(1)} lbs`;
  };

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* Summary Header */}
      <div className={`p-4 border-b flex items-center justify-between ${
        status.status === 'NORMAL' ? 'bg-success/10' :
        status.status === 'ENCUMBERED' ? 'bg-warning/10' : 'bg-danger/10'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${
            status.status === 'NORMAL' ? 'bg-success/15' :
            status.status === 'ENCUMBERED' ? 'bg-warning/15' : 'bg-danger/15'
          }`}>
            {status.status === 'HEAVILY_ENCUMBERED' && <AlertTriangle className="w-6 h-6 text-danger-ink" />}
            {status.status === 'ENCUMBERED' && <Package className="w-6 h-6 text-warning-ink" />}
            {status.status === 'NORMAL' && <Package className="w-6 h-6 text-success-ink" />}
          </div>
          <div>
            <h3 className="font-semibold">Encumbrance: {status.statusLabel}</h3>
            <p className="text-sm text-ink-muted">
              {formatWeight(status.currentWeight)} / {formatWeight(status.maxWeight)} 
              ({status.capacityPercent}% capacity)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-40">
            <div className="bg-surface-dark rounded-full h-2 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  status.capacityPercent >= 100 ? 'bg-danger' :
                  status.capacityPercent >= 75 ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${Math.min(100, status.capacityPercent)}%` }}
              />
            </div>
          </div>
          {onToggleDetails && (
            <button 
              onClick={onToggleDetails}
              className="text-sm text-brand-ink hover:text-brand-ink flex items-center gap-1"
            >
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showDetails ? 'Hide Details' : 'Show Details'}
            </button>
          )}
        </div>
      </div>

      {/* Quick Penalties */}
      {(status.speedPenalty > 0 || status.dexCheckDisadvantage) && (
        <div className="px-4 py-2 border-b bg-surface-light flex flex-wrap gap-4 text-sm">
          {status.speedPenalty > 0 && (
            <Tooltip content={`Speed penalty: -${status.speedPenalty} ft`}>
              <span className="flex items-center gap-1 text-danger-ink">
                <RotateCcw className="w-4 h-4" /> Speed -{status.speedPenalty} ft
              </span>
            </Tooltip>
          )}
          {status.dexCheckDisadvantage && (
            <Tooltip content="Disadvantage on Dexterity checks">
              <span className="flex items-center gap-1 text-danger-ink">
                <AlertTriangle className="w-4 h-4" /> Dex Disadvantage
              </span>
            </Tooltip>
          )}
          {status.strDexCheckPenalty && status.strDexCheckPenalty < 0 && (
            <Tooltip content="Disadvantage on Strength/Dexterity checks">
              <span className="flex items-center gap-1 text-danger-ink">
                <AlertTriangle className="w-4 h-4" /> Str/Dex Disadvantage
              </span>
            </Tooltip>
          )}
          {status.checkPenalty && status.checkPenalty < 0 && (
            <Tooltip content={`Check penalty: ${status.checkPenalty}`}>
              <span className="flex items-center gap-1 text-danger-ink">
                <AlertTriangle className="w-4 h-4" /> Check {status.checkPenalty}
              </span>
            </Tooltip>
          )}
        </div>
      )}

      {/* Detailed Breakdown */}
      {showDetails && weightBreakdown && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatBox label="Current Weight" value={formatWeight(status.currentWeight)} />
            <StatBox label="Max Weight" value={formatWeight(status.maxWeight)} />
            <StatBox label="Remaining" value={formatWeight(status.remainingCapacity)} color="text-success-ink" />
            <StatBox label="Push/Drag/Lift" value={formatWeight(status.pushDragLift)} />
          </div>

          {weightBreakdown && (
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Weight Distribution</h4>
              <div className="space-y-2">
                <WeightRow label="Equipped" weight={weightBreakdown.equipped} formatWeight={formatWeight} />
                <WeightRow label="Carried" weight={weightBreakdown.carried} formatWeight={formatWeight} />
                <WeightRow label="Stowed" weight={weightBreakdown.stowed} formatWeight={formatWeight} />
                {Object.keys(weightBreakdown.containers).length > 0 && (
                  <>
                    <div className="border-t my-2" />
                    {Object.entries(weightBreakdown.containers).map(([id, weight]) => (
                      <WeightRow key={id} label={`Container ${id.slice(0, 8)}`} weight={weight} formatWeight={formatWeight} indent={true} />
                    ))}
                  </>
                )}
                <WeightRow label="Total" weight={weightBreakdown.total} formatWeight={formatWeight} bold={true} />
              </div>
            </div>
          )}

          {/* System-specific info */}
          {status.system === 'PATHFINDER_2E' && status.bulk !== undefined && (
            <div className="border-t pt-4 bg-brand/10 rounded p-3">
              <h4 className="font-medium text-brand-ink mb-2">Pathfinder 2e Bulk</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-ink-muted block">Current Bulk</span>
                  <span className="font-mono font-medium">{status.bulk.toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-ink-muted block">Max Bulk</span>
                  <span className="font-mono font-medium">{status.maxBulk}</span>
                </div>
                <div>
                  <span className="text-ink-muted block">Check Penalty</span>
                  <span className="font-mono font-medium">{status.checkPenalty || 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-3 bg-surface-light rounded text-center">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`font-mono font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function WeightRow({ label, weight, formatWeight, indent = false, bold = false }: { 
  label: string; 
  weight: number; 
  formatWeight: (w: number) => string;
  indent?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between ${indent ? 'pl-4' : ''} ${bold ? 'font-medium border-t pt-2' : ''}`}>
      <span className={bold ? 'text-ink-secondary' : 'text-ink-muted'}>{label}</span>
      <span className={`font-mono ${bold ? 'text-ink' : ''}`}>{formatWeight(weight)}</span>
    </div>
  );
}

/**
 * Map Token Encumbrance Indicator - Small indicator on token
 */
interface TokenEncumbranceIndicatorProps {
  status: EncumbranceStatus;
  size?: number;
}

export function TokenEncumbranceIndicator({ status, size = 16 }: TokenEncumbranceIndicatorProps) {
  if (!status || status.status === 'NORMAL') return null;

  const colors = {
    ENCUMBERED: '#eab308',
    HEAVILY_ENCUMBERED: '#ef4444',
  };

  return (
    <div 
      className="absolute -top-2 -right-2 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div 
        style={{ 
          width: size * 0.75, 
          height: size * 0.75, 
          borderRadius: '50%',
          backgroundColor: colors[status.status],
          border: `2px solid white`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
        title={`${status.statusLabel}: ${status.currentWeight.toFixed(1)}/${status.maxWeight} lbs`}
      />
      {status.status === 'HEAVILY_ENCUMBERED' && (
        <div className="absolute -bottom-1 -left-1 text-white text-[8px] font-bold" style={{ 
          width: size * 0.5, 
          height: size * 0.5,
          borderRadius: '50%',
          backgroundColor: '#dc2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          ‼
        </div>
      )}
    </div>
  );
}

/**
 * Initiative Tracker Encumbrance Column
 */
interface InitiativeEncumbranceProps {
  status: EncumbranceStatus;
  compact?: boolean;
}

export function InitiativeEncumbrance({ status, compact = false }: InitiativeEncumbranceProps) {
  if (!status) return <span className="text-ink-muted">—</span>;

  const formatWeight = (w: number) => {
    if (status.system === 'PATHFINDER_2E') return `${w.toFixed(1)} B`;
    return `${w.toFixed(0)}#`;
  };

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
        status.status === 'NORMAL' ? 'bg-success/15 text-success-ink' :
        status.status === 'ENCUMBERED' ? 'bg-warning/15 text-warning-ink' : 'bg-danger/15 text-danger-ink'
      }`}>
        {status.speedPenalty > 0 && <RotateCcw className="w-3 h-3" />}
        {formatWeight(status.currentWeight)}
      </span>
    );
  }

  return (
    <div className="text-right">
      <div className="font-mono text-sm">{formatWeight(status.currentWeight)} / {formatWeight(status.maxWeight)}</div>
      <div className={`text-xs font-medium px-1.5 py-0.5 rounded ${
        status.status === 'NORMAL' ? 'bg-success/15 text-success-ink' :
        status.status === 'ENCUMBERED' ? 'bg-warning/15 text-warning-ink' : 'bg-danger/15 text-danger-ink'
      }`}>
        {status.statusLabel}
      </div>
      {status.speedPenalty > 0 && (
        <div className="text-xs text-danger-ink mt-1 flex items-center justify-end gap-1">
          <RotateCcw className="w-3 h-3" /> -{status.speedPenalty} ft
        </div>
      )}
    </div>
  );
}

export default {
  EncumbranceBadge,
  EncumbranceTooltip,
  EncumbrancePanel,
  TokenEncumbranceIndicator,
  InitiativeEncumbrance,
};
