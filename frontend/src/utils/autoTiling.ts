// ============================================
// Auto-Tiling Engine - Wang Tile Auto-Tiling
// ============================================

export interface WangConnections {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
  autoTile: boolean;
}
type Direction = 'north' | 'south' | 'east' | 'west';

export interface TileDefinition {
  id: string;
  name: string;
  category: string;
  connections: WangConnections;
  // For 47-tile set: specific variant for each connection pattern
  variants?: Record<number, string>; // pattern -> assetId
}

/**
 * Wang Tile Auto-Tiling Engine
 * Supports both 16-tile (basic) and 47-tile (full corners/T-junctions/crosses) sets
 */
export class AutoTilingEngine {
  private tileSet: Map<string, TileDefinition> = new Map();

  /**
   * Register a tile definition
   */
  registerTile(tile: TileDefinition): void {
    this.tileSet.set(tile.id, tile);
  }

  /**
   * Register multiple tiles at once
   */
  registerTiles(tiles: TileDefinition[]): void {
    for (const tile of tiles) {
      this.registerTile(tile);
    }
  }

  /**
   * Compute the connection pattern for a tile at (x, y)
   * Returns a 4-bit value: N=1, S=2, E=4, W=8
   */
  computePattern(
    grid: Map<string, string>, // key: "x,y" -> tileId
    x: number,
    y: number,
    tileId: string
  ): number {
    const tile = this.tileSet.get(tileId);
    if (!tile || !tile.connections.autoTile) return 0;

    let pattern = 0;
    const neighbors = [
      { x, y: y - 1, dir: 'north' as Direction, bit: 1 },
      { x, y: y + 1, dir: 'south' as Direction, bit: 2 },
      { x: x + 1, y, dir: 'east' as Direction, bit: 4 },
      { x: x - 1, y, dir: 'west' as Direction, bit: 8 },
    ];

    for (const neighbor of neighbors) {
      const neighborId = grid.get(`${neighbor.x},${neighbor.y}`);
      if (neighborId) {
        const neighborTile = this.tileSet.get(neighborId);
        if (neighborTile?.connections.autoTile) {
          // Check if both tiles have connecting edges
          const oppositeDir = this.getOppositeDirection(neighbor.dir);
          if (tile.connections[neighbor.dir] && neighborTile.connections[oppositeDir]) {
            pattern |= neighbor.bit;
          }
        }
      }
    }

    return pattern;
  }

  /**
   * Get the opposite direction
   */
  private getOppositeDirection(dir: Direction): Direction {
    const opposites: Record<Direction, Direction> = {
      north: 'south',
      south: 'north',
      east: 'west',
      west: 'east',
    };
    return opposites[dir];
  }

