// ============================================
// Tile Service - Handles tile asset operations, Wang tile connections, and auto-tiling
// ============================================

import { TileCategory, LayerType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { getFilePath, ensureDirectory, generateUniqueFilename } from '../utils/fileUtils';
import { generateThumbnail } from '../utils/thumbnails';
import { prisma } from '../config/database';

export interface TileConnectionRules {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
  autoTile: boolean;
}

export interface TileVariant {
  id: string;
  name: string;
  assetId: string;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface WangTileSet {
  id: string;
  name: string;
  tiles: MapTileInfo[];
  connectionRules: Record<string, TileConnectionRules>;
}

export interface MapTileInfo {
  id: string;
  name: string;
  category: TileCategory;
  assetId: string;
  width: number;
  height: number;
  connections: TileConnectionRules;
  variants: TileVariant[];
}

/**
 * Create a new map tile from an uploaded asset
 */
export async function createMapTile(
  campaignId: string,
  name: string,
  category: TileCategory,
  assetId: string,
  width: number,
  height: number,
  connections?: TileConnectionRules,
  createdById?: string,
  isDefault: boolean = false
) {
  // Verify asset exists and is accessible
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, campaignId: true, type: true }
  });

  if (!asset) {
    throw new Error('Asset not found');
  }

  if (asset.campaignId !== campaignId && asset.campaignId !== null) {
    throw new Error('Asset not accessible to this campaign');
  }

  const tile = await prisma.mapTile.create({
    data: {
      campaignId,
      name,
      category,
      assetId,
      width,
      height,
      connections: connections as Prisma.InputJsonValue | undefined,
      isDefault,
      createdById,
    },
    include: {
      asset: true,
      createdBy: { select: { id: true, displayName: true } }
    }
  });

  return tile;
}

/**
 * Get all tiles for a campaign, optionally filtered by category
 */
export async function getMapTiles(campaignId: string, category?: TileCategory) {
  const where: Prisma.MapTileWhereInput = { campaignId };
  if (category) where.category = category;

  return prisma.mapTile.findMany({
    where,
    include: {
      asset: { select: { id: true, filePath: true, thumbnailPath: true, originalName: true, mimeType: true } },
      createdBy: { select: { id: true, displayName: true } }
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }]
  });
}

/**
 * Get a single tile by ID
 */
export async function getMapTileById(tileId: string) {
  return prisma.mapTile.findUnique({
    where: { id: tileId },
    include: {
      asset: true,
      createdBy: { select: { id: true, displayName: true } },
      campaign: { select: { id: true, name: true } }
    }
  });
}

/**
 * Update a map tile
 */
export async function updateMapTile(
  tileId: string,
  data: {
    name?: string;
    category?: TileCategory;
    width?: number;
    height?: number;
    connections?: TileConnectionRules;
  }
) {
  return prisma.mapTile.update({
    where: { id: tileId },
    data: {
      ...data,
      connections: data.connections as Prisma.InputJsonValue | undefined,
    },
    include: {
      asset: true,
      createdBy: { select: { id: true, displayName: true } }
    }
  });
}

/**
 * Delete a map tile
 */
export async function deleteMapTile(tileId: string) {
  const tile = await prisma.mapTile.findUnique({
    where: { id: tileId },
    select: { assetId: true, isDefault: true }
  });

  if (!tile) throw new Error('Tile not found');
  if (tile.isDefault) throw new Error('Cannot delete default tiles');

  // Delete the tile (asset is not deleted as it may be used elsewhere)
  await prisma.mapTile.delete({ where: { id: tileId } });

  return { success: true };
}

/**
 * Auto-slice a tile sheet into individual tiles
 * Assumes a regular grid layout
 */
