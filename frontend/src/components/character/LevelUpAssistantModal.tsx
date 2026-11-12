import React, { useState } from 'react';
import { ArrowUpCircle, Dice5, ShieldCheck, X } from 'lucide-react';
import Button from '@/components/ui/Button';

export interface LevelUpAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  fromLevel: number;
  toLevel: number;
  hitDie: string; // e.g. "d10", "d8", "d6", "d12"
  constitutionModifier: number;
  currentMaxHP: number;
  onApplyLevelUp: (options: { hpGain: number; method: 'roll' | 'average'; rolledValue?: number }) => void;
}

export const LevelUpAssistantModal: React.FC<LevelUpAssistantModalProps> = ({
  isOpen,
  onClose,
  className,
  fromLevel,
  toLevel,
  hitDie,
  constitutionModifier,
  currentMaxHP,
  onApplyLevelUp,
}) => {
  if (!isOpen) return null;

  const dieSides = parseInt(hitDie.replace('d', ''), 10) || 8;
  const standardAverage = Math.floor(dieSides / 2) + 1; // e.g. d10 -> 6, d8 -> 5, d6 -> 4, d12 -> 7
  const fixedGain = Math.max(1, standardAverage + constitutionModifier);

  const [rolledValue, setRolledValue] = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'average' | 'roll'>('average');

  const handleRoll = () => {
    const roll = Math.floor(Math.random() * dieSides) + 1;
    setRolledValue(roll);
    setSelectedMethod('roll');
  };

  const rollGain = rolledValue !== null ? Math.max(1, rolledValue + constitutionModifier) : fixedGain;
  const chosenGain = selectedMethod === 'roll' ? rollGain : fixedGain;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-surface text-ink border border-edge rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-scale-in">
        <div className="flex items-center justify-between border-b border-edge pb-3">
          <div className="flex items-center gap-2.5">
            <ArrowUpCircle className="w-6 h-6 text-brand" />
            <div>
              <h3 className="font-bold text-base">Level Up to Level {toLevel}</h3>
              <p className="text-xs text-ink-muted">{className} &middot; Hit Die: {hitDie}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-light"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-ink-muted leading-relaxed">
            Choose how you want to increase your Hit Points for Level {toLevel}. Constitution modifier: <strong>{constitutionModifier >= 0 ? `+${constitutionModifier}` : constitutionModifier}</strong>.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Standard Fixed Average Option */}
            <button
              type="button"
              onClick={() => setSelectedMethod('average')}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                selectedMethod === 'average'
                  ? 'border-brand bg-brand/10 ring-1 ring-brand'
                  : 'border-edge bg-surface-light hover:border-edge-strong'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-brand" /> Fixed Average
                </span>
                <span className="text-xs font-mono font-bold text-brand">+{fixedGain} HP</span>
              </div>
              <p className="text-[11px] text-ink-muted">
                {standardAverage} (half of {hitDie}) + {constitutionModifier} Con
              </p>
            </button>

            {/* Roll Hit Die Option */}
            <div
              className={`p-3.5 rounded-xl border transition-all ${
                selectedMethod === 'roll'
                  ? 'border-brand bg-brand/10 ring-1 ring-brand'
                  : 'border-edge bg-surface-light'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs flex items-center gap-1.5">
                  <Dice5 className="w-4 h-4 text-brand" /> Roll Hit Die
                </span>
                {rolledValue !== null && (
                  <span className="text-xs font-mono font-bold text-brand">+{rollGain} HP</span>
                )}
              </div>
              {rolledValue === null ? (
                <button
                  type="button"
                  onClick={handleRoll}
                  className="w-full mt-1 py-1 px-2 text-xs bg-brand text-white rounded font-medium hover:bg-brand-hover transition-colors"
                >
                  Roll 1{hitDie}
                </button>
              ) : (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-ink-muted">
                    Rolled {rolledValue} + {constitutionModifier} Con
                  </span>
                  <button
                    type="button"
                    onClick={handleRoll}
                    className="text-[10px] text-brand hover:underline font-medium"
                  >
                    Reroll
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-brand/5 border border-brand/20 rounded-xl text-xs space-y-1">
            <div className="flex items-center justify-between font-semibold">
              <span>New Maximum HP:</span>
              <span className="text-sm font-mono text-brand">{currentMaxHP + chosenGain} HP</span>
            </div>
            <p className="text-[11px] text-ink-muted">
              Auto-advances {toLevel}{hitDie} hit dice pool, updates spell slot progression, and unlocks level {toLevel} class features.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-edge">
          <Button variant="secondary" onClick={onClose} className="text-xs py-1.5 px-3">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApplyLevelUp({
                hpGain: chosenGain,
                method: selectedMethod,
                rolledValue: rolledValue ?? undefined,
              });
              onClose();
            }}
            className="text-xs py-1.5 px-3.5"
          >
            Confirm &amp; Level Up
          </Button>
        </div>
      </div>
    </div>
  );
};
