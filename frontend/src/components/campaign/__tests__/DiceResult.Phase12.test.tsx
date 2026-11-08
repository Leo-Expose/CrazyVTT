// ============================================
// DiceResult Phase 12 — mode badge tests
// ============================================

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DiceResult from '../DiceResult';
import type { DiceRolledEvent } from '@/types';
import { DiceMode, RerollReason } from '@/types';

// DiceModeSelector is imported for REROLL_LABEL — mock useCampaign + useWebSocket
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ role: 'PLAYER', campaign: null }),
}));

vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: null }),
}));

const baseRoll: DiceRolledEvent = {
  id: 'roll-1',
  userId: 'user-1',
  userName: 'Aria',
  characterName: null,
  expression: '1d20',
  result: 15,
  breakdown: {
    expression: '1d20 + 5',
    total: 15,
    formula: '1d20',
    rolls: [{ type: 'dice', notation: '1d20', sides: 20, results: [15], total: 15 }],
  },
  purpose: null,
  timestamp: new Date().toISOString(),
  secret: false,
};

describe('DiceResult – Phase 12 metadata', () => {
  it('shows 🎲 badge for TRUE_RANDOM mode', () => {
    render(
      <DiceResult
        roll={baseRoll}
        isCurrentUser={true}
        mode={DiceMode.TRUE_RANDOM}
      />,
    );
    expect(screen.getByTitle('True Random')).toBeInTheDocument();
  });

  it('shows 🃏 badge for WEIGHTED_DECK mode', () => {
    render(
      <DiceResult
        roll={baseRoll}
        isCurrentUser={true}
        mode={DiceMode.WEIGHTED_DECK}
      />,
    );
    expect(screen.getByTitle('Weighted Bell Curve deck')).toBeInTheDocument();
  });

  it('shows deck draw position for WEIGHTED_DECK', () => {
    render(
      <DiceResult
        roll={baseRoll}
        isCurrentUser={true}
        mode={DiceMode.WEIGHTED_DECK}
        deckPosition={7}
        deckSize={36}
      />,
    );
    expect(screen.getByText(/Draw 7\/36/)).toBeInTheDocument();
  });

  it('shows reroll badge for ADVANTAGE', () => {
    render(
      <DiceResult
        roll={baseRoll}
        isCurrentUser={true}
        isReroll={true}
        rerollReason={RerollReason.ADVANTAGE}
      />,
    );
    expect(screen.getByTitle('Re-roll')).toBeInTheDocument();
    expect(screen.getByText(/Adv/)).toBeInTheDocument();
  });

  it('shows reroll badge for HALFLING_LUCK', () => {
    render(
      <DiceResult
        roll={baseRoll}
        isCurrentUser={true}
        isReroll={true}
        rerollReason={RerollReason.HALFLING_LUCK}
      />,
    );
    expect(screen.getByText(/Halfling Luck/)).toBeInTheDocument();
  });

  it('renders normally without Phase 12 metadata (backward compatibility)', () => {
    render(<DiceResult roll={baseRoll} isCurrentUser={false} />);
    expect(screen.getAllByText('1d20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('15').length).toBeGreaterThan(0);
  });

  it('shows the roll expression and result', () => {
    render(<DiceResult roll={baseRoll} isCurrentUser={true} />);
    expect(screen.getAllByText('1d20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('15').length).toBeGreaterThan(0);
  });
});
