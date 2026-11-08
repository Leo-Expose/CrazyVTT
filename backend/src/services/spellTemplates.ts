/**
 * Spell Template Service
 * Provides CRUD and retrieval for Spell AoE Templates
 */

import { prisma } from '../config/database';
import { AoEShape, Prisma } from '@prisma/client';
import { DEFAULT_SPELL_TEMPLATES } from '../utils/rules/spellAoE';

export interface CreateSpellTemplateInput {
  campaignId?: string;
  name: string;
  shape: AoEShape;
  size: Record<string, unknown>;
  origin?: string;
  gridSnap?: boolean;
  color?: string;
  isDefault?: boolean;
  createdById?: string;
}

export async function listSpellTemplates(campaignId?: string) {
  return prisma.spellTemplate.findMany({
    where: {
      OR: [
        { isDefault: true },
        campaignId ? { campaignId } : {},
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSpellTemplateById(id: string) {
  return prisma.spellTemplate.findUnique({
    where: { id },
  });
}

export async function createSpellTemplate(input: CreateSpellTemplateInput) {
  return prisma.spellTemplate.create({
    data: {
      name: input.name,
      shape: input.shape,
      size: input.size as Prisma.InputJsonValue,
      origin: input.origin || 'intersection',
      gridSnap: input.gridSnap ?? true,
      color: input.color || '#3b82f6',
      isDefault: input.isDefault ?? false,
      campaignId: input.campaignId,
      createdById: input.createdById,
    },
  });
}

export async function deleteSpellTemplate(id: string) {
  return prisma.spellTemplate.delete({
    where: { id },
  });
}

/**
 * Seed default templates for a system if none exist
 */
export async function seedDefaultSpellTemplates(gameSystem = 'DND_5E') {
  const defaults = DEFAULT_SPELL_TEMPLATES[gameSystem] || DEFAULT_SPELL_TEMPLATES.DND_5E;
  const created = [];

  for (const def of defaults) {
    const existing = await prisma.spellTemplate.findFirst({
      where: { name: def.name, isDefault: true },
    });
    if (!existing) {
      const template = await prisma.spellTemplate.create({
        data: {
          name: def.name,
          shape: def.shape as AoEShape,
          size: def.size as unknown as Prisma.InputJsonValue,
          origin: def.origin,
          gridSnap: def.gridSnap,
          color: def.color,
          isDefault: true,
        },
      });
      created.push(template);
    }
  }

  return created;
}
