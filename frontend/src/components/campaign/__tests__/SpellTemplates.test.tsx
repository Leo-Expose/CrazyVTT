import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpellTemplatePlacer } from '../SpellTemplatePlacer';
import { SpellCastReviewModal } from '../SpellCastReviewModal';
import { DEFAULT_SPELL_TEMPLATES } from '../../../utils/rules/spellAoE';

describe('SpellTemplatePlacer Component', () => {
  const mockTemplate = DEFAULT_SPELL_TEMPLATES.DND_5E[0]; // Fireball

  it('renders correctly when active', () => {
    const onSelectTemplate = vi.fn();
    const onConfirmCast = vi.fn();
    const onCancel = vi.fn();

    render(
      <SpellTemplatePlacer
        active={true}
        selectedTemplate={mockTemplate}
        onSelectTemplate={onSelectTemplate}
        affectedTokens={[
          { tokenId: 'token-1', tokenName: 'Goblin A', coverageRatio: 0.8, isAffected: true },
          { tokenId: 'token-2', tokenName: 'Goblin B', coverageRatio: 0.1, isAffected: false },
        ]}
        onConfirmCast={onConfirmCast}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId('spell-template-placer')).toBeInTheDocument();
    expect(screen.getByText('Cast Spell AoE')).toBeInTheDocument();
    expect(screen.getByText('1 target')).toBeInTheDocument();
    expect(screen.getByText('Goblin A')).toBeInTheDocument();
  });

  it('triggers onConfirmCast when Cast Spell button clicked', () => {
    const onConfirmCast = vi.fn();
    render(
      <SpellTemplatePlacer
        active={true}
        selectedTemplate={mockTemplate}
        onSelectTemplate={vi.fn()}
        affectedTokens={[
          { tokenId: 'token-1', tokenName: 'Goblin A', coverageRatio: 0.8, isAffected: true },
        ]}
        onConfirmCast={onConfirmCast}
        onCancel={vi.fn()}
      />
    );

    const castBtn = screen.getByRole('button', { name: 'Cast Spell' });
    fireEvent.click(castBtn);
    expect(onConfirmCast).toHaveBeenCalledTimes(1);
  });
});

describe('SpellCastReviewModal Component', () => {
  it('renders modal with target evaluation data and allows toggling save', () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();

    render(
      <SpellCastReviewModal
        isOpen={true}
        spellName="Fireball"
        casterName="Wizard"
        baseDamage={28}
        targets={[
          {
            tokenId: 'token-1',
            tokenName: 'Orc Boss',
            tokenX: 4,
            tokenY: 4,
            tokenSize: 2,
            coverageRatio: 0.9,
            isAffected: true,
            calculatedDamage: 28,
            savePassed: false,
            appliedConditions: [],
          },
        ]}
        onApply={onApply}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId('spell-cast-review-modal')).toBeInTheDocument();
    expect(screen.getByText('DM Review: Fireball')).toBeInTheDocument();
    expect(screen.getByText('Orc Boss')).toBeInTheDocument();

    // Toggle save to success (half damage)
    const saveToggle = screen.getByText('Failed (Full)');
    fireEvent.click(saveToggle);
    expect(screen.getByText('Success (Half)')).toBeInTheDocument();

    // Click apply
    const applyBtn = screen.getByText('Apply Spell Effects');
    fireEvent.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith([
      expect.objectContaining({
        tokenId: 'token-1',
        calculatedDamage: 14,
        savePassed: true,
      }),
    ]);
  });
});
