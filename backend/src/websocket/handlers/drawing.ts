// ============================================
// Drawing WebSocket Handlers
// Handles real-time drawing operations for Shmeppy-style map drawing
// ============================================

import { Server } from 'socket.io';
import { Prisma } from '@prisma/client';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { emitToMapReaders } from '../utils';
import { withinCeiling } from '../shared';
import logger from '../../utils/logger';

interface ShapeDefinition {
  id: string;
  type: 'rect' | 'circle' | 'polygon' | 'line' | 'arrow';
  points: Array<[number, number]>;
  color: string;
  fillColor?: string;
  strokeWidth: number;
  label?: string;
  labelPosition?: { x: number; y: number };
  rotation: number;
  locked: boolean;
}

interface FreehandStroke {
  id: string;
  points: Array<[number, number]>;
  color: string;
  strokeWidth: number;
}

interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  rotation: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
}

interface ImageMapData {
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
  gridAligned: boolean;
  gridSize?: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function registerDrawingHandlers(io: Server, socket: AuthenticatedSocket): void {
  if (!socket.campaignId) return;

  /**
   * SHAPE.DRAW - Draw a shape on a layer
   * DM only
   */
  socket.on('shape:draw', async (data: {
    mapId: string;
    layerId: string;
    shape: ShapeDefinition;
  }) => {
    try {
      if (!withinCeiling(socket, 'shape:draw')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can draw shapes' });
        return;
      }

      const { mapId, layerId, shape } = data;
      if (!mapId || !layerId || !shape) {
        socket.emit('error', { message: 'mapId, layerId, and shape required' });
        return;
      }

      // Verify map belongs to campaign
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Verify layer exists and is an annotations layer
      const layer = await prisma.mapLayer.findUnique({ where: { id: layerId, mapId } });
      if (!layer) {
        socket.emit('error', { message: 'Layer not found' });
        return;
      }

      if (layer.type !== 'ANNOTATIONS') {
        socket.emit('error', { message: 'Shapes can only be drawn on annotation layers' });
        return;
      }

      // Get current shapes and add new one
      const currentData = layer.data as unknown as { shapes?: ShapeDefinition[] } | null;
      const shapes = currentData?.shapes || [];
      shapes.push(shape);

      // Update layer data
      await prisma.mapLayer.update({
        where: { id: layerId },
        data: { data: toPrismaJson({ shapes }) }
      });

      // Broadcast to all campaign members
      await emitToMapReaders(io, socket.campaignId, mapId, 'shape:drawn', { mapId, layerId, shape });

      logger.info('shape:draw', { mapId, layerId, shapeId: shape.id, userId: socket.userId });
    } catch (error) {
      logger.error('shape:draw failed', { err: error });
      socket.emit('error', { message: 'Failed to draw shape' });
    }
  });

  /**
   * SHAPE.UPDATE - Update an existing shape
   * DM only
   */
  socket.on('shape:update', async (data: {
    mapId: string;
    layerId: string;
    shapeId: string;
    updates: Partial<ShapeDefinition>;
  }) => {
    try {
      if (!withinCeiling(socket, 'shape:update')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can update shapes' });
        return;
      }

      const { mapId, layerId, shapeId, updates } = data;
      if (!mapId || !layerId || !shapeId) {
        socket.emit('error', { message: 'mapId, layerId, and shapeId required' });
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

      const currentData = layer.data as unknown as { shapes?: ShapeDefinition[] } | null;
      const shapes = (currentData?.shapes || []).map(s => s.id === shapeId ? { ...s, ...updates } : s);

      await prisma.mapLayer.update({
        where: { id: layerId },
        data: { data: toPrismaJson({ shapes }) }
      });

      await emitToMapReaders(io, socket.campaignId, mapId, 'shape:updated', { mapId, layerId, shapeId, updates });

      logger.info('shape:update', { mapId, layerId, shapeId, userId: socket.userId });
    } catch (error) {
      logger.error('shape:update failed', { err: error });
      socket.emit('error', { message: 'Failed to update shape' });
    }
  });

  /**
   * SHAPE.DELETE - Delete a shape
   * DM only
   */
  socket.on('shape:delete', async (data: { mapId: string; layerId: string; shapeId: string }) => {
    try {
      if (!withinCeiling(socket, 'shape:delete')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can delete shapes' });
        return;
      }

      const { mapId, layerId, shapeId } = data;
      if (!mapId || !layerId || !shapeId) {
        socket.emit('error', { message: 'mapId, layerId, and shapeId required' });
        return;
      }

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

      const currentData = layer.data as unknown as { shapes?: ShapeDefinition[] } | null;
      const shapes = (currentData?.shapes || []).filter(s => s.id !== shapeId);

      await prisma.mapLayer.update({
        where: { id: layerId },
        data: { data: toPrismaJson({ shapes }) }
      });

      await emitToMapReaders(io, socket.campaignId, mapId, 'shape:deleted', { mapId, layerId, shapeId });

      logger.info('shape:delete', { mapId, layerId, shapeId, userId: socket.userId });
    } catch (error) {
      logger.error('shape:delete failed', { err: error });
      socket.emit('error', { message: 'Failed to delete shape' });
    }
  });

  /**
   * DRAWING.STROKE - Freehand stroke
   * DM only (or players with draw permission)
   */
  socket.on('drawing:stroke', async (data: {
    mapId: string;
    layerId: string;
    stroke: FreehandStroke;
  }) => {
    try {
      if (!withinCeiling(socket, 'drawing:stroke')) return;

      // Check permissions - DM or player with draw permission
      const canDraw = socket.role === 'DM' || await checkDrawPermission(socket);
      if (!canDraw) {
        socket.emit('error', { message: 'You do not have permission to draw' });
        return;
      }

      const { mapId, layerId, stroke } = data;
      if (!mapId || !layerId || !stroke) {
        socket.emit('error', { message: 'mapId, layerId, and stroke required' });
        return;
      }

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

      if (layer.type !== 'ANNOTATIONS') {
        socket.emit('error', { message: 'Freehand can only be drawn on annotation layers' });
        return;
      }

      const currentData = layer.data as unknown as { strokes?: FreehandStroke[] } | null;
      const strokes = currentData?.strokes || [];
      strokes.push(stroke);

      await prisma.mapLayer.update({
        where: { id: layerId },
        data: { data: toPrismaJson({ strokes }) }
      });

      await emitToMapReaders(io, socket.campaignId, mapId, 'stroke:drawn', { mapId, layerId, stroke });

      logger.info('drawing:stroke', { mapId, layerId, strokeId: stroke.id, userId: socket.userId });
    } catch (error) {
      logger.error('drawing:stroke failed', { err: error });
      socket.emit('error', { message: 'Failed to draw stroke' });
    }
  });

  /**
   * TEXT.PLACE - Place text annotation
   * DM only (or players with draw permission)
   */
  socket.on('text:place', async (data: {
    mapId: string;
    layerId: string;
    annotation: TextAnnotation;
  }) => {
    try {
      if (!withinCeiling(socket, 'text:place')) return;

      const canDraw = socket.role === 'DM' || await checkDrawPermission(socket);
      if (!canDraw) {
        socket.emit('error', { message: 'You do not have permission to place text' });
        return;
      }

      const { mapId, layerId, annotation } = data;
      if (!mapId || !layerId || !annotation) {
        socket.emit('error', { message: 'mapId, layerId, and annotation required' });
        return;
      }

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

      if (layer.type !== 'ANNOTATIONS') {
        socket.emit('error', { message: 'Text can only be placed on annotation layers' });
        return;
      }

      const currentData = layer.data as unknown as { texts?: TextAnnotation[] } | null;
      const texts = currentData?.texts || [];
      texts.push(annotation);

      await prisma.mapLayer.update({
        where: { id: layerId },
        data: { data: toPrismaJson({ texts }) }
      });

      await emitToMapReaders(io, socket.campaignId, mapId, 'text:placed', { mapId, layerId, annotation });

      logger.info('text:place', { mapId, layerId, annotationId: annotation.id, userId: socket.userId });
    } catch (error) {
      logger.error('text:place failed', { err: error });
      socket.emit('error', { message: 'Failed to place text' });
    }
  });

  /**
   * IMAGE.UPLOAD - Upload and place an image map
   * DM only
   */
  socket.on('image:upload', async (data: {
    mapId: string;
    imageMap: ImageMapData;
  }) => {
    try {
      if (!withinCeiling(socket, 'image:upload')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can upload image maps' });
        return;
      }

      const { mapId, imageMap } = data;
      if (!mapId || !imageMap) {
        socket.emit('error', { message: 'mapId and imageMap required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Verify asset exists
      const asset = await prisma.asset.findUnique({ where: { id: imageMap.assetId } });
      if (!asset) {
        socket.emit('error', { message: 'Asset not found' });
        return;
      }

      // Get or create an IMAGE layer for this map
      let imageLayer = await prisma.mapLayer.findFirst({
        where: { mapId, type: 'ANNOTATIONS' } // Using annotations layer for images
      });

      if (!imageLayer) {
        imageLayer = await prisma.mapLayer.create({
          data: {
            mapId,
            name: 'Images',
            type: 'ANNOTATIONS',
            order: 999, // Top layer
            visible: true,
            locked: false,
            data: toPrismaJson({ images: [] }),
          }
        });
      }

      const currentData = imageLayer.data as unknown as { images?: ImageMapData[] } | null;
      const images = currentData?.images || [];
      images.push(imageMap);

      await prisma.mapLayer.update({
        where: { id: imageLayer.id },
        data: { data: toPrismaJson({ images }) }
      });

      await emitToMapReaders(io, socket.campaignId, mapId, 'image:placed', { mapId, layerId: imageLayer.id, imageMap });

      logger.info('image:upload', { mapId, imageId: imageMap.id, userId: socket.userId });
    } catch (error) {
      logger.error('image:upload failed', { err: error });
      socket.emit('error', { message: 'Failed to upload image' });
    }
  });

  /**
   * ERASE - Erase an element (tile, shape, stroke, text)
   * DM only (or owner)
   */
  socket.on('erase', async (data: {
    mapId: string;
    layerId: string;
    type: 'tile' | 'shape' | 'stroke' | 'text' | 'image';
    id: string;
  }) => {
    try {
      if (!withinCeiling(socket, 'erase')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can erase' });
        return;
      }

      const { mapId, layerId, type, id } = data;
      if (!mapId || !layerId || !type || !id) {
        socket.emit('error', { message: 'mapId, layerId, type, and id required' });
        return;
      }

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

      const currentData = layer.data as unknown as Record<string, unknown[]> | null;
      if (!currentData) return;

      let updated = false;
      const dataKey = `${type}s`; // tiles, shapes, strokes, texts, images
      if (currentData[dataKey]) {
        const items = currentData[dataKey];
        const filtered = items.filter((item: any) => item.id !== id);
        if (filtered.length !== items.length) {
          currentData[dataKey] = filtered;
          updated = true;
        }
      }

      if (updated) {
        await prisma.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson(currentData) }
        });

        await emitToMapReaders(io, socket.campaignId, mapId, 'erased', { mapId, layerId, type, id });
      }

      logger.info('erase', { mapId, layerId, type, id, userId: socket.userId });
    } catch (error) {
      logger.error('erase failed', { err: error });
      socket.emit('error', { message: 'Failed to erase' });
    }
  });

  /**
   * MAP.UNDO - Undo last action
   * DM only
   */
  socket.on('map:undo', async (data: { mapId: string; entryId: string }) => {
    try {
      if (!withinCeiling(socket, 'map:undo')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can undo' });
        return;
      }

      const { mapId, entryId } = data;
      if (!mapId || !entryId) {
        socket.emit('error', { message: 'mapId and entryId required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // In a full implementation, this would look up the history entry and reverse it
      // For now, broadcast the undo event
      await emitToMapReaders(io, socket.campaignId, mapId, 'map:undone', { mapId, entryId });

      logger.info('map:undo', { mapId, entryId, userId: socket.userId });
    } catch (error) {
      logger.error('map:undo failed', { err: error });
      socket.emit('error', { message: 'Failed to undo' });
    }
  });

  /**
   * MAP.REDO - Redo last undone action
   * DM only
   */
  socket.on('map:redo', async (data: { mapId: string; entryId: string }) => {
    try {
      if (!withinCeiling(socket, 'map:redo')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can redo' });
        return;
      }

      const { mapId, entryId } = data;
      if (!mapId || !entryId) {
        socket.emit('error', { message: 'mapId and entryId required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Broadcast the redo event
      await emitToMapReaders(io, socket.campaignId, mapId, 'map:redone', { mapId, entryId });

      logger.info('map:redo', { mapId, entryId, userId: socket.userId });
    } catch (error) {
      logger.error('map:redo failed', { err: error });
      socket.emit('error', { message: 'Failed to redo' });
    }
  });

  /**
   * LAYER.CREATE - Create a new layer
   * DM only
   */
  socket.on('layer:create', async (data: {
    mapId: string;
    name: string;
    type: string;
    order?: number;
  }) => {
    try {
      if (!withinCeiling(socket, 'layer:create')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can create layers' });
        return;
      }

      const { mapId, name, type, order } = data;
      if (!mapId || !name || !type) {
        socket.emit('error', { message: 'mapId, name, and type required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Determine order if not provided
      let layerOrder = order ?? 0;
      if (order === undefined) {
        const maxOrder = await prisma.mapLayer.aggregate({
          where: { mapId },
          _max: { order: true },
        });
        layerOrder = (maxOrder._max.order ?? -1) + 1;
      }

      const layer = await prisma.mapLayer.create({
        data: {
          mapId,
          name,
          type: type as any,
          order: layerOrder,
          visible: true,
          locked: false,
          data: toPrismaJson({}),
        }
      });

      await emitToMapReaders(io, socket.campaignId, mapId, 'layer:added', { mapId, layer });

      logger.info('layer:create', { mapId, layerId: layer.id, userId: socket.userId });
    } catch (error) {
      logger.error('layer:create failed', { err: error });
      socket.emit('error', { message: 'Failed to create layer' });
    }
  });

  /**
   * LAYER.MERGE_DOWN - Merge a layer into the one below it
   * DM only
   */
  socket.on('layer:merge-down', async (data: { mapId: string; layerId: string }) => {
    try {
      if (!withinCeiling(socket, 'layer:merge-down')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can merge layers' });
        return;
      }

      const { mapId, layerId } = data;
      if (!mapId || !layerId) {
        socket.emit('error', { message: 'mapId and layerId required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Get all layers ordered
      const layers = await prisma.mapLayer.findMany({
        where: { mapId },
        orderBy: { order: 'asc' },
      });

      const layerIndex = layers.findIndex(l => l.id === layerId);
      if (layerIndex <= 0) {
        socket.emit('error', { message: 'Cannot merge bottom layer' });
        return;
      }

      const layer = layers[layerIndex];
      const layerBelow = layers[layerIndex - 1];

      // Merge data from layer into layerBelow
      const layerData = layer.data as Record<string, unknown>;
      const belowData = layerBelow.data as Record<string, unknown>;
      
      // Merge arrays (tiles, shapes, strokes, texts, images)
      const mergedData = { ...belowData };
      for (const key of Object.keys(layerData)) {
        if (Array.isArray(layerData[key]) && Array.isArray(mergedData[key])) {
          mergedData[key] = [...mergedData[key], ...layerData[key]];
        }
      }

      await prisma.$transaction([
        prisma.mapLayer.update({
          where: { id: layerBelow.id },
          data: { data: toPrismaJson(mergedData) }
        }),
        prisma.mapLayer.delete({ where: { id: layerId } }),
      ]);

      // Reorder remaining layers
      const remainingLayers = layers.filter(l => l.id !== layerId);
      await prisma.$transaction(
        remainingLayers.map((l, index) =>
          prisma.mapLayer.update({ where: { id: l.id }, data: { order: index } })
        )
      );

      const updatedLayers = await prisma.mapLayer.findMany({
        where: { mapId },
        orderBy: { order: 'asc' }
      });

      await emitToMapReaders(io, socket.campaignId, mapId, 'layers:reordered', { mapId, layers: updatedLayers });

      logger.info('layer:merge-down', { mapId, layerId, userId: socket.userId });
    } catch (error) {
      logger.error('layer:merge-down failed', { err: error });
      socket.emit('error', { message: 'Failed to merge layer' });
    }
  });
}

async function checkDrawPermission(socket: AuthenticatedSocket): Promise<boolean> {
  // Check if player has draw permission for the campaign
  if (!socket.campaignId || !socket.userId) return false;
  
  const membership = await prisma.campaignMembership.findUnique({
    where: {
      userId_campaignId: {
        userId: socket.userId,
        campaignId: socket.campaignId,
      }
    },
    include: { campaign: true }
  });
  
  return membership?.campaign?.playersMayDraw ?? false;
}