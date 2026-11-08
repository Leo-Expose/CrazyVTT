// ============================================
// Fog of War Shape Calculation Utilities (Frontend)
//
// Mirrors backend/src/services/fog/shapes.ts for client-side preview.
// All coordinates are in fog grid cells (row, col) with top-left origin.
// ============================================

import type { FogState } from '@/types/walls';

/** A point in fog grid coordinates (col, row) */
export interface FogPoint {
  col: number;
  row: number;
}

/** Shape parameters for different fog reveal types */
export interface ConeShapeParams {
  origin: FogPoint;           // Center of the cone's base
  direction: FogPoint;        // Direction vector (normalized not required)
  angleDegrees: number;       // Cone angle (e.g., 60 for burning hands)
  length: number;             // Length in grid cells (e.g., 15ft = 3 cells at 5ft/cell)
}

export interface RadiusShapeParams {
  center: FogPoint;           // Center of the circle
  radius: number;             // Radius in grid cells
}

export interface LineShapeParams {
  start: FogPoint;            // Start point
  end: FogPoint;              // End point
  width: number;              // Width in grid cells (e.g., 5ft = 1 cell)
}

export interface CubeShapeParams {
  origin: FogPoint;           // Bottom-left corner of the cube face
  size: number;               // Size in grid cells (cube is size x size)
  rotationDegrees?: number;   // Optional rotation around origin
}

export interface SphereShapeParams {
  center: FogPoint;           // Center of the sphere projection
  radius: number;             // Radius in grid cells
}

export interface CustomShapeParams {
  points: FogPoint[];         // Polygon vertices in order (closed automatically)
}

/** Union of all shape parameter types */
export type FogShapeParams =
  | { type: 'cone'; params: ConeShapeParams }
  | { type: 'radius'; params: RadiusShapeParams }
  | { type: 'line'; params: LineShapeParams }
  | { type: 'cube'; params: CubeShapeParams }
  | { type: 'sphere'; params: SphereShapeParams }
  | { type: 'custom'; params: CustomShapeParams };

/** Result of a shape calculation */
export interface FogShapeResult {
  cells: number[];            // Fog cell indices to reveal/hide
  bounds: { minCol: number; maxCol: number; minRow: number; maxRow: number };
}

/**
 * Calculate fog cells for a cone shape.
 * Cone originates from origin point, extends in direction for length cells,
 * with the given angle (in degrees) spread.
 */
export function calculateConeCells(
  fog: FogState,
  params: ConeShapeParams
): FogShapeResult {
  const { origin, direction, angleDegrees, length } = params;
  const { fogCols, fogRows } = fog;

  // Normalize direction
  const dirLen = Math.hypot(direction.col, direction.row);
  if (dirLen === 0) return { cells: [], bounds: { minCol: 0, maxCol: -1, minRow: 0, maxRow: -1 } };

  const dx = direction.col / dirLen;
  const dy = direction.row / dirLen;

  // Angle in radians, half-angle for spread
  const halfAngleRad = (angleDegrees / 2) * (Math.PI / 180);

  // Precompute cos for angle check
  const _cosHalfAngle = Math.cos(halfAngleRad);
  void _cosHalfAngle;

  const cells: number[] = [];
  let minCol = fogCols, maxCol = -1, minRow = fogRows, maxRow = -1;

  // Iterate over a bounding box around the cone
  const bboxRadius = Math.ceil(length + 1);
  const startCol = Math.max(0, Math.floor(origin.col - bboxRadius));
  const endCol = Math.min(fogCols - 1, Math.ceil(origin.col + bboxRadius));
  const startRow = Math.max(0, Math.floor(origin.row - bboxRadius));
  const endRow = Math.min(fogRows - 1, Math.ceil(origin.row + bboxRadius));

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const cellCol = col - origin.col;
      const cellRow = row - origin.row;

      // Distance from origin along direction
      const projDist = cellCol * dx + cellRow * dy;

      // Skip if behind origin or beyond length
      if (projDist < 0 || projDist > length) continue;

      // Perpendicular distance from center line
      const perpDist = Math.abs(cellCol * dy - cellRow * dx);

      // Max allowed perpendicular distance at this projection
      const maxPerp = projDist * Math.tan(halfAngleRad);

      if (perpDist <= maxPerp + 0.5) { // +0.5 for cell center inclusion
        const idx = row * fogCols + col;
        cells.push(idx);
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
      }
    }
  }

  return {
    cells,
    bounds: {
      minCol: minCol <= maxCol ? minCol : 0,
      maxCol: maxCol >= minCol ? maxCol : -1,
      minRow: minRow <= maxRow ? minRow : 0,
      maxRow: maxRow >= minRow ? maxRow : -1,
    },
  };
}

