/**
 * Universal DM Override Service
 * Allows the DM to modify, cancel, or force any automated mechanic with full audit trails and reversibility.
 */

import { prisma } from '../config/database';
import { OverrideTargetType, OverrideVisibility, Prisma } from '@prisma/client';

export interface RecordOverrideInput {
  campaignId: string;
  targetType: OverrideTargetType;
  targetId: string;
  fieldPath: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  visibility?: OverrideVisibility;
  overriddenById: string;
}

export interface RevertOverrideInput {
  overrideId: string;
  revertedById: string;
  revertReason: string;
}

export class OverrideService {
  /**
   * Record a new DM override
   */
  async recordOverride(data: RecordOverrideInput) {
    if (!data.reason || data.reason.trim().length === 0) {
      throw new Error('A reason is required when issuing a DM override.');
    }

    return prisma.dMOverride.create({
      data: {
        campaignId: data.campaignId,
        targetType: data.targetType,
        targetId: data.targetId,
        fieldPath: data.fieldPath,
        previousValue: data.previousValue as Prisma.InputJsonValue,
        newValue: data.newValue as Prisma.InputJsonValue,
        reason: data.reason.trim(),
        visibility: data.visibility || OverrideVisibility.DM_ONLY,
        overriddenById: data.overriddenById,
      },
      include: {
        overriddenBy: {
          select: { id: true, displayName: true },
        },
      },
    });
  }

  /**
   * Revert an existing override
   */
  async revertOverride(data: RevertOverrideInput) {
    const existing = await prisma.dMOverride.findUnique({
      where: { id: data.overrideId },
    });

    if (!existing) {
      throw new Error(`Override ${data.overrideId} not found.`);
    }

    if (existing.revertedAt) {
      throw new Error(`Override ${data.overrideId} has already been reverted.`);
    }

    return prisma.dMOverride.update({
      where: { id: data.overrideId },
      data: {
        revertedAt: new Date(),
        revertedById: data.revertedById,
        revertReason: data.revertReason?.trim() || 'Reverted by DM',
      },
      include: {
        overriddenBy: {
          select: { id: true, displayName: true },
        },
        revertedBy: {
          select: { id: true, displayName: true },
        },
      },
    });
  }

  /**
   * Get override history for a specific target
   */
  async getOverrideHistory(
    campaignId: string,
    targetType: OverrideTargetType,
    targetId: string
  ) {
    return prisma.dMOverride.findMany({
      where: {
        campaignId,
        targetType,
        targetId,
      },
      orderBy: { overriddenAt: 'desc' },
      include: {
        overriddenBy: {
          select: { id: true, displayName: true },
        },
        revertedBy: {
          select: { id: true, displayName: true },
        },
      },
    });
  }

  /**
   * Get campaign overrides with pagination
   */
  async getCampaignOverrides(campaignId: string, limit = 50) {
    return prisma.dMOverride.findMany({
      where: { campaignId },
      take: limit,
      orderBy: { overriddenAt: 'desc' },
      include: {
        overriddenBy: {
          select: { id: true, displayName: true },
        },
        revertedBy: {
          select: { id: true, displayName: true },
        },
      },
    });
  }

  /**
   * Check if an active override exists for a given target field and return the effective value
   */
  async applyOverride<T>(
    campaignId: string,
    targetType: OverrideTargetType,
    targetId: string,
    fieldPath: string,
    originalValue: T
  ): Promise<T> {
    const latestActive = await prisma.dMOverride.findFirst({
      where: {
        campaignId,
        targetType,
        targetId,
        fieldPath,
        revertedAt: null,
      },
      orderBy: { overriddenAt: 'desc' },
    });

    if (latestActive && latestActive.newValue !== undefined) {
      return latestActive.newValue as T;
    }

    return originalValue;
  }
}

export const overrideService = new OverrideService();
