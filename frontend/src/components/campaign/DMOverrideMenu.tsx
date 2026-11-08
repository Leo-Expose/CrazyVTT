import React, { useState } from 'react';
import { OverrideTargetType, OverrideVisibility } from '../../types';

export interface DMOverrideMenuProps {
  isOpen: boolean;
  targetType: OverrideTargetType;
  targetId: string;
  targetName: string;
  fieldPath: string;
  currentValue: unknown;
  position?: { x: number; y: number };
  onApplyOverride: (data: {
    targetType: OverrideTargetType;
    targetId: string;
    fieldPath: string;
    previousValue: unknown;
    newValue: unknown;
    reason: string;
    visibility: OverrideVisibility;
  }) => void;
  onClose: () => void;
}

export const DMOverrideMenu: React.FC<DMOverrideMenuProps> = ({
  isOpen,
  targetType,
  targetId,
  targetName,
  fieldPath,
  currentValue,
  position,
  onApplyOverride,
  onClose,
}) => {
  const [newValueStr, setNewValueStr] = useState<string>(
    typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue ?? '')
  );
  const [reason, setReason] = useState<string>('');
  const [visibility, setVisibility] = useState<OverrideVisibility>(OverrideVisibility.DM_ONLY);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A reason is required to issue a DM override.');
      return;
    }

    let parsedNewValue: unknown = newValueStr;
    try {
      if (typeof currentValue === 'number') {
        parsedNewValue = Number(newValueStr);
      } else if (typeof currentValue === 'boolean') {
        parsedNewValue = newValueStr === 'true';
      } else if (typeof currentValue === 'object') {
        parsedNewValue = JSON.parse(newValueStr);
      }
    } catch {
      // Keep as string fallback
    }

    onApplyOverride({
      targetType,
      targetId,
      fieldPath,
      previousValue: currentValue,
      newValue: parsedNewValue,
      reason: reason.trim(),
      visibility,
    });
    onClose();
  };

  const style: React.CSSProperties = position
    ? {
        position: 'fixed',
        left: Math.min(position.x, window.innerWidth - 320),
        top: Math.min(position.y, window.innerHeight - 380),
      }
    : {};

  return (
    <div
      className={position ? 'z-50' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'}
      data-testid="dm-override-menu"
      style={style}
    >
      <div className="bg-surface border border-edge rounded-xl shadow-2xl p-4 w-80 text-ink text-sm">
        <div className="flex items-center justify-between border-b border-edge pb-2 mb-3">
          <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-brand-ink">
            <span>⚡</span>
            <span>DM Override</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close DM override menu"
            className="text-xs text-ink-muted hover:text-ink px-1 rounded hover:bg-surface-light"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="bg-surface-light/60 p-2 rounded text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-ink-muted">Target:</span>
              <span className="font-semibold truncate max-w-[160px]">{targetName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Category:</span>
              <span className="capitalize">{targetType.toLowerCase().replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Current:</span>
              <span className="font-mono text-[11px] truncate max-w-[160px]">
                {String(currentValue)}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="override-value-input" className="block text-xs font-medium text-ink-muted mb-1">
              Override Value
            </label>
            <input
              id="override-value-input"
              type="text"
              value={newValueStr}
              onChange={(e) => setNewValueStr(e.target.value)}
              className="w-full bg-surface-light border border-edge rounded-lg px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand"
              required
            />
          </div>

          <div>
            <label htmlFor="override-reason-input" className="block text-xs font-medium text-ink-muted mb-1">
              Reason (Required for Audit)
            </label>
            <textarea
              id="override-reason-input"
              rows={2}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. DM fiat, rule of cool, table agreement"
              className="w-full bg-surface-light border border-edge rounded-lg px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand resize-none"
              required
            />
            {error && <p className="text-[11px] text-danger-ink mt-0.5">{error}</p>}
          </div>

          <div>
            <label htmlFor="override-visibility-select" className="block text-xs font-medium text-ink-muted mb-1">
              Visibility
            </label>
            <select
              id="override-visibility-select"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as OverrideVisibility)}
              className="w-full bg-surface-light border border-edge rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value={OverrideVisibility.DM_ONLY}>DM Only (Secret)</option>
              <option value={OverrideVisibility.DM_AND_PLAYERS}>DM & Players</option>
              <option value={OverrideVisibility.TABLE}>Whole Table (Public)</option>
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-1.5 px-3 rounded-lg border border-edge hover:bg-surface-light text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-1.5 px-3 rounded-lg bg-brand text-brand-ink hover:bg-brand/90 text-xs font-semibold shadow-sm transition-colors"
            >
              Apply
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
