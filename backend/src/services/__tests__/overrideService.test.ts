import { overrideService } from '../overrideService';
import { prisma } from '../../config/database';
import { OverrideTargetType, OverrideVisibility } from '@prisma/client';

describe('overrideService (Backend)', () => {
  const mockOverride = {
    id: 'ovr-123',
    campaignId: 'camp-1',
    targetType: OverrideTargetType.HP,
    targetId: 'token-456',
    fieldPath: 'hp.current',
    previousValue: 12,
    newValue: 30,
    reason: 'DM fiat: heroic recovery',
    visibility: OverrideVisibility.DM_ONLY,
    overriddenById: 'user-dm',
    overriddenAt: new Date(),
    revertedAt: null,
    revertedById: null,
    revertReason: null,
    overriddenBy: { id: 'user-dm', displayName: 'DM Alice' },
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('records an override successfully with required reason', async () => {
    const createSpy = jest
      .spyOn(prisma.dMOverride, 'create')
      .mockResolvedValue(mockOverride as unknown as Awaited<ReturnType<typeof overrideService.recordOverride>>);

    const result = await overrideService.recordOverride({
      campaignId: 'camp-1',
      targetType: OverrideTargetType.HP,
      targetId: 'token-456',
      fieldPath: 'hp.current',
      previousValue: 12,
      newValue: 30,
      reason: 'DM fiat: heroic recovery',
      overriddenById: 'user-dm',
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: 'camp-1',
          targetType: OverrideTargetType.HP,
          fieldPath: 'hp.current',
          newValue: 30,
        }),
      })
    );
    expect(result.id).toBe('ovr-123');
  });

  it('throws an error if reason is empty', async () => {
    await expect(
      overrideService.recordOverride({
        campaignId: 'camp-1',
        targetType: OverrideTargetType.HP,
        targetId: 'token-456',
        fieldPath: 'hp.current',
        previousValue: 12,
        newValue: 30,
        reason: '   ',
        overriddenById: 'user-dm',
      })
    ).rejects.toThrow('A reason is required');
  });

  it('reverts an override with reason and audit timestamp', async () => {
    jest.spyOn(prisma.dMOverride, 'findUnique').mockResolvedValue(mockOverride as unknown as Awaited<ReturnType<typeof prisma.dMOverride.findUnique>>);
    const updateSpy = jest
      .spyOn(prisma.dMOverride, 'update')
      .mockResolvedValue({
        ...mockOverride,
        revertedAt: new Date(),
        revertedById: 'user-dm',
        revertReason: 'Mistake corrected',
      } as unknown as Awaited<ReturnType<typeof prisma.dMOverride.update>>);

    const result = await overrideService.revertOverride({
      overrideId: 'ovr-123',
      revertedById: 'user-dm',
      revertReason: 'Mistake corrected',
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ovr-123' },
        data: expect.objectContaining({
          revertReason: 'Mistake corrected',
        }),
      })
    );
    expect(result.revertedAt).toBeDefined();
  });

  it('applies override when active override exists', async () => {
    jest.spyOn(prisma.dMOverride, 'findFirst').mockResolvedValue(mockOverride as unknown as Awaited<ReturnType<typeof prisma.dMOverride.findFirst>>);

    const val = await overrideService.applyOverride(
      'camp-1',
      OverrideTargetType.HP,
      'token-456',
      'hp.current',
      12
    );

    expect(val).toBe(30);
  });

  it('falls back to original value when no active override exists', async () => {
    jest.spyOn(prisma.dMOverride, 'findFirst').mockResolvedValue(null);

    const val = await overrideService.applyOverride(
      'camp-1',
      OverrideTargetType.HP,
      'token-456',
      'hp.current',
      12
    );

    expect(val).toBe(12);
  });
});