  /**
   * Auto-tile a region of the grid
   * Returns a map of position -> recommended tile variant
   */
  autoTileRegion(
    grid: Map<string, string>,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): Map<string, { tileId: string; pattern: number }> {
    const results = new Map<string, { tileId: string; pattern: number }>();

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = `${x},${y}`;
        const tileId = grid.get(key);
        if (tileId) {
          const pattern = this.computePattern(grid, x, y, tileId);
          results.set(key, { tileId, pattern });
        }
      }
    }

    return results;
  }

  /**
   * Get the best tile variant for a given pattern
   * For 47-tile set, this maps patterns to specific corner/T-junction/cross tiles
   */
  getTileForPattern(baseTileId: string, pattern: number): string | null {
    const tile = this.tileSet.get(baseTileId);
    if (!tile) return null;

    // If tile has explicit variants for patterns, use them
    if (tile.variants && tile.variants[pattern]) {
      return tile.variants[pattern];
    }

    // Otherwise return base tile (will be rotated/flipped by renderer)
    return baseTileId;
  }

  /**
   * Compute the required rotation/flip for a pattern
   * Returns transformation to apply to base tile
   */
  getTransformForPattern(pattern: number): { rotation: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean } {
    // This is a simplified mapping for basic 16-tile set
    // For 47-tile set, each pattern would map to a specific pre-made tile
    
    // Count connections
    const connections = [
      pattern & 1, // north
      pattern & 2, // south
      pattern & 4, // east
      pattern & 8, // west
    ].filter(Boolean).length;

    // For single connections (dead ends), no rotation needed for straight tiles
    // For corners, we need to rotate
    if (connections === 2) {
      // Check if it's a corner (adjacent connections)
      const hasN = Boolean(pattern & 1);
      const hasS = Boolean(pattern & 2);
      const hasE = Boolean(pattern & 4);
      const hasW = Boolean(pattern & 8);

      if (hasN && hasE) return { rotation: 0, flipH: false, flipV: false };      // NE corner
      if (hasE && hasS) return { rotation: 90, flipH: false, flipV: false };     // SE corner
      if (hasS && hasW) return { rotation: 180, flipH: false, flipV: false };    // SW corner
      if (hasW && hasN) return { rotation: 270, flipH: false, flipV: false };    // NW corner
      
      // Straight pieces
      if (hasN && hasS) return { rotation: 0, flipH: false, flipV: false };      // Vertical
      if (hasE && hasW) return { rotation: 90, flipH: false, flipV: false };     // Horizontal
    }

    // For 3 connections (T-junctions)
    if (connections === 3) {
      const hasN = Boolean(pattern & 1);
      const hasS = Boolean(pattern & 2);
      const hasE = Boolean(pattern & 4);
      const hasW = Boolean(pattern & 8);

      if (!hasN) return { rotation: 0, flipH: false, flipV: false };      // T pointing up (missing north)
      if (!hasE) return { rotation: 90, flipH: false, flipV: false };     // T pointing right (missing east)
      if (!hasS) return { rotation: 180, flipH: false, flipV: false };    // T pointing down (missing south)
      if (!hasW) return { rotation: 270, flipH: false, flipV: false };    // T pointing left (missing west)
    }

    // For 4 connections (cross)
    if (connections === 4) {
      return { rotation: 0, flipH: false, flipV: false };
    }

    // For 1 connection (dead end)
    if (connections === 1) {
      const hasN = pattern & 1;
      const hasE = pattern & 4;
      const hasS = pattern & 2;
      const hasW = pattern & 8;

      if (hasN) return { rotation: 0, flipH: false, flipV: false };
      if (hasE) return { rotation: 90, flipH: false, flipV: false };
      if (hasS) return { rotation: 180, flipH: false, flipV: false };
      if (hasW) return { rotation: 270, flipH: false, flipV: false };
    }

    return { rotation: 0, flipH: false, flipV: false };
  }

  /**
   * Create a standard 16-tile Wang set from a single base tile
   * This generates all 16 connection patterns
   */
  static create16TileSet(baseTileId: string, connections: WangConnections): TileDefinition[] {
    const tiles: TileDefinition[] = [];
    
    for (let pattern = 0; pattern < 16; pattern++) {
      const hasN = Boolean(pattern & 1);
      const hasS = Boolean(pattern & 2);
      const hasE = Boolean(pattern & 4);
      const hasW = Boolean(pattern & 8);

      // Only create tiles that match the base tile's connection capabilities
      const valid = 
        (!hasN || connections.north) &&
        (!hasS || connections.south) &&
        (!hasE || connections.east) &&
        (!hasW || connections.west);

      if (valid) {
        tiles.push({
          id: `${baseTileId}_pattern_${pattern}`,
          name: `${baseTileId} pattern ${pattern}`,
          category: 'AUTO',
          connections: {
            north: hasN,
            south: hasS,
            east: hasE,
            west: hasW,
            autoTile: true,
          },
        });
      }
    }

    return tiles;
  }

  /**
   * Create a standard 47-tile Wang set
   * Includes: 1 blank, 4 straights, 4 corners, 4 T-junctions, 1 cross, 4 dead-ends, 4 edge-caps, 4 diagonal-corners, 4 diagonal-Ts, 4 diagonal-crosses, 4 inverted-corners, 8 more...
   * This is a complex mapping - in practice you'd provide the 47 specific tile assets
   */
  static create47TileSetDefinitions(): TileDefinition[] {
    // This would be implemented with actual tile assets
    // For now, return empty - user must provide the 47 tile definitions
    return [];
  }
}

/**
 * Utility function to compute auto-tiling for a tile placement
 * This is the main entry point used by the Tile Stamp Tool
 */
export function computeAutoTile(
  grid: Map<string, string>,
  tileDefinitions: Map<string, TileDefinition>,
  x: number,
  y: number,
  placedTileId: string
): { tileId: string; transform: { rotation: number; flipH: boolean; flipV: boolean } } | null {
  const engine = new AutoTilingEngine();
  engine.registerTiles(Array.from(tileDefinitions.values()));

  const pattern = engine.computePattern(grid, x, y, placedTileId);
  if (pattern === 0) return null;

  const transform = engine.getTransformForPattern(pattern);
  const tileId = engine.getTileForPattern(placedTileId, pattern);

  return { tileId: tileId || placedTileId, transform };
}

/**
 * Compute auto-tiling for all neighbors of a placed tile
 * Returns updates for neighboring tiles that should change
 */
export function computeNeighborUpdates(
  grid: Map<string, string>,
  tileDefinitions: Map<string, TileDefinition>,
  x: number,
  y: number,
  _placedTileId: string
): Array<{ x: number; y: number; tileId: string; transform: { rotation: number; flipH: boolean; flipV: boolean } }> {
  const engine = new AutoTilingEngine();
  engine.registerTiles(Array.from(tileDefinitions.values()));

  const updates: Array<{ x: number; y: number; tileId: string; transform: { rotation: number; flipH: boolean; flipV: boolean } }> = [];
  const neighbors = [
    { x, y: y - 1 },
    { x, y: y + 1 },
    { x: x + 1, y },
    { x: x - 1, y },
  ];

  for (const neighbor of neighbors) {
    const neighborTileId = grid.get(`${neighbor.x},${neighbor.y}`);
    if (neighborTileId) {
      const result = computeAutoTile(grid, tileDefinitions, neighbor.x, neighbor.y, neighborTileId);
      if (result) {
        updates.push({ x: neighbor.x, y: neighbor.y, ...result });
      }
    }
  }

  return updates;
}
