import React, { useEffect } from 'react';
import { Sword, Sparkles, Target, Zap } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';

export interface HotbarSlot {
  key: string;
  name: string;
  type: 'attack' | 'spell' | 'action';
  formula?: string;
  bonus?: number;
  damageDice?: string;
}

export interface QuickMacroHotbarProps {
  characterId?: string;
  compact?: boolean;
}

export const QuickMacroHotbar: React.FC<QuickMacroHotbarProps> = ({
  characterId,
  compact = false,
}) => {
  const { socket } = useWebSocket();
  const { showToast } = useToast();
  const targetTokenId = useGameStore((s) => s.targetTokenId);
  const allTokens = useGameStore((s) => s.tokens);
  const targetToken = targetTokenId ? allTokens[targetTokenId] : null;

  // Default standard 1-6 combat quick actions
  const slots: HotbarSlot[] = [
    { key: '1', name: 'Primary Attack', type: 'attack', bonus: 5, damageDice: '1d8+3' },
    { key: '2', name: 'Offhand / Ranged', type: 'attack', bonus: 4, damageDice: '1d6+2' },
    { key: '3', name: 'Cantrip Strike', type: 'spell', bonus: 5, damageDice: '1d10' },
    { key: '4', name: 'Healing Spell', type: 'spell', damageDice: '1d8+3' },
    { key: '5', name: 'Dash Action', type: 'action' },
    { key: '6', name: 'Dodge Action', type: 'action' },
  ];

  const handleExecuteSlot = (slot: HotbarSlot) => {
    if (!socket) return;

    if (slot.type === 'action') {
      socket.emit('dice.roll', {
        expression: '1d20',
        characterName: slot.name,
        purpose: `Takes the ${slot.name}`,
      });
      showToast(`Used ${slot.name}`, 'info');
      return;
    }

    // Roll d20 + bonus
    const d20 = Math.floor(Math.random() * 20) + 1;
    const bonus = slot.bonus || 0;
    const total = d20 + bonus;
    const targetAC = targetToken?.statBlock ? ((targetToken.statBlock as any).ac || 10) : 10;
    const isCrit = d20 === 20;
    const isFumble = d20 === 1;
    const hits = isCrit ? true : isFumble ? false : total >= targetAC;

    socket.emit('dice.roll', {
      expression: `1d20+${bonus}`,
      characterName: slot.name,
      purpose: `Attack vs ${targetToken ? targetToken.name : 'Target'} [${hits ? 'HIT' : 'MISS'}]`,
    });

    const statusTag = isCrit ? '[CRITICAL HIT]' : isFumble ? '[FUMBLE]' : hits ? '[HIT]' : '[MISS]';
    showToast(`${slot.name}: Roll ${total} ${statusTag} (vs AC ${targetAC})`, hits ? 'success' : 'info');
  };

  // Keyboard shortcut listener for numbers 1-6
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const slot = slots.find((s) => s.key === e.key);
      if (slot) {
        e.preventDefault();
        handleExecuteSlot(slot);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [targetToken, socket]);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-2xl bg-surface/90 backdrop-blur-md border border-edge shadow-2xl select-none ${
        compact ? 'max-w-full overflow-x-auto' : ''
      }`}
    >
      {slots.map((slot) => {
        const Icon = slot.type === 'spell' ? Sparkles : slot.type === 'attack' ? Sword : Zap;
        return (
          <button
            key={slot.key}
            type="button"
            onClick={() => handleExecuteSlot(slot)}
            title={`${slot.name} (Key: ${slot.key})`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-edge/80 bg-surface-light hover:bg-surface-elevated hover:border-brand/40 text-ink text-xs font-medium transition-all active:scale-95 group shrink-0"
          >
            <span className="w-4 h-4 rounded bg-ink/10 text-[10px] font-mono flex items-center justify-center font-bold text-ink-muted group-hover:text-brand">
              {slot.key}
            </span>
            <Icon className="w-3.5 h-3.5 text-brand" />
            <span className="truncate max-w-[110px]">{slot.name}</span>
          </button>
        );
      })}
    </div>
  );
};
