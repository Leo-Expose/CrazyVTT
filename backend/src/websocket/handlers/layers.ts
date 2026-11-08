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

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function registerLayerHandlers(io: Server, socket: AuthenticatedSocket): void {
  if (!socket.campaignId) return;

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
      if (!withinCeiling(socket, 'layer:update')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can update layers' });
        return;
      }

      const { mapId, layerId, ...updates } = data;
      if (!mapId || !layerId) {
        socket.emit('error', { message: 'mapId and layerId required' });
        return;
      }

      // Verify map belongs to campaign
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Update layer in database
      const layer = await prisma.mapLayer.update({
        where: { id: layerId, mapId },
        data: {
          ...updates,
          data: updates.data === undefined ? undefined : toPrismaJson(updates.data),
        }
      });

      // Broadcast to all campaign members
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
      if (!withinCeiling(socket, 'layer:reorder')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can reorder layers' });
        return;
      }

      const { mapId, layerIds } = data;
      if (!mapId || !Array.isArray(layerIds)) {
        socket.emit('error', { message: 'mapId and layerIds array required' });
        return;
      }

      // Verify map belongs to campaign
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Verify all layers belong to this map
      const layers = await prisma.mapLayer.findMany({
        where: { id: { in: layerIds }, mapId }
      });
      if (layers.length !== layerIds.length) {
        socket.emit('error', { message: 'One or more layers not found' });
        return;
      }

      // Update orders in transaction
      await prisma.$transaction(
        layerIds.map((id, index) =>
          prisma.mapLayer.update({ where: { id }, data: { order: index } })
        )
      );

      const updatedLayers = await prisma.mapLayer.findMany({
        where: { mapId },
        orderBy: { order: 'asc' }
      });

      // Broadcast reorder
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
      if (!withinCeiling(socket, 'layer:data:update')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can update layer data' });
        return;
      }

      const { mapId, layerId, tiles } = data;
      if (!mapId || !layerId || !Array.isArray(tiles)) {
        socket.emit('error', { message: 'mapId, layerId, and tiles array required' });
        return;
      }

      // Verify map belongs to campaign
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Verify layer exists and is a tile layer
      const layer = await prisma.mapLayer.findUnique({ where: { id: layerId, mapId } });
      if (!layer) {
        socket.emit('error', { message: 'Layer not found' });
        return;
      }

      const tileLayerTypes = ['TERRAIN', 'STRUCTURE', 'FURNITURE'];
      if (!tileLayerTypes.includes(layer.type)) {
        socket.emit('error', { message: 'This layer type does not support tile data' });
        return;
      }

      // Update layer data
      await prisma.mapLayer.update({
        where: { id: layerId },
        data: { data: toPrismaJson({ tiles }) }
      });

      // Broadcast to all campaign members
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
    autoTile?: boolean; // Trigger auto-tiling for neighbors
  }) => {
    try {
      if (!withinCeiling(socket, 'tile:place')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can place tiles' });
        return;
      }

      const { mapId, layerId, tileId, x, y, ...options } = data;
      if (!mapId || !layerId || !tileId || x === undefined || y === undefined) {
        socket.emit('error', { message: 'mapId, layerId, tileId, x, y required' });
        return;
      }

      // Verify map belongs to campaign
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Verify layer exists and is a tile layer
      const layer = await prisma.mapLayer.findUnique({ where: { id: layerId, mapId } });
      if (!layer) {
        socket.emit('error', { message: 'Layer not found' });
        return;
      }

      const tileLayerTypes = ['TERRAIN', 'STRUCTURE', 'FURNITURE'];
      if (!tileLayerTypes.includes(layer.type)) {
        socket.emit('error', { message: 'This layer type does not support tile placement' });
        return;
      }

      // Verify tile exists and belongs to campaign
      const tile = await prisma.mapTile.findFirst({ where: { id: tileId, campaignId: socket.campaignId } });
      if (!tile) {
        socket.emit('error', { message: 'Tile not found' });
        return;
      }

      // Get current tiles and add/update
      const currentData = layer.data as unknown as { tiles?: TilePlacement[] } | null;
      const tiles = currentData?.tiles || [];

      // Check if tile already exists at this position
      const existingIndex = tiles.findIndex((placed) => placed.x === x && placed.y === y);
      const newTile = { tileId, x, y, ...options };

      if (existingIndex >= 0) {
        tiles[existingIndex] = newTile;
      } else {
        tiles.push(newTile);
      }

      // Update layer data
      await prisma.mapLayer.update({
        where: { id: layerId },
        data: { data: toPrismaJson({ tiles }) }
      });

      // Broadcast to all campaign members
      await emitToMapReaders(io, socket.campaignId, mapId, 'tile:placed', { mapId, layerId, tile: newTile });

      // Handle auto-tiling if requested
      if (options.autoTile && tile.connections) {
        await handleAutoTiling(io, socket.campaignId, mapId, layerId, x, y, tiles);
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
      if (!withinCeiling(socket, 'tile:remove')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can remove tiles' });
        return;
      }

      const { mapId, layerId, x, y } = data;
      if (!mapId || !layerId || x === undefined || y === undefined) {
        socket.emit('error', { message: 'mapId, layerId, x, y required' });
        return;
      }

      // Verify map belongs to campaign
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const layer = await prisma.mapLayer.findUnique({ where: { id: layerId, mapId } });
      if (!layer) {
        socket.emit('error', { message: 'Layer not found' });
        return;
      }

      const currentData = layer.data as unknown as { tiles?: TilePlacement[] } | null;
      const tiles = (currentData?.tiles || []).filter((placed) => !(placed.x === x && placed.y === y));

      await prisma.mapLayer.update({
        where: { id: layerId },
        data: { data: toPrismaJson({ tiles }) }
      });

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
      if (!withinCeiling(socket, 'tile:rectangle')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can fill rectangles' });
        return;
      }

      const { mapId, layerId, tileId, x1, y1, x2, y2, ...options } = data;
      if (!mapId || !layerId || !tileId || x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
        socket.emit('error', { message: 'mapId, layerId, tileId, x1, y1, x2, y2 required' });
        return;
      }

      // Verify map belongs to campaign
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const layer = await prisma.mapLayer.findUnique({ where: { id: layerId, mapId } });
      if (!layer) {
        socket.emit('error', { message: 'Layer not found' });
        return;
      }

      const tileLayerTypes = ['TERRAIN', 'STRUCTURE', 'FURNITURE'];
      if (!tileLayerTypes.includes(layer.type)) {
        socket.emit('error', { message: 'This layer type does not support tile placement' });
        return;
      }

      const tile = await prisma.mapTile.findFirst({ where: { id: tileId, campaignId: socket.campaignId } });
      if (!tile) {
        socket.emit('error', { message: 'Tile not found' });
        return;
      }

      const currentData = layer.data as unknown as { tiles?: TilePlacement[] } | null;
      const tiles = currentData?.tiles || [];

      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      const placedTiles: TilePlacement[] = [];

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const existingIndex = tiles.findIndex((placed) => placed.x === x && placed.y === y);
          const newTile = { tileId, x, y, ...options };

          if (existingIndex >= 0) {
            tiles[existingIndex] = newTile;
          } else {
            tiles.push(newTile);
          }
          placedTiles.push(newTile);
        }
      }

      await prisma.mapLayer.update({
        where: { id: layerId },
        data: { data: toPrismaJson({ tiles }) }
      });

      await emitToMapReaders(io, socket.campaignId, mapId, 'tiles:placed', { mapId, layerId, tiles: placedTiles });

      logger.info('tile:rectangle', { mapId, layerId, tileId, count: placedTiles.length, userId: socket.userId });
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
    // Get the placed tile's connection rules
    const centerTile = tiles.find(t => t.x === centerX && t.y === centerY);
    if (!centerTile) return;

    const tileInfo = await prisma.mapTile.findUnique({
      where: { id: centerTile.tileId },
      select: { connections: true, category: true }
    });

    const connections = tileInfo?.connections as unknown as ({ autoTile?: boolean; [key: string]: boolean | undefined } | null);
    if (!connections?.autoTile) return;
    const neighbors = [
      { x: centerX, y: centerY - 1, dir: 'north', opposite: 'south' },
      { x: centerX, y: centerY + 1, dir: 'south', opposite: 'north' },
      { x: centerX + 1, y: centerY, dir: 'east', opposite: 'west' },
      { x: centerX - 1, y: centerY, dir: 'west', opposite: 'east' },
    ];

    // For each neighbor that has a tile, check if it should auto-tile
    for (const neighbor of neighbors) {
      const neighborTile = tiles.find(t => t.x === neighbor.x && t.y === neighbor.y);
      if (!neighborTile) continue;

      const neighborInfo = await prisma.mapTile.findUnique({
        where: { id: neighborTile.tileId },
        select: { connections: true, category: true }
      });

      const neighborConnections = neighborInfo?.connections as unknown as ({ autoTile?: boolean; [key: string]: boolean | undefined } | null);
      if (!neighborConnections?.autoTile) continue;

      // Check if connection rules match
      if (connections[neighbor.dir] && neighborConnections[neighbor.opposite]) {
        // Connection matches - could auto-select appropriate variant
        // For now, just notify clients
        await emitToMapReaders(io, campaignId, mapId, 'tile:autotile:suggest', {
          mapId,
          layerId,
          x: neighbor.x,
          y: neighbor.y,
          direction: neighbor.dir
        });
      }
    }
  } catch (error) {
    logger.warn('Auto-tiling failed', { err: error });
  }
}
