import type { WallSegment } from '@/types/walls';

/** Wall tools draw in grid squares; stored wall coordinates are map pixels. */
export function gridWallToMap(wall: WallSegment, gridSize: number): WallSegment {
  return {
    ...wall,
    x1: wall.x1 * gridSize,
    y1: wall.y1 * gridSize,
    x2: wall.x2 * gridSize,
    y2: wall.y2 * gridSize,
  };
}
