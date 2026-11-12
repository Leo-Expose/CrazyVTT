import React, { useState } from 'react';
import { Zap, Dice5, Shield, Sword, X } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';

export interface MobileActionFabProps {
  onOpenDice: () => void;
  onOpenInitiative: () => void;
  onOpenCombatAction?: () => void;
}

export const MobileActionFab: React.FC<MobileActionFabProps> = ({
  onOpenDice,
  onOpenInitiative,
  onOpenCombatAction,
}) => {
  const [open, setOpen] = useState(false);
  const targetTokenId = useGameStore((s) => s.targetTokenId);
  const allTokens = useGameStore((s) => s.tokens);
  const targetToken = targetTokenId ? allTokens[targetTokenId] : null;

  return (
    <div className="fixed bottom-16 right-4 z-40 pointer-events-none select-none">
      {/* Expanded quick actions drawer */}
      {open && (
        <div className="mb-2 flex flex-col items-end gap-2 pointer-events-auto animate-scale-in">
          {targetToken && (
            <div className="px-3 py-1.5 rounded-xl bg-surface/95 border border-edge shadow-lg text-[11px] text-ink font-medium max-w-[180px] truncate">
              Target: <strong>{targetToken.name}</strong>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenCombatAction?.();
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand text-white shadow-xl hover:bg-brand-hover text-xs font-semibold transition-all active:scale-95"
          >
            <Sword className="w-4 h-4" />
            Attack / Cast Action
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenDice();
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-elevated text-ink border border-edge shadow-xl hover:bg-surface-light text-xs font-semibold transition-all active:scale-95"
          >
            <Dice5 className="w-4 h-4 text-brand" />
            Roll D20 / Check
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenInitiative();
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-elevated text-ink border border-edge shadow-xl hover:bg-surface-light text-xs font-semibold transition-all active:scale-95"
          >
            <Shield className="w-4 h-4 text-accent-ink" />
            Initiative Turn
          </button>
        </div>
      )}

      {/* Main floating action toggle button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close quick action menu' : 'Open mobile action drawer'}
        className="w-12 h-12 rounded-full bg-brand text-white shadow-2xl flex items-center justify-center hover:bg-brand-hover active:scale-95 transition-all pointer-events-auto border-2 border-white/20"
      >
        {open ? <X className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
      </button>
    </div>
  );
};
