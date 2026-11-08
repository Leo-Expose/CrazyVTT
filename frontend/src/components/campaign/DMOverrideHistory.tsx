import React, { useState } from 'react';
import type { DMOverride } from '../../types';

export interface DMOverrideHistoryProps {
  isOpen: boolean;
  overrides: DMOverride[];
  onRevert: (overrideId: string, revertReason: string) => void;
  onClose: () => void;
}

export const DMOverrideHistory: React.FC<DMOverrideHistoryProps> = ({
  isOpen,
  overrides,
  onRevert,
  onClose,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [revertReason, setRevertReason] = useState<string>('');

  if (!isOpen) return null;

  const filtered = overrides.filter((o) =>
    filterType === 'ALL' ? true : o.targetType === filterType
  );

  const handleConfirmRevert = (id: string) => {
    if (!revertReason.trim()) return;
    onRevert(id, revertReason.trim());
    setRevertingId(null);
    setRevertReason('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      data-testid="dm-override-history"
    >
      <div className="bg-surface border border-edge rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden text-ink flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-edge flex items-center justify-between bg-surface-light/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">📜</span>
            <h2 className="text-lg font-bold">DM Override Audit Trail</h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-ink-muted hover:text-ink px-2 py-1 rounded hover:bg-surface-light"
          >
            ✕
          </button>
        </div>

        {/* Filter bar */}
        <div className="px-6 py-2.5 border-b border-edge/60 bg-surface flex items-center justify-between text-xs">
          <span className="text-ink-muted">Filter Category:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-surface-light border border-edge rounded px-2 py-1 text-xs text-ink"
          >
            <option value="ALL">All Categories</option>
            <option value="HP">Health (HP)</option>
            <option value="ROLL">Rolls</option>
            <option value="MOVEMENT">Movement</option>
            <option value="INITIATIVE">Initiative</option>
            <option value="ACTION_RESOLUTION">Action Resolutions</option>
          </select>
        </div>

        {/* List of overrides */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-ink-muted py-8">
              No DM overrides recorded in this campaign.
            </p>
          ) : (
            filtered.map((o) => (
              <div
                key={o.id}
                className={`p-3 rounded-xl border text-xs space-y-2 ${
                  o.revertedAt
                    ? 'border-edge/40 bg-surface/30 opacity-60 line-through-text'
                    : 'border-edge bg-surface-light/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-brand-ink uppercase tracking-wider text-[10px]">
                      {o.targetType}
                    </span>
                    <span className="font-mono text-ink-muted">{o.fieldPath}</span>
                  </div>
                  <span className="text-[11px] text-ink-muted">
                    {new Date(o.overriddenAt).toLocaleTimeString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-surface/80 p-2 rounded font-mono text-[11px]">
                  <div>
                    <span className="text-ink-muted block text-[10px] font-sans">Previous:</span>
                    <span className="truncate block">{JSON.stringify(o.previousValue)}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-[10px] font-sans">Overridden to:</span>
                    <span className="truncate block text-brand-ink font-semibold">
                      {JSON.stringify(o.newValue)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="text-[11px] text-ink-muted italic">
                    Reason: &quot;{o.reason}&quot;
                  </div>

                  {!o.revertedAt && revertingId !== o.id && (
                    <button
                      onClick={() => setRevertingId(o.id)}
                      className="text-[11px] px-2 py-0.5 rounded border border-edge hover:bg-surface-light text-ink transition-colors"
                    >
                      Revert
                    </button>
                  )}
                </div>

                {/* Inline Revert Reason Input */}
                {revertingId === o.id && (
                  <div className="pt-2 border-t border-edge flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Reason for reverting..."
                      value={revertReason}
                      onChange={(e) => setRevertReason(e.target.value)}
                      className="flex-1 bg-surface border border-edge rounded px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => handleConfirmRevert(o.id)}
                      className="px-2.5 py-1 bg-brand text-brand-ink rounded text-xs font-semibold"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setRevertingId(null)}
                      className="px-2 py-1 border border-edge rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {o.revertedAt && (
                  <div className="text-[10px] text-ink-muted">
                    Reverted at {new Date(o.revertedAt).toLocaleTimeString()} (
                    {o.revertReason || 'No reason'})
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-edge flex justify-end bg-surface-light/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-edge hover:bg-surface-light text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