export async function autoSliceTileSheet(
  assetId: string,
  campaignId: string,
  tileWidth: number, // in pixels
  tileHeight: number, // in pixels
  spacing: number = 0, // spacing between tiles in pixels
  margin: number = 0, // margin around the sheet in pixels
  options: {
    namePrefix?: string;
    category?: TileCategory;
    createdById?: string;
    columns?: number; // if specified, only process this many columns
    rows?: number;    // if specified, only process this many rows
  } = {}
) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { filePath: true, mimeType: true, originalName: true }
  });

  if (!asset) throw new Error('Asset not found');

  const imagePath = path.resolve(asset.filePath.replace(/\\/g, '/'));
  const image = sharp(imagePath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read image dimensions');
  }

  const cols = options.columns || Math.floor((metadata.width - 2 * margin) / (tileWidth + spacing));
  const rows = options.rows || Math.floor((metadata.height - 2 * margin) / (tileHeight + spacing));

  if (cols <= 0 || rows <= 0) {
    throw new Error('Tile dimensions too large for image');
  }

  const tiles: MapTileInfo[] = [];
  const uploadPath = getFilePath('MAP', 'CAMPAIGN', campaignId);
  await ensureDirectory(uploadPath);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = margin + col * (tileWidth + spacing);
      const y = margin + row * (tileHeight + spacing);

      // Extract tile
      const tileBuffer = await image
        .clone()
        .extract({ left: x, top: y, width: tileWidth, height: tileHeight })
        .png()
        .toBuffer();

      // Save as new asset
      const tileFileName = generateUniqueFilename(`${asset.originalName}_${row}_${col}.png`);
      const tileFilePath = path.join(uploadPath, tileFileName).replace(/\\/g, '/');
      await fs.writeFile(tileFilePath, tileBuffer);

      // Generate thumbnail
      const thumbnailPath = await generateThumbnail(tileFilePath);

      // Create asset record
      const tileAsset = await prisma.asset.create({
        data: {
          type: 'MAP',
          scope: 'CAMPAIGN',
          uploadedById: options.createdById,
          campaignId,
          filename: tileFileName,
          originalName: `${asset.originalName}_tile_${row}_${col}.png`,
          mimeType: 'image/png',
          fileSize: tileBuffer.length,
          filePath: tileFilePath,
          thumbnailPath,
          name: `${options.namePrefix || asset.originalName}_${row}_${col}`,
          tags: ['auto-sliced', 'tile'],
        }
      });

      // Create map tile
      const mapTile = await createMapTile(
        campaignId,
        `${options.namePrefix || asset.originalName}_${row}_${col}`,
        options.category || TileCategory.FLOOR,
        tileAsset.id,
        1, // 1 grid square by default
        1,
        undefined, // connections - will be set up later for Wang tiles
        options.createdById
      );

      tiles.push({
        id: mapTile.id,
        name: mapTile.name,
        category: mapTile.category,
        assetId: mapTile.assetId,
        width: mapTile.width,
        height: mapTile.height,
        connections: (mapTile.connections as unknown as TileConnectionRules | null) ?? {
          north: false,
          south: false,
          east: false,
          west: false,
          autoTile: false,
        },
        variants: []
      });
    }
  }

  return {
    tiles,
    totalTiles: tiles.length,
    columns: cols,
    rows: rows
  };
}

/**
 * Detect Wang tile connections from a tile image
 * Analyzes edges to determine connection rules
 */
export async function detectWangConnections(
  assetId: string,
  threshold: number = 128
): Promise<TileConnectionRules> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { filePath: true }
  });

  if (!asset) throw new Error('Asset not found');

  const imagePath = path.resolve(asset.filePath.replace(/\\/g, '/'));
  const image = sharp(imagePath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read image dimensions');
  }

  // Sample pixels along each edge
  const edgeWidth = Math.min(4, Math.floor(Math.min(metadata.width, metadata.height) * 0.1));

  // North edge (top)
  const northBuffer = await image.clone().extract({ left: 0, top: 0, width: metadata.width, height: edgeWidth }).raw().toBuffer();
  const northHasContent = hasNonTransparentPixels(northBuffer, edgeWidth, metadata.width, threshold);

  // South edge (bottom)
  const southBuffer = await image.clone().extract({ left: 0, top: metadata.height - edgeWidth, width: metadata.width, height: edgeWidth }).raw().toBuffer();
  const southHasContent = hasNonTransparentPixels(southBuffer, edgeWidth, metadata.width, threshold);

  // West edge (left)
  const westBuffer = await image.clone().extract({ left: 0, top: 0, width: edgeWidth, height: metadata.height }).raw().toBuffer();
  const westHasContent = hasNonTransparentPixels(westBuffer, metadata.height, edgeWidth, threshold);

  // East edge (right)
  const eastBuffer = await image.clone().extract({ left: metadata.width - edgeWidth, top: 0, width: edgeWidth, height: metadata.height }).raw().toBuffer();
  const eastHasContent = hasNonTransparentPixels(eastBuffer, metadata.height, edgeWidth, threshold);

  return {
    north: northHasContent,
    south: southHasContent,
    east: eastHasContent,
    west: westHasContent,
    autoTile: true
  };
}

/**
 * Check if buffer has non-transparent pixels above threshold
 */
function hasNonTransparentPixels(buffer: Buffer, _height: number, _width: number, threshold: number): boolean {
  // Buffer is RGBA, 4 bytes per pixel
  for (let i = 3; i < buffer.length; i += 4) {
    if (buffer[i] > threshold) return true; // Alpha channel
  }
  return false;
}

/**
 * Compute auto-tile variant for a given neighbor configuration
 * Wang tile algorithm: 16-tile or 47-tile set
 */
export function computeAutoTileVariant(
  neighbors: { north: boolean; south: boolean; east: boolean; west: boolean },
  tileSet: '16' | '47' = '47'
): number {
  // Encode neighbors as 4-bit value: N=1, S=2, E=4, W=8
  let config = 0;
  if (neighbors.north) config |= 1;
  if (neighbors.south) config |= 2;
  if (neighbors.east) config |= 4;
  if (neighbors.west) config |= 8;

  if (tileSet === '16') {
    // 16-tile set: direct mapping
    return config;
  }

  // 47-tile set: includes corners, T-junctions, crosses
  // This is a simplified mapping - real implementation would use a lookup table
  return config;
}