/**
 * Calculate fog cells for a radius/circle shape.
 */
export function calculateRadiusCells(
  fog: FogState,
  params: RadiusShapeParams
): FogShapeResult {
  const { center, radius } = params;
  const { fogCols, fogRows } = fog;

  const cells: number[] = [];
  let minCol = fogCols, maxCol = -1, minRow = fogRows, maxRow = -1;

  const rSquared = radius * radius;
  const startCol = Math.max(0, Math.floor(center.col - radius));
  const endCol = Math.min(fogCols - 1, Math.ceil(center.col + radius));
  const startRow = Math.max(0, Math.floor(center.row - radius));
  const endRow = Math.min(fogRows - 1, Math.ceil(center.row + radius));

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const dCol = col - center.col;
      const dRow = row - center.row;
      const distSquared = dCol * dCol + dRow * dRow;

      // Check if cell center is within radius (with 0.5 cell tolerance)
      if (distSquared <= rSquared + radius + 0.25) {
        const idx = row * fogCols + col;
        cells.push(idx);
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
      }
    }
  }

  return {
    cells,
    bounds: {
      minCol: minCol <= maxCol ? minCol : 0,
      maxCol: maxCol >= minCol ? maxCol : -1,
      minRow: minRow <= maxRow ? minRow : 0,
      maxRow: maxRow >= minRow ? maxRow : -1,
    },
  };
}

/**
 * Calculate fog cells for a line shape.
 * Line from start to end with given width (in cells).
 */
export function calculateLineCells(
  fog: FogState,
  params: LineShapeParams
): FogShapeResult {
  const { start, end, width } = params;
  const { fogCols, fogRows } = fog;

  const dx = end.col - start.col;
  const dy = end.row - start.row;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    // Degenerate to a radius around the point
    return calculateRadiusCells(fog, { center: start, radius: width / 2 });
  }

  // Unit direction vector
  const ux = dx / length;
  const uy = dy / length;

  // Perpendicular vector
  const px = -uy;
  const py = ux;

  const halfWidth = width / 2;

  const cells: number[] = [];
  let minCol = fogCols, maxCol = -1, minRow = fogRows, maxRow = -1;

  // Bounding box
  const minX = Math.min(start.col, end.col) - halfWidth - 1;
  const maxX = Math.max(start.col, end.col) + halfWidth + 1;
  const minY = Math.min(start.row, end.row) - halfWidth - 1;
  const maxY = Math.max(start.row, end.row) + halfWidth + 1;

  const startCol = Math.max(0, Math.floor(minX));
  const endCol = Math.min(fogCols - 1, Math.ceil(maxX));
  const startRow = Math.max(0, Math.floor(minY));
  const endRow = Math.min(fogRows - 1, Math.ceil(maxY));

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      // Vector from start to cell center
      const vx = col - start.col;
      const vy = row - start.row;

      // Project onto line
      const proj = vx * ux + vy * uy;

      // Skip if beyond line segment
      if (proj < -0.5 || proj > length + 0.5) continue;

      // Perpendicular distance
      const perp = Math.abs(vx * px + vy * py);

      if (perp <= halfWidth + 0.5) {
        const idx = row * fogCols + col;
        cells.push(idx);
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
      }
    }
  }

  return {
    cells,
    bounds: {
      minCol: minCol <= maxCol ? minCol : 0,
      maxCol: maxCol >= minCol ? maxCol : -1,
      minRow: minRow <= maxRow ? minRow : 0,
      maxRow: maxRow >= minRow ? maxRow : -1,
    },
  };
}

/**
 * Calculate fog cells for a cube/square shape.
 */
