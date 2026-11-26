// ============================================
// Layer WebSocket Handlers
// Handles real-time layer operations for advanced map drawing
// ============================================

import { Server } from 'socket.io';
import { Prisma } from '@prisma/client';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { emitToMapReaders } from '../utils';
import { withinCeiling } from '../shared';
import logger from '../../utils/logger';

interface TilePlacement {
  tileId: string;
  x: number;
  y: number;
  rotation?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  variant?: string;
  autoTile?: boolean;
}

const MAX_RECTANGLE_TILES = 10_000;

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asLayerDataObject(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

function isPlainPayload(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function registerLayerHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * LAYER.UPDATE - Update layer properties (visibility, lock, order, data)
   * DM only
   */
  socket.on('layer:update', async (data: {
    mapId: string;
    layerId: string;
    name?: string;
    order?: number;
    visible?: boolean;
    locked?: boolean;
    data?: Record<string, unknown>;
  }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'layer:update')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can update layers' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerId, name, order, visible, locked, data: patchData } = data;
      if (!mapId || !layerId) {
        socket.emit('error', { message: 'mapId and layerId required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const layer = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "MapLayer" WHERE id = ${layerId} FOR UPDATE`;
        const existing = await tx.mapLayer.findUnique({ where: { id: layerId, mapId } });
        if (!existing) return null;

        const mergedData = isPlainPayload(patchData)
          ? toPrismaJson({ ...asLayerDataObject(existing.data), ...patchData })
          : undefined;

        return tx.mapLayer.update({
          where: { id: layerId, mapId },
          data: {
            ...(typeof name === 'string' ? { name } : {}),
            ...(typeof order === 'number' && Number.isInteger(order) ? { order } : {}),
            ...(typeof visible === 'boolean' ? { visible } : {}),
            ...(typeof locked === 'boolean' ? { locked } : {}),
            ...(mergedData !== undefined ? { data: mergedData } : {}),
          },
        });
      });

      if (!layer) {
        socket.emit('error', { message: 'Layer not found' });
        return;
      }

      await emitToMapReaders(io, socket.campaignId, mapId, 'layer:updated', { mapId, layer });

      logger.info('layer:update', { mapId, layerId, userId: socket.userId });
    } catch (error) {
      logger.error('layer:update failed', { err: error });
      socket.emit('error', { message: 'Failed to update layer' });
    }
  });

  /**
   * LAYER.REORDER - Reorder layers
   * DM only
   */
  socket.on('layer:reorder', async (data: { mapId: string; layerIds: string[] }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'layer:reorder')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can reorder layers' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerIds } = data;
      if (!mapId || !Array.isArray(layerIds)) {
        socket.emit('error', { message: 'mapId and layerIds array required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const layers = await prisma.mapLayer.findMany({
        where: { id: { in: layerIds }, mapId },
      });
      if (layers.length !== layerIds.length) {
        socket.emit('error', { message: 'One or more layers not found' });
        return;
      }

      await prisma.$transaction(
        layerIds.map((id, index) =>
          prisma.mapLayer.update({ where: { id }, data: { order: index } })
        )
      );

      const updatedLayers = await prisma.mapLayer.findMany({
        where: { mapId },
        orderBy: { order: 'asc' },
      });

      await emitToMapReaders(io, socket.campaignId, mapId, 'layers:reordered', { mapId, layers: updatedLayers });

      logger.info('layer:reorder', { mapId, userId: socket.userId });
    } catch (error) {
      logger.error('layer:reorder failed', { err: error });
      socket.emit('error', { message: 'Failed to reorder layers' });
    }
  });

  /**
   * LAYER.DATA.UPDATE - Update layer tile data (for tile-based layers)
   * DM only
   */
  socket.on('layer:data:update', async (data: {
    mapId: string;
    layerId: string;
    tiles: TilePlacement[];
  }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'layer:data:update')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can update layer data' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerId, tiles } = data;
      if (!mapId || !layerId || !Array.isArray(tiles)) {
        socket.emit('error', { message: 'mapId, layerId, and tiles array required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "MapLayer" WHERE id = ${layerId} FOR UPDATE`;
        const layer = await tx.mapLayer.findUnique({ where: { id: layerId, mapId } });
        if (!layer) return { error: 'Layer not found' } as const;

        const tileLayerTypes = ['TERRAIN', 'STRUCTURE', 'FURNITURE'];
        if (!tileLayerTypes.includes(layer.type)) {
          return { error: 'This layer type does not support tile data' } as const;
        }

        const currentData = asLayerDataObject(layer.data);
        await tx.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson({ ...currentData, tiles }) },
        });
        return { ok: true } as const;
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

      await emitToMapReaders(io, socket.campaignId, mapId, 'layer:data:updated', { mapId, layerId, tiles });

      logger.info('layer:data:update', { mapId, layerId, tileCount: tiles.length, userId: socket.userId });
    } catch (error) {
      logger.error('layer:data:update failed', { err: error });
      socket.emit('error', { message: 'Failed to update layer data' });
    }
  });

  /**
   * TILE.PLACE - Place a single tile (optimized for real-time stamping)
   * DM only
   */
  socket.on('tile:place', async (data: {
    mapId: string;
    layerId: string;
    tileId: string;
    x: number;
    y: number;
    rotation?: 0 | 90 | 180 | 270;
    flipH?: boolean;
    flipV?: boolean;
    variant?: string;
    autoTile?: boolean;
  }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'tile:place')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can place tiles' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerId, tileId, x, y, ...options } = data;
      if (!mapId || !layerId || !tileId || !Number.isInteger(x) || !Number.isInteger(y)) {
        socket.emit('error', { message: 'mapId, layerId, tileId, and integer x, y required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const tile = await prisma.mapTile.findFirst({ where: { id: tileId, campaignId: socket.campaignId } });
      if (!tile) {
        socket.emit('error', { message: 'Tile not found' });
        return;
      }

      const newTile: TilePlacement = { tileId, x, y, ...options };
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "MapLayer" WHERE id = ${layerId} FOR UPDATE`;
        const layer = await tx.mapLayer.findUnique({ where: { id: layerId, mapId } });
        if (!layer) return { error: 'Layer not found' } as const;

        const tileLayerTypes = ['TERRAIN', 'STRUCTURE', 'FURNITURE'];
        if (!tileLayerTypes.includes(layer.type)) {
          return { error: 'This layer type does not support tile placement' } as const;
        }

        const currentData = asLayerDataObject(layer.data);
        const tiles = Array.isArray(currentData.tiles) ? [...(currentData.tiles as TilePlacement[])] : [];
        const existingIndex = tiles.findIndex((placed) => placed.x === x && placed.y === y);

        if (existingIndex >= 0) {
          tiles[existingIndex] = newTile;
        } else {
          tiles.push(newTile);
        }

        await tx.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson({ ...currentData, tiles }) },
        });
        return { tiles } as const;
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

      await emitToMapReaders(io, socket.campaignId, mapId, 'tile:placed', { mapId, layerId, tile: newTile });

      if (options.autoTile && tile.connections) {
        await handleAutoTiling(io, socket.campaignId, mapId, layerId, x, y, outcome.tiles);
      }

      logger.info('tile:place', { mapId, layerId, tileId, x, y, userId: socket.userId });
    } catch (error) {
      logger.error('tile:place failed', { err: error });
      socket.emit('error', { message: 'Failed to place tile' });
    }
  });

  /**
   * TILE.REMOVE - Remove a tile
   * DM only
   */
  socket.on('tile:remove', async (data: { mapId: string; layerId: string; x: number; y: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'tile:remove')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can remove tiles' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerId, x, y } = data;
      if (!mapId || !layerId || !Number.isInteger(x) || !Number.isInteger(y)) {
        socket.emit('error', { message: 'mapId, layerId, and integer x, y required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "MapLayer" WHERE id = ${layerId} FOR UPDATE`;
        const layer = await tx.mapLayer.findUnique({ where: { id: layerId, mapId } });
        if (!layer) return { error: 'Layer not found' } as const;

        const currentData = asLayerDataObject(layer.data);
        const existingTiles = Array.isArray(currentData.tiles) ? (currentData.tiles as TilePlacement[]) : [];
        const tiles = existingTiles.filter((placed) => !(placed.x === x && placed.y === y));

        await tx.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson({ ...currentData, tiles }) },
        });
        return { ok: true } as const;
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

      await emitToMapReaders(io, socket.campaignId, mapId, 'tile:removed', { mapId, layerId, x, y });

      logger.info('tile:remove', { mapId, layerId, x, y, userId: socket.userId });
    } catch (error) {
      logger.error('tile:remove failed', { err: error });
      socket.emit('error', { message: 'Failed to remove tile' });
    }
  });

  /**
   * TILE.RECTANGLE - Fill a rectangle with a tile
   * DM only
   */
  socket.on('tile:rectangle', async (data: {
    mapId: string;
    layerId: string;
    tileId: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    rotation?: 0 | 90 | 180 | 270;
    flipH?: boolean;
    flipV?: boolean;
    variant?: string;
  }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'tile:rectangle')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can fill rectangles' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerId, tileId, x1, y1, x2, y2, ...options } = data;
      if (
        !mapId || !layerId || !tileId ||
        !Number.isInteger(x1) || !Number.isInteger(y1) ||
        !Number.isInteger(x2) || !Number.isInteger(y2)
      ) {
        socket.emit('error', { message: 'mapId, layerId, tileId, and integer x1, y1, x2, y2 required' });
        return;
      }

      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      const area = (maxX - minX + 1) * (maxY - minY + 1);
      if (area > MAX_RECTANGLE_TILES) {
        socket.emit('error', { message: `Rectangle exceeds maximum of ${MAX_RECTANGLE_TILES} tiles` });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const tile = await prisma.mapTile.findFirst({ where: { id: tileId, campaignId: socket.campaignId } });
      if (!tile) {
        socket.emit('error', { message: 'Tile not found' });
        return;
      }

      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "MapLayer" WHERE id = ${layerId} FOR UPDATE`;
        const layer = await tx.mapLayer.findUnique({ where: { id: layerId, mapId } });
        if (!layer) return { error: 'Layer not found' } as const;

        const tileLayerTypes = ['TERRAIN', 'STRUCTURE', 'FURNITURE'];
        if (!tileLayerTypes.includes(layer.type)) {
          return { error: 'This layer type does not support tile placement' } as const;
        }

        const currentData = asLayerDataObject(layer.data);
        const tiles = Array.isArray(currentData.tiles) ? [...(currentData.tiles as TilePlacement[])] : [];
        const indexByCoord = new Map<string, number>();
        tiles.forEach((t, idx) => indexByCoord.set(`${t.x},${t.y}`, idx));

        const placedTiles: TilePlacement[] = [];
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            const newTile: TilePlacement = { tileId, x, y, ...options };
            const key = `${x},${y}`;
            const existingIndex = indexByCoord.get(key);
            if (existingIndex !== undefined) {
              tiles[existingIndex] = newTile;
            } else {
              indexByCoord.set(key, tiles.length);
              tiles.push(newTile);
            }
            placedTiles.push(newTile);
          }
        }

        await tx.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson({ ...currentData, tiles }) },
        });
        return { placedTiles } as const;
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

      await emitToMapReaders(io, socket.campaignId, mapId, 'tiles:placed', { mapId, layerId, tiles: outcome.placedTiles });

      logger.info('tile:rectangle', { mapId, layerId, tileId, count: outcome.placedTiles.length, userId: socket.userId });
    } catch (error) {
      logger.error('tile:rectangle failed', { err: error });
      socket.emit('error', { message: 'Failed to fill rectangle' });
    }
  });
}

/**
 * Handle Wang tile auto-tiling for neighboring tiles
 */
async function handleAutoTiling(
  io: Server,
  campaignId: string,
  mapId: string,
  layerId: string,
  centerX: number,
  centerY: number,
  tiles: TilePlacement[]
): Promise<void> {
  try {
    const centerTile = tiles.find((t) => t.x === centerX && t.y === centerY);
    if (!centerTile) return;

    const tileInfo = await prisma.mapTile.findUnique({
      where: { id: centerTile.tileId },
      select: { connections: true, category: true },
    });

    const connections = tileInfo?.connections as unknown as ({ autoTile?: boolean; [key: string]: boolean | undefined } | null);
    if (!connections?.autoTile) return;
    const neighbors = [
      { x: centerX, y: centerY - 1, dir: 'north', opposite: 'south' },
      { x: centerX, y: centerY + 1, dir: 'south', opposite: 'north' },
      { x: centerX + 1, y: centerY, dir: 'east', opposite: 'west' },
      { x: centerX - 1, y: centerY, dir: 'west', opposite: 'east' },
    ];

    for (const neighbor of neighbors) {
      const neighborTile = tiles.find((t) => t.x === neighbor.x && t.y === neighbor.y);
      if (!neighborTile) continue;

      const neighborInfo = await prisma.mapTile.findUnique({
        where: { id: neighborTile.tileId },
        select: { connections: true, category: true },
      });

      const neighborConnections = neighborInfo?.connections as unknown as ({ autoTile?: boolean; [key: string]: boolean | undefined } | null);
      if (!neighborConnections?.autoTile) continue;

      if (connections[neighbor.dir] && neighborConnections[neighbor.opposite]) {
        await emitToMapReaders(io, campaignId, mapId, 'tile:autotile:suggest', {
          mapId,
          layerId,
          x: neighbor.x,
          y: neighbor.y,
          direction: neighbor.dir,
        });
      }
    }
  } catch (error) {
    logger.warn('Auto-tiling failed', { err: error });
  }
}
