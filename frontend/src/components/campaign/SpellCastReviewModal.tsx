import React, { useState } from 'react';
import type { TargetSpellEvaluation } from '../../types';

export interface SpellCastReviewModalProps {
  isOpen: boolean;
  spellName: string;
  casterName?: string;
  targets: TargetSpellEvaluation[];
  baseDamage?: number;
  onApply: (modifiedTargets: TargetSpellEvaluation[]) => void;
  onCancel: () => void;
}

export const SpellCastReviewModal: React.FC<SpellCastReviewModalProps> = ({
  isOpen,
  spellName,
  casterName,
  targets: initialTargets,
  baseDamage = 0,
  onApply,
  onCancel,
}) => {
  const [targets, setTargets] = useState<TargetSpellEvaluation[]>(initialTargets);

  if (!isOpen) return null;

  const handleToggleSave = (tokenId: string) => {
    setTargets((prev) =>
      prev.map((t) => {
        if (t.tokenId !== tokenId) return t;
        const newSavePassed = !t.savePassed;
        const newDamage = newSavePassed ? Math.floor(baseDamage / 2) : baseDamage;
        return {
          ...t,
          savePassed: newSavePassed,
          calculatedDamage: newDamage,
        };
      })
    );
  };

  const handleDamageChange = (tokenId: string, newDamage: number) => {
    setTargets((prev) =>
      prev.map((t) =>
        t.tokenId === tokenId
          ? { ...t, calculatedDamage: Math.max(0, newDamage) }
          : t
      )
    );
  };

  const handleToggleExclude = (tokenId: string) => {
    setTargets((prev) =>
      prev.map((t) =>
        t.tokenId === tokenId ? { ...t, isAffected: !t.isAffected } : t
      )
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      data-testid="spell-cast-review-modal"
    >
      <div className="bg-surface border border-edge rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden text-ink flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-edge flex items-center justify-between bg-surface-light/40">
          <div>
            <h2 className="text-lg font-bold">DM Review: {spellName}</h2>
            {casterName && (
              <p className="text-xs text-ink-muted">Caster: {casterName}</p>
            )}
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand/10 text-brand-ink font-medium">
            DM Oversight
          </span>
        </div>

        {/* Modal Body / Targets List */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="text-xs text-ink-muted">
            Review affected targets, saving throw outcomes, and damage before applying to the map.
          </div>

          <div className="space-y-2">
            {targets.map((t) => (
              <div
                key={t.tokenId}
                className={`p-3 rounded-xl border transition-all ${
                  t.isAffected
                    ? 'border-edge bg-surface-light/60'
                    : 'border-edge/40 bg-surface/40 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={t.isAffected}
                      onChange={() => handleToggleExclude(t.tokenId)}
                      className="rounded border-edge text-brand-ink focus:ring-brand"
                    />
                    <span className="font-semibold text-sm">{t.tokenName}</span>
                  </div>
                  <span className="text-[11px] text-ink-muted">
                    {Math.round(t.coverageRatio * 100)}% coverage
                  </span>
                </div>

                {t.isAffected && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-edge/60 text-xs">
                    {/* Save outcome toggle */}
                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Save:</span>
                      <button
                        onClick={() => handleToggleSave(t.tokenId)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                          t.savePassed
                            ? 'bg-success/10 text-success-ink border-success/30'
                            : 'bg-danger/10 text-danger-ink border-danger/30'
                        }`}
                      >
                        {t.savePassed ? 'Success (Half)' : 'Failed (Full)'}
                      </button>
                    </div>

                    {/* Damage input */}
                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Damage:</span>
                      <input
                        type="number"
                        min="0"
                        value={t.calculatedDamage}
                        onChange={(e) =>
                          handleDamageChange(t.tokenId, parseInt(e.target.value) || 0)
                        }
                        className="w-16 bg-surface border border-edge rounded px-2 py-0.5 text-right text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-edge flex items-center justify-end gap-3 bg-surface-light/40">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-edge hover:bg-surface-light text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(targets.filter((t) => t.isAffected))}
            className="px-5 py-2 rounded-xl bg-brand text-brand-ink hover:bg-brand/90 text-xs font-semibold shadow-md transition-colors"
          >
            Apply Spell Effects
          </button>
        </div>
      </div>
    </div>
  );
};
