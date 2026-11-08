import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DMOverrideMenu } from '../DMOverrideMenu';
import { DMOverrideHistory } from '../DMOverrideHistory';
import { OverrideTargetType, OverrideVisibility } from '../../../types';

describe('DMOverrideMenu Component', () => {
  it('renders menu and submits override with required reason', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <DMOverrideMenu
        isOpen={true}
        targetType={OverrideTargetType.HP}
        targetId="token-123"
        targetName="Goblin Archer"
        fieldPath="hp.current"
        currentValue={15}
        onApplyOverride={onApply}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('dm-override-menu')).toBeInTheDocument();
    expect(screen.getByText('Goblin Archer')).toBeInTheDocument();

    const input = screen.getByLabelText('Override Value');
    fireEvent.change(input, { target: { value: '25' } });

    const textarea = screen.getByPlaceholderText(/e\.g\. DM fiat/i);
    fireEvent.change(textarea, { target: { value: 'Adjusting encounter balance' } });

    const submitBtn = screen.getByRole('button', { name: 'Apply' });
    fireEvent.click(submitBtn);

    expect(onApply).toHaveBeenCalledWith({
      targetType: OverrideTargetType.HP,
      targetId: 'token-123',
      fieldPath: 'hp.current',
      previousValue: 15,
      newValue: 25,
      reason: 'Adjusting encounter balance',
      visibility: OverrideVisibility.DM_ONLY,
    });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('DMOverrideHistory Component', () => {
  it('renders audit trail and allows reverting overrides', () => {
    const onRevert = vi.fn();
    const onClose = vi.fn();

    const mockOverrides = [
      {
        id: 'ovr-1',
        campaignId: 'camp-1',
        targetType: OverrideTargetType.HP,
        targetId: 'token-1',
        fieldPath: 'hp.current',
        previousValue: 10,
        newValue: 30,
        reason: 'Boss enraged',
        visibility: OverrideVisibility.DM_ONLY,
        overriddenById: 'user-1',
        overriddenAt: new Date().toISOString(),
      },
    ];

    render(
      <DMOverrideHistory
        isOpen={true}
        overrides={mockOverrides}
        onRevert={onRevert}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('dm-override-history')).toBeInTheDocument();
    expect(screen.getByText(/Boss enraged/i)).toBeInTheDocument();

    // Click revert
    const revertBtn = screen.getByRole('button', { name: 'Revert' });
    fireEvent.click(revertBtn);

    // Enter revert reason and confirm
    const reasonInput = screen.getByPlaceholderText('Reason for reverting...');
    fireEvent.change(reasonInput, { target: { value: 'Encounter over' } });

    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.click(confirmBtn);

    expect(onRevert).toHaveBeenCalledWith('ovr-1', 'Encounter over');
  });
});
