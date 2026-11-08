/**
 * Qualitative & Quantitative Spell AoE Geometry Calculations
 * Shared between backend and frontend.
 */

export enum AoEShape {
  CIRCLE = 'CIRCLE',
  CONE = 'CONE',
  LINE = 'LINE',
  CUBE = 'CUBE',
  SPHERE = 'SPHERE',
  CYLINDER = 'CYLINDER',
  HEMISPHERE = 'HEMISPHERE',
  CUSTOM = 'CUSTOM',
}

export type TemplateOrigin = 'intersection' | 'token_center' | 'self';

export interface AoETemplateSize {
  radius?: number;      // feet
  length?: number;      // feet
  width?: number;       // feet
  height?: number;      // feet
  side?: number;        // feet
  points?: Array<{ x: number; y: number }>; // Custom points (feet from origin)
}

export interface AoETemplateDefinition {
  id: string;
  name: string;
  shape: AoEShape;
  size: AoETemplateSize;
  origin: TemplateOrigin;
  gridSnap: boolean;
  color: string;
  isDefault: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface GridSquare {
  x: number; // grid column (0-indexed)
  y: number; // grid row (0-indexed)
}

export interface TokenTarget {
  id: string;
  name: string;
  x: number; // grid units
  y: number; // grid units
  size?: number; // default 1 (1x1 square)
}

export interface AffectedTokenResult {
  tokenId: string;
  tokenName: string;
  coverageRatio: number; // 0 to 1
  isAffected: boolean;
}

/**
 * Default spell templates per system
 */
export const DEFAULT_SPELL_TEMPLATES: Record<string, AoETemplateDefinition[]> = {
  DND_5E: [
    {
      id: 'dnd5e-fireball',
      name: 'Fireball',
      shape: AoEShape.CIRCLE,
      size: { radius: 20 },
      origin: 'intersection',
      gridSnap: true,
      color: '#ef4444',
      isDefault: true,
    },
    {
      id: 'dnd5e-burning-hands',
      name: 'Burning Hands',
      shape: AoEShape.CONE,
      size: { length: 15 },
      origin: 'self',
      gridSnap: true,
      color: '#f97316',
      isDefault: true,
    },
    {
      id: 'dnd5e-lightning-bolt',
      name: 'Lightning Bolt',
      shape: AoEShape.LINE,
      size: { length: 100, width: 5 },
      origin: 'self',
      gridSnap: true,
      color: 'rgb(59, 130, 246)',
      isDefault: true,
    },
    {
      id: 'dnd5e-thunderwave',
      name: 'Thunderwave',
      shape: AoEShape.CUBE,
      size: { side: 15 },
      origin: 'self',
      gridSnap: true,
      color: '#a855f7',
      isDefault: true,
    },
    {
      id: 'dnd5e-spirit-guardians',
      name: 'Spirit Guardians',
      shape: AoEShape.CIRCLE,
      size: { radius: 15 },
      origin: 'token_center',
      gridSnap: false,
      color: '#eab308',
      isDefault: true,
    },
    {
      id: 'dnd5e-wall-of-fire',
      name: 'Wall of Fire',
      shape: AoEShape.LINE,
      size: { length: 60, width: 5, height: 20 },
      origin: 'intersection',
      gridSnap: true,
      color: '#dc2626',
      isDefault: true,
    },
    {
      id: 'dnd5e-globe-of-invulnerability',
      name: 'Globe of Invulnerability',
      shape: AoEShape.HEMISPHERE,
      size: { radius: 10 },
      origin: 'token_center',
      gridSnap: false,
      color: '#06b6d4',
      isDefault: true,
    },
  ],
  PATHFINDER_2E: [
    {
      id: 'pf2e-fireball',
      name: 'Fireball',
      shape: AoEShape.CIRCLE,
      size: { radius: 20 },
      origin: 'intersection',
      gridSnap: true,
      color: '#ef4444',
      isDefault: true,
    },
    {
      id: 'pf2e-cone-of-cold',
      name: 'Cone of Cold',
      shape: AoEShape.CONE,
      size: { length: 60 },
      origin: 'self',
      gridSnap: true,
      color: '#0284c7',
      isDefault: true,
    },
    {
      id: 'pf2e-lightning-bolt',
      name: 'Lightning Bolt',
      shape: AoEShape.LINE,
      size: { length: 120, width: 5 },
      origin: 'self',
      gridSnap: true,
      color: 'rgb(59, 130, 246)',
      isDefault: true,
    },
    {
      id: 'pf2e-force-bolt',
      name: 'Force Bolt',
      shape: AoEShape.LINE,
      size: { length: 30, width: 5 },
      origin: 'self',
      gridSnap: true,
      color: '#8b5cf6',
      isDefault: true,
    },
  ],
};

/**
 * Snap point to grid intersection (corner of grid cells)
 */
export function snapToIntersection(point: Point, feetPerGrid = 5): Point {
  return {
    x: Math.round(point.x / feetPerGrid) * feetPerGrid,
    y: Math.round(point.y / feetPerGrid) * feetPerGrid,
  };
}

/**
 * Snap point to grid cell center
 */
export function snapToCellCenter(point: Point, feetPerGrid = 5): Point {
  return {
    x: (Math.floor(point.x / feetPerGrid) + 0.5) * feetPerGrid,
    y: (Math.floor(point.y / feetPerGrid) + 0.5) * feetPerGrid,
  };
}

/**
 * Normalizes an angle into [-PI, PI]
 */
function normalizeAngle(rad: number): number {
  let a = rad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Check if a 2D point (in feet) falls inside the AoE shape.
 */
export function isPointInsideAoE(
  point: Point,
  shape: AoEShape,
  size: AoETemplateSize,
  origin: Point,
  angleRad = 0
): boolean {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distSq = dx * dx + dy * dy;
  const dist = Math.sqrt(distSq);

  switch (shape) {
    case AoEShape.CIRCLE:
    case AoEShape.SPHERE:
    case AoEShape.CYLINDER:
    case AoEShape.HEMISPHERE: {
      const radius = size.radius || 0;
      return dist <= radius;
    }

    case AoEShape.CONE: {
      const length = size.length || 0;
      if (dist > length || dist < 0.001) return dist <= length && dist > 0;
      // D&D 5e standard cone has a 53.13 degree spread (width = length at distance L)
      // or standard 90/60 degree cone. We use standard 53.13° (half-angle ~26.56° / atan(0.5))
      // or 90° arc. In 5e DMG: "A cone's width at a given point along its length is equal to that point's distance from the point of origin."
      // That means half angle is atan(0.5) = 26.565 degrees (~0.4636 radians).
      const pointAngle = Math.atan2(dy, dx);
      const angleDiff = Math.abs(normalizeAngle(pointAngle - angleRad));
      const coneHalfAngle = Math.atan(0.5); // 26.565 deg
      return angleDiff <= coneHalfAngle;
    }

    case AoEShape.LINE: {
      const length = size.length || 0;
      const width = size.width || 5;
      const halfWidth = width / 2;

      // Rotate point back by -angleRad so the line extends along the positive X axis
      const cos = Math.cos(-angleRad);
      const sin = Math.sin(-angleRad);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      return localX >= 0 && localX <= length && Math.abs(localY) <= halfWidth;
    }

    case AoEShape.CUBE: {
      const side = size.side || 0;
      // In 5e: "You select a cube's point of origin, which lies anywhere on a face of the cubic effect."
      // Rotated cube extending forwards along angleRad
      const cos = Math.cos(-angleRad);
      const sin = Math.sin(-angleRad);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      return localX >= 0 && localX <= side && Math.abs(localY) <= side / 2;
    }

    case AoEShape.CUSTOM: {
      const pts = size.points || [];
      if (pts.length < 3) return false;
      // Ray-casting algorithm
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = origin.x + pts[i].x, yi = origin.y + pts[i].y;
        const xj = origin.x + pts[j].x, yj = origin.y + pts[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y))
          && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    default:
      return false;
  }
}

/**
 * Calculates sample-based coverage ratio (0 to 1) of a square grid cell or token area
 * by taking a 3x3 (or NxN) subgrid of probe points.
 */
export function calculateCoverageRatio(
  topLeftFeet: Point,
  widthFeet: number,
  heightFeet: number,
  shape: AoEShape,
  size: AoETemplateSize,
  originFeet: Point,
  angleRad = 0,
  samplesPerAxis = 3
): number {
  let insideCount = 0;
  const total = samplesPerAxis * samplesPerAxis;
  const stepX = widthFeet / samplesPerAxis;
  const stepY = heightFeet / samplesPerAxis;

  for (let ix = 0; ix < samplesPerAxis; ix++) {
    for (let iy = 0; iy < samplesPerAxis; iy++) {
      const probe: Point = {
        x: topLeftFeet.x + (ix + 0.5) * stepX,
        y: topLeftFeet.y + (iy + 0.5) * stepY,
      };
      if (isPointInsideAoE(probe, shape, size, originFeet, angleRad)) {
        insideCount++;
      }
    }
  }

  return insideCount / total;
}

/**
 * Find all tokens affected by the spell template according to game system rules.
 * D&D 5e: DMG p.251 says a square is affected if at least 50% of it is covered (coverageRatio >= 0.5).
 * PF2e / Standard: any substantial overlap (>= 0.1) or >= 50% based on rule strictness.
 */
export function findAffectedTokens(
  template: {
    shape: AoEShape;
    size: AoETemplateSize;
  },
  originFeet: Point,
  angleRad: number,
  tokens: TokenTarget[],
  feetPerGrid = 5,
  thresholdRatio = 0.499 // DMG 50% rule with float epsilon
): AffectedTokenResult[] {
  return tokens.map((token) => {
    const tokenSizeSquares = token.size || 1;
    const widthFeet = tokenSizeSquares * feetPerGrid;
    const heightFeet = tokenSizeSquares * feetPerGrid;
    const topLeftFeet: Point = {
      x: token.x * feetPerGrid,
      y: token.y * feetPerGrid,
    };

    const coverage = calculateCoverageRatio(
      topLeftFeet,
      widthFeet,
      heightFeet,
      template.shape,
      template.size,
      originFeet,
      angleRad,
      Math.max(3, tokenSizeSquares * 2)
    );

    return {
      tokenId: token.id,
      tokenName: token.name,
      coverageRatio: Math.round(coverage * 100) / 100,
      isAffected: coverage >= thresholdRatio,
    };
  });
}