export function calculateCubeCells(
  fog: FogState,
  params: CubeShapeParams
): FogShapeResult {
  const { origin, size, rotationDegrees = 0 } = params;
  const { fogCols, fogRows } = fog;

  const cells: number[] = [];
  let minCol = fogCols, maxCol = -1, minRow = fogRows, maxRow = -1;

  if (rotationDegrees === 0) {
    // Simple axis-aligned square
    const startCol = Math.max(0, Math.floor(origin.col));
    const endCol = Math.min(fogCols - 1, Math.ceil(origin.col + size) - 1);
    const startRow = Math.max(0, Math.floor(origin.row));
    const endRow = Math.min(fogRows - 1, Math.ceil(origin.row + size) - 1);

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const idx = row * fogCols + col;
        cells.push(idx);
      }
    }

    minCol = startCol;
    maxCol = endCol;
    minRow = startRow;
    maxRow = endRow;
  } else {
    // Rotated square - use center as rotation pivot
    const centerCol = origin.col + size / 2;
    const centerRow = origin.row + size / 2;
    const halfSize = size / 2;
    const rad = rotationDegrees * (Math.PI / 180);
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    // Corners of unrotated square relative to center
    const corners = [
      { col: -halfSize, row: -halfSize },
      { col: halfSize, row: -halfSize },
      { col: halfSize, row: halfSize },
      { col: -halfSize, row: halfSize },
    ];

    // Rotate corners to get bounds
    let minCornerCol = Infinity, maxCornerCol = -Infinity;
    let minCornerRow = Infinity, maxCornerRow = -Infinity;
    for (const c of corners) {
      const rc = c.col * cosR - c.row * sinR + centerCol;
      const rr = c.col * sinR + c.row * cosR + centerRow;
      minCornerCol = Math.min(minCornerCol, rc);
      maxCornerCol = Math.max(maxCornerCol, rc);
      minCornerRow = Math.min(minCornerRow, rr);
      maxCornerRow = Math.max(maxCornerRow, rr);
    }

    const startCol = Math.max(0, Math.floor(minCornerCol));
    const endCol = Math.min(fogCols - 1, Math.ceil(maxCornerCol));
    const startRow = Math.max(0, Math.floor(minCornerRow));
    const endRow = Math.min(fogRows - 1, Math.ceil(maxCornerRow));

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        // Transform point to square's local coordinates
        const lc = col - centerCol;
        const lr = row - centerRow;
        const localCol = lc * cosR + lr * sinR;
        const localRow = -lc * sinR + lr * cosR;

        if (Math.abs(localCol) <= halfSize + 0.5 && Math.abs(localRow) <= halfSize + 0.5) {
          const idx = row * fogCols + col;
          cells.push(idx);
          minCol = Math.min(minCol, col);
          maxCol = Math.max(maxCol, col);
          minRow = Math.min(minRow, row);
          maxRow = Math.max(maxRow, row);
        }
      }
    }
  }

  return {
    cells,
    bounds: {
      minCol: minCol <= maxCol ? minCol : 0,
      maxCol: maxCol >= minCol ? maxCol : -1,
      minRow: minRow <= maxRow ? minRow : 0,
      maxRow: maxRow >= minRow ? maxRow : -1,
    },
  };
}

/**
 * Calculate fog cells for a sphere shape (projected as circle).
 * Same as radius for 2D projection.
 */
export function calculateSphereCells(
  fog: FogState,
  params: SphereShapeParams
): FogShapeResult {
  return calculateRadiusCells(fog, { center: params.center, radius: params.radius });
}

/**
 * Calculate fog cells for a custom polygon shape.
 * Uses even-odd rule for point-in-polygon test.
 */
export function calculateCustomCells(
  fog: FogState,
  params: CustomShapeParams
): FogShapeResult {
  const { points } = params;
  const { fogCols, fogRows } = fog;

  if (points.length < 3) return { cells: [], bounds: { minCol: 0, maxCol: -1, minRow: 0, maxRow: -1 } };

  // Close the polygon
  const closedPoints = [...points, points[0]];

  // Find bounding box
  let minCol = fogCols, maxCol = -1, minRow = fogRows, maxRow = -1;
  for (const p of points) {
    minCol = Math.min(minCol, Math.floor(p.col));
    maxCol = Math.max(maxCol, Math.ceil(p.col));
    minRow = Math.min(minRow, Math.floor(p.row));
    maxRow = Math.max(maxRow, Math.ceil(p.row));
  }

  minCol = Math.max(0, minCol);
  maxCol = Math.min(fogCols - 1, maxCol);
  minRow = Math.max(0, minRow);
  maxRow = Math.min(fogRows - 1, maxRow);

  const cells: number[] = [];

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      // Point-in-polygon test (even-odd rule)
      // Test at cell center
      const x = col + 0.5;
      const y = row + 0.5;
      let inside = false;

      for (let i = 0; i < closedPoints.length - 1; i++) {
        const p1 = closedPoints[i];
        const p2 = closedPoints[i + 1];

        // Check if edge crosses horizontal ray at y
        if ((p1.row <= y && p2.row > y) || (p1.row > y && p2.row <= y)) {
          // Compute intersection x coordinate
          const t = (y - p1.row) / (p2.row - p1.row);
          const ix = p1.col + t * (p2.col - p1.col);
          if (ix > x) inside = !inside;
        }
      }

      if (inside) {
        const idx = row * fogCols + col;
        cells.push(idx);
      }
    }
  }

  return {
    cells,
    bounds: {
      minCol: minCol <= maxCol ? minCol : 0,
      maxCol: maxCol >= minCol ? maxCol : -1,
      minRow: minRow <= maxRow ? minRow : 0,
      maxRow: maxRow >= minRow ? maxRow : -1,
    },
  };
}

