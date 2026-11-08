import { z } from 'zod';

/**
 * ChunkType enum - matches Prisma schema
 */
export const ChunkTypeEnum = z.enum([
  'SPELL',
  'ITEM',
  'CLASS',
  'SUBCLASS',
  'FEAT',
  'MONSTER',
  'RACE',
  'BACKGROUND',
  'RULE',
  'TABLE',
  'NARRATIVE',
]);

export type ChunkType = z.infer<typeof ChunkTypeEnum>;

/**
 * LicenseType enum - matches Prisma schema
 */
export const LicenseTypeEnum = z.enum([
  'SRD_5E',
  'SRD_5_1',
  'SRD_5_5',
  'COPYRIGHT_WOTC',
  'CC_BY_4',
  'DM_GUILD',
  'UNKNOWN',
]);

export type LicenseType = z.infer<typeof LicenseTypeEnum>;

/**
 * RulebookStatus enum - matches Prisma schema
 */
export const RulebookStatusEnum = z.enum([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'PARTIAL',
]);

export type RulebookStatus = z.infer<typeof RulebookStatusEnum>;

/**
 * Schema for rulebook upload metadata
 */
export const RulebookUploadMetadataSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer'),
  sourceId: z.string().trim().min(1, 'Source ID is required').max(50, 'Source ID must be 50 characters or fewer'),
  edition: z.string().trim().min(1, 'Edition is required').max(20, 'Edition must be 20 characters or fewer'),
  campaignId: z.string().uuid('Invalid campaign ID'),
});

export type RulebookUploadMetadata = z.infer<typeof RulebookUploadMetadataSchema>;

/**
 * Schema for creating a rulebook activation
 */
export const CreateRulebookActivationSchema = z.object({
  rulebookId: z.string().uuid('Invalid rulebook ID'),
  contentType: ChunkTypeEnum.optional(),
  sourceIds: z.array(z.string()).default([]),
});

export type CreateRulebookActivationInput = z.infer<typeof CreateRulebookActivationSchema>;

/**
 * Schema for updating a rulebook activation
 */
export const UpdateRulebookActivationSchema = z.object({
  contentType: ChunkTypeEnum.optional(),
  sourceIds: z.array(z.string()).optional(),
});

export type UpdateRulebookActivationInput = z.infer<typeof UpdateRulebookActivationSchema>;

/**
 * Schema for rulebook processing request
 */
export const ProcessRulebookSchema = z.object({
  rulebookId: z.string().uuid('Invalid rulebook ID'),
});

export type ProcessRulebookInput = z.infer<typeof ProcessRulebookSchema>;

/**
 * Schema for rulebook chunk response
 */
export const RulebookChunkResponseSchema = z.object({
  id: z.string().uuid(),
  rulebookId: z.string().uuid(),
  pageStart: z.number().int().min(1),
  pageEnd: z.number().int().min(1),
  contentType: ChunkTypeEnum,
  rawText: z.string(),
  structured: z.unknown().nullable().optional(),
  confidence: z.number().min(0).max(1),
  createdAt: z.date(),
});

export type RulebookChunkResponse = z.infer<typeof RulebookChunkResponseSchema>;

/**
 * Schema for rulebook response
 */
export const RulebookResponseSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  title: z.string(),
  sourceId: z.string(),
  edition: z.string(),
  filePath: z.string(),
  thumbnailPath: z.string().nullable(),
  status: RulebookStatusEnum,
  totalPages: z.number().int().nullable(),
  processedPages: z.number().int(),
  uploadedById: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RulebookResponse = z.infer<typeof RulebookResponseSchema>;

/**
 * Schema for rulebook activation response
 */
export const RulebookActivationResponseSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  rulebookId: z.string().uuid(),
  contentType: ChunkTypeEnum.nullable(),
  sourceIds: z.array(z.string()),
  activatedById: z.string().uuid(),
  activatedAt: z.date(),
  rulebook: RulebookResponseSchema.optional(),
});

export type RulebookActivationResponse = z.infer<typeof RulebookActivationResponseSchema>;

/**
 * Schema for extracted content response
 */
export const ExtractedContentResponseSchema = z.object({
  id: z.string().uuid(),
  contentType: ChunkTypeEnum,
  sourceId: z.string(),
  name: z.string(),
  data: z.unknown(),
  rawText: z.string(),
  pageRef: z.string(),
  license: LicenseTypeEnum,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ExtractedContentResponse = z.infer<typeof ExtractedContentResponseSchema>;

/**
 * Schema for rulebook list query parameters
 */
export const RulebookListQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
  status: RulebookStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type RulebookListQuery = z.infer<typeof RulebookListQuerySchema>;

/**
 * Schema for rulebook chunk list query parameters
 */
export const RulebookChunkListQuerySchema = z.object({
  rulebookId: z.string().uuid(),
  contentType: ChunkTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type RulebookChunkListQuery = z.infer<typeof RulebookChunkListQuerySchema>;