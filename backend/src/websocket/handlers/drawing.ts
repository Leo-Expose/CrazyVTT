// ============================================
// Drawing WebSocket Handlers
// Handles real-time drawing operations for Shmeppy-style map drawing
// ============================================

import { Server } from 'socket.io';
import { LayerType, Prisma } from '@prisma/client';
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

function asLayerDataObject(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

function isPlainPayload(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const VALID_LAYER_TYPES = new Set<string>(Object.values(LayerType));

export function registerDrawingHandlers(io: Server, socket: AuthenticatedSocket): void {
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
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'shape:draw')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can draw shapes' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerId, shape } = data;
      if (!mapId || !layerId || !shape || typeof shape.id !== 'string') {
        socket.emit('error', { message: 'mapId, layerId, and shape required' });
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
        if (layer.type !== 'ANNOTATIONS') {
          return { error: 'Shapes can only be drawn on annotation layers' } as const;
        }
        const currentData = asLayerDataObject(layer.data);
        const shapes = Array.isArray(currentData.shapes) ? [...(currentData.shapes as ShapeDefinition[])] : [];
        shapes.push(shape);

        await tx.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson({ ...currentData, shapes }) },
        });
        return { ok: true } as const;
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

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
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'shape:update')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can update shapes' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerId, shapeId, updates } = data;
      if (!mapId || !layerId || !shapeId || !isPlainPayload(updates)) {
        socket.emit('error', { message: 'mapId, layerId, shapeId, and updates required' });
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
        const existingShapes = Array.isArray(currentData.shapes) ? (currentData.shapes as ShapeDefinition[]) : [];
        const shapes = existingShapes.map((s) => (s.id === shapeId ? { ...s, ...updates, id: s.id } : s));

        await tx.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson({ ...currentData, shapes }) },
        });
        return { ok: true } as const;
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

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
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'shape:delete')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can delete shapes' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
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

      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "MapLayer" WHERE id = ${layerId} FOR UPDATE`;
        const layer = await tx.mapLayer.findUnique({ where: { id: layerId, mapId } });
        if (!layer) return { error: 'Layer not found' } as const;

        const currentData = asLayerDataObject(layer.data);
        const existingShapes = Array.isArray(currentData.shapes) ? (currentData.shapes as ShapeDefinition[]) : [];
        const shapes = existingShapes.filter((s) => s.id !== shapeId);

        await tx.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson({ ...currentData, shapes }) },
        });
        return { ok: true } as const;
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

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
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'drawing:stroke')) return;

      const canDraw = socket.role === 'DM' || await checkDrawPermission(socket);
      if (!canDraw) {
        socket.emit('error', { message: 'You do not have permission to draw' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerId, stroke } = data;
      if (!mapId || !layerId || !stroke || typeof stroke.id !== 'string') {
        socket.emit('error', { message: 'mapId, layerId, and stroke required' });
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
        if (layer.type !== 'ANNOTATIONS') {
          return { error: 'Freehand can only be drawn on annotation layers' } as const;
        }

        const currentData = asLayerDataObject(layer.data);
        const strokes = Array.isArray(currentData.strokes) ? [...(currentData.strokes as FreehandStroke[])] : [];
        strokes.push(stroke);

        await tx.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson({ ...currentData, strokes }) },
        });
        return { ok: true } as const;
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

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
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'text:place')) return;

      const canDraw = socket.role === 'DM' || await checkDrawPermission(socket);
      if (!canDraw) {
        socket.emit('error', { message: 'You do not have permission to place text' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerId, annotation } = data;
      if (!mapId || !layerId || !annotation || typeof annotation.id !== 'string') {
        socket.emit('error', { message: 'mapId, layerId, and annotation required' });
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
        if (layer.type !== 'ANNOTATIONS') {
          return { error: 'Text can only be placed on annotation layers' } as const;
        }

        const currentData = asLayerDataObject(layer.data);
        const texts = Array.isArray(currentData.texts) ? [...(currentData.texts as TextAnnotation[])] : [];
        texts.push(annotation);

        await tx.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson({ ...currentData, texts }) },
        });
        return { ok: true } as const;
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

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
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'image:upload')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can upload image maps' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, imageMap } = data;
      if (!mapId || !imageMap || typeof imageMap.assetId !== 'string') {
        socket.emit('error', { message: 'mapId and imageMap required' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const asset = await prisma.asset.findUnique({ where: { id: imageMap.assetId } });
      if (!asset) {
        socket.emit('error', { message: 'Asset not found' });
        return;
      }
      if (asset.campaignId && asset.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Asset does not belong to this campaign' });
        return;
      }

      const layerId = await prisma.$transaction(async (tx) => {
        let imageLayer = await tx.mapLayer.findFirst({
          where: { mapId, type: 'ANNOTATIONS' },
        });

        if (!imageLayer) {
          imageLayer = await tx.mapLayer.create({
            data: {
              mapId,
              name: 'Images',
              type: 'ANNOTATIONS',
              order: 999,
              visible: true,
              locked: false,
              data: toPrismaJson({ images: [] }),
            },
          });
        }

        await tx.$queryRaw`SELECT id FROM "MapLayer" WHERE id = ${imageLayer.id} FOR UPDATE`;
        const freshLayer = await tx.mapLayer.findUnique({ where: { id: imageLayer.id } });
        const currentData = asLayerDataObject(freshLayer?.data);
        const images = Array.isArray(currentData.images) ? [...(currentData.images as ImageMapData[])] : [];
        images.push(imageMap);

        await tx.mapLayer.update({
          where: { id: imageLayer.id },
          data: { data: toPrismaJson({ ...currentData, images }) },
        });
        return imageLayer.id;
      });

      await emitToMapReaders(io, socket.campaignId, mapId, 'image:placed', { mapId, layerId, imageMap });

      logger.info('image:upload', { mapId, imageId: imageMap.id, userId: socket.userId });
    } catch (error) {
      logger.error('image:upload failed', { err: error });
      socket.emit('error', { message: 'Failed to upload image' });
    }
  });

  /**
   * ERASE - Erase an element (tile, shape, stroke, text)
   * DM only
   */
  socket.on('erase', async (data: {
    mapId: string;
    layerId: string;
    type: 'tile' | 'shape' | 'stroke' | 'text' | 'image';
    id: string;
  }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'erase')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can erase' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, layerId, type, id } = data;
      if (!mapId || !layerId || !type || !id) {
        socket.emit('error', { message: 'mapId, layerId, type, and id required' });
        return;
      }
      if (!['tile', 'shape', 'stroke', 'text', 'image'].includes(type)) {
        socket.emit('error', { message: 'Invalid element type' });
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
        const dataKey = `${type}s`;
        const rawList = currentData[dataKey];
        if (!Array.isArray(rawList)) return { updated: false } as const;

        const filtered = rawList.filter((item) => {
          if (item !== null && typeof item === 'object' && 'id' in item) {
            return (item as { id?: unknown }).id !== id;
          }
          return true;
        });

        if (filtered.length === rawList.length) return { updated: false } as const;

        await tx.mapLayer.update({
          where: { id: layerId },
          data: { data: toPrismaJson({ ...currentData, [dataKey]: filtered }) },
        });
        return { updated: true } as const;
      });

      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }

      if (outcome.updated) {
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
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'map:undo')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can undo' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
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
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'map:redo')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can redo' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
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
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'layer:create')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can create layers' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
        return;
      }
      const { mapId, name, type, order } = data;
      if (!mapId || !name || !type) {
        socket.emit('error', { message: 'mapId, name, and type required' });
        return;
      }
      if (!VALID_LAYER_TYPES.has(type)) {
        socket.emit('error', { message: 'Invalid layer type' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      let layerOrder = typeof order === 'number' && Number.isInteger(order) ? order : 0;
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
          type: type as LayerType,
          order: layerOrder,
          visible: true,
          locked: false,
          data: toPrismaJson({}),
        },
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
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }
      if (!withinCeiling(socket, 'layer:merge-down')) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can merge layers' });
        return;
      }

      if (!isPlainPayload(data)) {
        socket.emit('error', { message: 'Invalid payload' });
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

      const updatedLayers = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "MapLayer" WHERE "mapId" = ${mapId} FOR UPDATE`;
        const layers = await tx.mapLayer.findMany({
          where: { mapId },
          orderBy: { order: 'asc' },
        });

        const layerIndex = layers.findIndex((l) => l.id === layerId);
        if (layerIndex <= 0) {
          return null;
        }

        const layer = layers[layerIndex];
        const layerBelow = layers[layerIndex - 1];

        const layerData = asLayerDataObject(layer.data);
        const mergedData = asLayerDataObject(layerBelow.data);

        for (const key of Object.keys(layerData)) {
          const incoming = layerData[key];
          if (Array.isArray(incoming)) {
            const existing = mergedData[key];
            mergedData[key] = Array.isArray(existing) ? [...existing, ...incoming] : [...incoming];
          }
        }

        await tx.mapLayer.update({
          where: { id: layerBelow.id },
          data: { data: toPrismaJson(mergedData) },
        });
        await tx.mapLayer.delete({ where: { id: layerId } });

        const remainingLayers = layers.filter((l) => l.id !== layerId);
        for (let index = 0; index < remainingLayers.length; index++) {
          await tx.mapLayer.update({
            where: { id: remainingLayers[index].id },
            data: { order: index },
          });
        }

        return tx.mapLayer.findMany({
          where: { mapId },
          orderBy: { order: 'asc' },
        });
      });

      if (!updatedLayers) {
        socket.emit('error', { message: 'Cannot merge bottom layer' });
        return;
      }

      await emitToMapReaders(io, socket.campaignId, mapId, 'layers:reordered', { mapId, layers: updatedLayers });

      logger.info('layer:merge-down', { mapId, layerId, userId: socket.userId });
    } catch (error) {
      logger.error('layer:merge-down failed', { err: error });
      socket.emit('error', { message: 'Failed to merge layer' });
    }
  });
}

async function checkDrawPermission(socket: AuthenticatedSocket): Promise<boolean> {
  if (!socket.campaignId || !socket.userId || socket.role === 'SPECTATOR') return false;

  const membership = await prisma.campaignMembership.findUnique({
    where: {
      userId_campaignId: {
        userId: socket.userId,
        campaignId: socket.campaignId,
      },
    },
    include: { campaign: true },
  });

  return membership?.campaign?.playersMayDraw ?? false;
}
