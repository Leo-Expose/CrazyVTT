import { useState, useEffect } from 'react';
import { Layers, Shuffle } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { DiceMode } from '@/types';

interface DiceModeSelectorProps {
  /** Current campaign dice mode — provided by the parent so the selector is
   *  driven by campaign state rather than local guess-work. */
  currentMode: DiceMode;
}

const MODE_OPTIONS: { value: DiceMode; label: string; icon: string; description: string }[] = [
  {
    value: DiceMode.TRUE_RANDOM,
    icon: '🎲',
    label: 'True Random',
    description: 'Standard crypto-random rolls — same as a physical die.',
  },
  {
    value: DiceMode.WEIGHTED_DECK,
    icon: '🃏',
    label: 'Weighted Bell Curve',
    description: 'All outcomes are pre-shuffled. Every result appears its correct number of times over each cycle.',
  },
];

const REROLL_LABEL: Record<string, string> = {
  ADVANTAGE: 'Adv',
  DISADVANTAGE: 'Dis',
  HALFLING_LUCK: 'Halfling Luck',
  ELVEN_ACCURACY: 'Elven Acc.',
  GREAT_WEAPON_FIGHTING: 'GWF',
  BLESS: 'Bless',
  BANE: 'Bane',
  PORTENT: 'Portent',
  DM_FORCED: 'DM',
  PLAYER_CHOICE: 'Player',
  REROLL_FEATURE: 'Reroll',
  OTHER: 'Other',
};

export { REROLL_LABEL };

/**
 * DM-only dropdown that changes the campaign's dice rolling mode.
 * Emits `dice.setMode` via socket and shows the current mode as a badge.
 */
export default function DiceModeSelector({ currentMode }: DiceModeSelectorProps) {
  const { socket } = useWebSocket();
  const { role } = useCampaign();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear transient error after 4 s
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  if (role !== 'DM') return null;

  const current = MODE_OPTIONS.find((m) => m.value === currentMode) ?? MODE_OPTIONS[0];

  const handleChange = (mode: DiceMode) => {
    if (mode === currentMode || pending || !socket) return;
    setPending(true);
    setError(null);

    socket.emit('dice.setMode', { mode }, (ack: { ok: boolean; error?: string }) => {
      setPending(false);
      if (!ack?.ok) {
        setError(ack?.error ?? 'Failed to change dice mode');
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-ink-secondary font-medium uppercase tracking-wide">
        <Layers className="w-3 h-3" />
        Dice Mode
      </div>

      <div className="flex gap-1">
        {MODE_OPTIONS.map((opt) => {
          const isActive = opt.value === currentMode;
          return (
            <button
              key={opt.value}
              onClick={() => handleChange(opt.value)}
              disabled={pending}
              title={opt.description}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium
                transition-colors disabled:opacity-60
                ${isActive
                  ? 'bg-brand text-brand-text shadow-sm'
                  : 'bg-surface/50 text-ink-secondary hover:bg-surface hover:text-ink border border-ink-muted/20'
                }
              `}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
              {isActive && pending && (
                <Shuffle className="w-3 h-3 animate-spin ml-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Current mode indicator */}
      <p className="text-xs text-ink-muted leading-tight">
        {current.icon} <span className="font-medium">{current.label}</span>
        {' — '}{current.description}
      </p>

      {error && (
        <p className="text-xs text-danger-ink" role="alert">{error}</p>
      )}
    </div>
  );
}