/**
 * Get tile variants for rotation/flip
 */
export function getTileVariants(baseAssetId: string): TileVariant[] {
  const variants: TileVariant[] = [];
  const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  const flips = [{ flipH: false, flipV: false }, { flipH: true, flipV: false }, { flipH: false, flipV: true }, { flipH: true, flipV: true }];

  for (const rotation of rotations) {
    for (const { flipH, flipV } of flips) {
      if (rotation === 0 && !flipH && !flipV) continue; // Skip base variant
      variants.push({
        id: randomUUID(),
        name: `rot${rotation}${flipH ? '_h' : ''}${flipV ? '_v' : ''}`,
        assetId: baseAssetId,
        rotation,
        flipH,
        flipV
      });
    }
  }
  return variants;
}

/**
 * Create a MapLayer
 */
export async function createMapLayer(
  mapId: string,
  name: string,
  type: LayerType,
  order: number,
  data: Record<string, unknown> = {}
) {
  return prisma.mapLayer.create({
    data: {
      mapId,
      name,
      type,
      order,
      data: data as Prisma.InputJsonValue,
    }
  });
}

/**
 * Get all layers for a map
 */
export async function getMapLayers(mapId: string) {
  return prisma.mapLayer.findMany({
    where: { mapId },
    orderBy: { order: 'asc' }
  });
}

/**
 * Update a MapLayer
 */
export async function updateMapLayer(
  layerId: string,
  data: {
    name?: string;
    order?: number;
    visible?: boolean;
    locked?: boolean;
    data?: Record<string, unknown>;
  }
) {
  return prisma.mapLayer.update({
    where: { id: layerId },
    data: {
      ...data,
      data: data.data as Prisma.InputJsonValue | undefined,
    }
  });
}

/**
 * Delete a MapLayer
 */
export async function deleteMapLayer(layerId: string) {
  return prisma.mapLayer.delete({ where: { id: layerId } });
}

/**
 * Reorder layers
 */
export async function reorderMapLayers(mapId: string, layerIds: string[]) {
  const updates = layerIds.map((id, index) =>
    prisma.mapLayer.update({
      where: { id },
      data: { order: index }
    })
  );
  await prisma.$transaction(updates);
  return getMapLayers(mapId);
}

/**
 * Duplicate a layer
 */
export async function duplicateMapLayer(layerId: string, newName: string) {
  const layer = await prisma.mapLayer.findUnique({ where: { id: layerId } });
  if (!layer) throw new Error('Layer not found');

  return prisma.mapLayer.create({
    data: {
      mapId: layer.mapId,
      name: newName,
      type: layer.type,
      order: layer.order + 1,
      data: layer.data === null ? Prisma.JsonNull : layer.data as Prisma.InputJsonValue,
      visible: layer.visible,
      locked: layer.locked,
    }
  });
}

/**
 * Initialize default layers for a new map
 */
export async function initializeDefaultLayers(mapId: string) {
  const defaultLayers = [
    { name: 'Terrain', type: LayerType.TERRAIN, order: 0, data: { tiles: [] } },
    { name: 'Structure', type: LayerType.STRUCTURE, order: 1, data: { tiles: [] } },
    { name: 'Furniture', type: LayerType.FURNITURE, order: 2, data: { tiles: [] } },
    { name: 'Walls', type: LayerType.WALLS, order: 3, data: { segments: [] } },
    { name: 'Lighting', type: LayerType.LIGHTING, order: 4, data: { lights: [] } },
    { name: 'Fog', type: LayerType.FOG, order: 5, data: { boxes: [] } },
    { name: 'Tokens', type: LayerType.TOKENS, order: 6, data: {} },
    { name: 'Annotations', type: LayerType.ANNOTATIONS, order: 7, data: { drawings: [] } },
  ];

  return prisma.$transaction(
    defaultLayers.map(l => prisma.mapLayer.create({
      data: {
        mapId,
        name: l.name,
        type: l.type,
        order: l.order,
        data: l.data as Prisma.InputJsonValue,
      },
    }))
  );
}

/**
 * Export layer data in the interoperable UVTT layer format.
 */
export function exportLayerData(layer: { type: LayerType; data: Record<string, unknown> }) {
  switch (layer.type) {
    case LayerType.TERRAIN:
    case LayerType.STRUCTURE:
    case LayerType.FURNITURE:
      return {
        type: 'tile',
        tiles: layer.data.tiles || []
      };
    case LayerType.WALLS:
      return {
        type: 'vector',
        segments: layer.data.segments || []
      };
    case LayerType.ANNOTATIONS:
      return {
        type: 'annotation',
        drawings: layer.data.drawings || []
      };
    default:
      return { type: layer.type, data: layer.data };
  }
}
