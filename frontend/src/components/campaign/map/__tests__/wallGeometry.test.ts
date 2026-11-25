import { describe, expect, it } from 'vitest';
import { gridWallToMap } from '../wallGeometry';

describe('gridWallToMap', () => {
  it('converts both endpoints from grid squares to map pixels', () => {
    expect(gridWallToMap({ id: 'a', type: 'door-closed', x1: 2, y1: 1.5, x2: 3, y2: 1.5 }, 50)).toEqual({
      id: 'a', type: 'door-closed', x1: 100, y1: 75, x2: 150, y2: 75,
    });
  });
});