/**
 * Main entry point: calculate fog cells for any shape type.
 */
export function calculateFogShapeCells(
  fog: FogState,
  shape: FogShapeParams
): FogShapeResult {
  switch (shape.type) {
    case 'cone':
      return calculateConeCells(fog, shape.params);
    case 'radius':
      return calculateRadiusCells(fog, shape.params);
    case 'line':
      return calculateLineCells(fog, shape.params);
    case 'cube':
      return calculateCubeCells(fog, shape.params);
    case 'sphere':
      return calculateSphereCells(fog, shape.params);
    case 'custom':
      return calculateCustomCells(fog, shape.params);
    default:
      return { cells: [], bounds: { minCol: 0, maxCol: -1, minRow: 0, maxRow: -1 } };
  }
}

/**
 * Validate shape parameters against fog grid bounds.
 */
export function validateShapeParams(
  fog: FogState,
  shape: FogShapeParams
): { valid: boolean; error?: string } {
  const { fogCols, fogRows } = fog;

  const checkPoint = (p: FogPoint, name: string) => {
    if (p.col < 0 || p.col >= fogCols || p.row < 0 || p.row >= fogRows) {
      return `${name} (${p.col}, ${p.row}) is outside fog grid (${fogCols}x${fogRows})`;
    }
    return null;
  };

  switch (shape.type) {
    case 'cone': {
      const err = checkPoint(shape.params.origin, 'origin');
      if (err) return { valid: false, error: err };
      if (shape.params.length <= 0) return { valid: false, error: 'Cone length must be positive' };
      if (shape.params.angleDegrees <= 0 || shape.params.angleDegrees > 360) {
        return { valid: false, error: 'Cone angle must be between 0 and 360 degrees' };
      }
      if (shape.params.direction.col === 0 && shape.params.direction.row === 0) {
        return { valid: false, error: 'Cone direction cannot be zero vector' };
      }
      break;
    }
    case 'radius':
    case 'sphere': {
      const err = checkPoint(shape.params.center, 'center');
      if (err) return { valid: false, error: err };
      if (shape.params.radius <= 0) return { valid: false, error: 'Radius must be positive' };
      break;
    }
    case 'line': {
      const err1 = checkPoint(shape.params.start, 'start');
      if (err1) return { valid: false, error: err1 };
      const err2 = checkPoint(shape.params.end, 'end');
      if (err2) return { valid: false, error: err2 };
      if (shape.params.width <= 0) return { valid: false, error: 'Line width must be positive' };
      break;
    }
    case 'cube': {
      const err = checkPoint(shape.params.origin, 'origin');
      if (err) return { valid: false, error: err };
      if (shape.params.size <= 0) return { valid: false, error: 'Cube size must be positive' };
      break;
    }
    case 'custom': {
      if (shape.params.points.length < 3) {
        return { valid: false, error: 'Custom polygon must have at least 3 points' };
      }
      for (let i = 0; i < shape.params.points.length; i++) {
        const err = checkPoint(shape.params.points[i], `point ${i}`);
        if (err) return { valid: false, error: err };
      }
      break;
    }
  }

  return { valid: true };
}

/**
 * Convert grid coordinates to fog cell index.
 */
export function fogCellIndex(col: number, row: number, fog: Pick<FogState, 'fogCols'>): number {
  return row * fog.fogCols + col;
}

/**
 * Convert fog cell index to grid coordinates.
 */
export function fogIndexToCell(index: number, fog: Pick<FogState, 'fogCols'>): FogPoint {
  return {
    col: index % fog.fogCols,
    row: Math.floor(index / fog.fogCols),
  };
}
