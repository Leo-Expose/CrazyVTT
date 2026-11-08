// ============================================
// Reachable Area Calculator Tests (Phase 6)
// ============================================

import { calculateReachableArea, getPathToTarget, isSquareReachable, getMovementCost } from '../reachableArea';
import type { Token, TerrainType } from '../../../types/index.js';

describe('calculateReachableArea', () => {
  const createTestToken = (overrides: Partial<Token> = {}): Token => ({
    id: 'test-token',
    characterId: null,
    name: 'Test Token',
    imageUrl: '',
    position: { x: 5, y: 5 },
    size: { width: 1, height: 1 },
    layer: 'token',
    visible: true,
    controlledBy: 'user-1',
    rotation: 0,
    conditions: [],
    metadata: {},
    type: 'player',
    disposition: 'friendly',
    hp: { current: 30, max: 30, temp: 0 },
    showHpBar: true,
    movement: {
      speed: 30,
      movementMode: 'walk',
      remainingThisTurn: 30,
      usedThisTurn: 0,
      difficultTerrainMultiplier: 1,
      threatenedSquares: [],
      reach: 5,
    },
    ...overrides,
  });
  
  const createTestMap = (overrides: Partial<{ width: number; height: number; gridSize: number; feetPerSquare: number }> = {}) => ({
    width: 20,
    height: 20,
    gridSize: 50,
    feetPerSquare: 5,
    ...overrides,
  });
  
  const createTerrainGrid = (width: number, height: number, fill: TerrainType = 'normal') => ({
    width,
    height,
    gridSize: 50,
    terrain: new Array(width * height).fill(fill),
  });
  
  it('should calculate reachable squares for normal terrain', () => {
    const token = createTestToken({ position: { x: 10, y: 10 } });
    const map = createTestMap();
    const terrainGrid = createTerrainGrid(20, 20, 'normal');
    
    const result = calculateReachableArea({
      token,
      map,
      terrainGrid,
    });
    
    // Speed 30ft = 6 squares at 5ft/square
    // With alternating diagonal rule, we should reach roughly 6 squares orthogonally
    expect(result.reachable.length).toBeGreaterThan(0);
    expect(result.movementMode).toBe('walk');
    
    // Check that orthogonal squares up to 6 away are reachable
    const orthogonalReachable = result.reachable.filter(s => 
      (s.x === 10 && Math.abs(s.y - 10) <= 6) ||
      (s.y === 10 && Math.abs(s.x - 10) <= 6)
    );
    expect(orthogonalReachable.length).toBeGreaterThanOrEqual(6);
  });
  
  it('should respect difficult terrain (2x cost)', () => {
    const token = createTestToken({ position: { x: 10, y: 10 } });
    const map = createTestMap();
    const terrainGrid = createTerrainGrid(20, 20, 'difficult');
    
    const result = calculateReachableArea({
      token,
      map,
      terrainGrid,
    });
    
    // With difficult terrain, speed 30ft = 3 squares
    const orthogonalReachable = result.reachable.filter(s => 
      (s.x === 10 && Math.abs(s.y - 10) <= 3) ||
      (s.y === 10 && Math.abs(s.x - 10) <= 3)
    );
    expect(orthogonalReachable.length).toBeGreaterThanOrEqual(3);
    
    // All reachable squares should be marked as difficult
    expect(result.reachable.every(s => s.isDifficult)).toBe(true);
  });
  
  it('should ignore difficult terrain when override is set', () => {
    const token = createTestToken({ position: { x: 10, y: 10 } });
    const map = createTestMap();
    const terrainGrid = createTerrainGrid(20, 20, 'difficult');
    
    const result = calculateReachableArea({
      token,
      map,
      terrainGrid,
      ignoreDifficultTerrain: true,
    });
    
    // Should reach same as normal terrain
    const orthogonalReachable = result.reachable.filter(s => 
      (s.x === 10 && Math.abs(s.y - 10) <= 6) ||
      (s.y === 10 && Math.abs(s.x - 10) <= 6)
    );
    expect(orthogonalReachable.length).toBeGreaterThanOrEqual(6);
  });
  
  it('should not allow movement through impassable terrain', () => {
    const token = createTestToken({ position: { x: 10, y: 10 } });
    const map = createTestMap();
    const terrainGrid = createTerrainGrid(20, 20, 'normal');
    
    // Make a wall of impassable terrain
    for (let y = 0; y < 20; y++) {
      terrainGrid.terrain[y * 20 + 12] = 'impassable';
    }
    
    const result = calculateReachableArea({
      token,
      map,
      terrainGrid,
    });
    
    // No squares beyond x=12 should be reachable
    const beyondWall = result.reachable.filter(s => s.x > 12);
    expect(beyondWall.length).toBe(0);
  });
  
  it('should allow fly mode to ignore impassable terrain', () => {
    const token = createTestToken({ 
      position: { x: 10, y: 10 },
      movement: {
        speed: 30,
        flySpeed: 60,
        movementMode: 'fly',
        remainingThisTurn: 60,
        usedThisTurn: 0,
        difficultTerrainMultiplier: 1,
        threatenedSquares: [],
        reach: 5,
      }
    });
    const map = createTestMap();
    const terrainGrid = createTerrainGrid(20, 20, 'normal');
    
    // Make a wall of impassable terrain
    for (let y = 0; y < 20; y++) {
      terrainGrid.terrain[y * 20 + 12] = 'impassable';
    }
    
    const result = calculateReachableArea({
      token,
      map,
      terrainGrid,
    });
    
    // Fly should be able to pass over impassable terrain
    const beyondWall = result.reachable.filter(s => s.x > 12);
    expect(beyondWall.length).toBeGreaterThan(0);
  });
  
  it('should calculate correct path costs', () => {
    const token = createTestToken({ position: { x: 10, y: 10 } });
    const map = createTestMap();
    const terrainGrid = createTerrainGrid(20, 20, 'normal');
    
    const result = calculateReachableArea({
      token,
      map,
      terrainGrid,
    });
    
    // Direct orthogonal neighbor should cost 5ft
    const neighbor = result.reachable.find(s => s.x === 11 && s.y === 10);
    expect(neighbor).toBeDefined();
    expect(neighbor?.cost).toBe(5);
    
    // Two squares away should cost 10ft
    const twoAway = result.reachable.find(s => s.x === 12 && s.y === 10);
    expect(twoAway).toBeDefined();
    expect(twoAway?.cost).toBe(10);
  });
  
  it('should apply prone condition (half speed)', () => {
    const token = createTestToken({ 
      position: { x: 10, y: 10 },
      conditions: ['prone'],
    });
    const map = createTestMap();
    const terrainGrid = createTerrainGrid(20, 20, 'normal');
    
    const result = calculateReachableArea({
      token,
      map,
      terrainGrid,
    });
    
    // Prone halves speed: 30 -> 15ft = 3 squares
    const orthogonalReachable = result.reachable.filter(s => 
      (s.x === 10 && Math.abs(s.y - 10) <= 3) ||
      (s.y === 10 && Math.abs(s.x - 10) <= 3)
    );
    expect(orthogonalReachable.length).toBeGreaterThanOrEqual(3);
  });
  
  it('should apply restrained condition (0 speed)', () => {
    const token = createTestToken({ 
      position: { x: 10, y: 10 },
      conditions: ['restrained'],
    });
    const map = createTestMap();
    const terrainGrid = createTerrainGrid(20, 20, 'normal');
    
    const result = calculateReachableArea({
      token,
      map,
      terrainGrid,
    });
    
    // Restrained = 0 speed
    expect(result.reachable.length).toBe(0);
  });
});

describe('getPathToTarget', () => {
  const createTestToken = (): Token => ({
    id: 'test-token',
    characterId: null,
    name: 'Test Token',
    imageUrl: '',
    position: { x: 10, y: 10 },
    size: { width: 1, height: 1 },
    layer: 'token',
    visible: true,
    controlledBy: 'user-1',
    rotation: 0,
    conditions: [],
    metadata: {},
    type: 'player',
    disposition: 'friendly',
    hp: { current: 30, max: 30, temp: 0 },
    showHpBar: true,
    movement: {
      speed: 30,
      movementMode: 'walk',
      remainingThisTurn: 30,
      usedThisTurn: 0,
      difficultTerrainMultiplier: 1,
      threatenedSquares: [],
      reach: 5,
    },
  });
  
  const createTestMap = () => ({
    width: 20,
    height: 20,
    gridSize: 50,
    feetPerSquare: 5,
  });
  
  const createTerrainGrid = (width: number, height: number) => ({
    width,
    height,
    gridSize: 50,
    terrain: new Array(width * height).fill('normal'),
  });
  
  it('should return path to reachable target', () => {
    const token = createTestToken();
    const map = createTestMap();
    const terrainGrid = createTerrainGrid(20, 20);
    
    const result = calculateReachableArea({ token, map, terrainGrid });
    const path = getPathToTarget(result, 12, 10);
    
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    expect(path![0]).toEqual({ x: 10, y: 10 });
    expect(path![path!.length - 1]).toEqual({ x: 12, y: 10 });
  });
  
  it('should return null for unreachable target', () => {
    const token = createTestToken();
    const map = createTestMap();
    const terrainGrid = createTerrainGrid(20, 20);
    
    // Make target unreachable with impassable terrain
    for (let y = 0; y < 20; y++) {
      terrainGrid.terrain[y * 20 + 12] = 'impassable';
    }
    
    const result = calculateReachableArea({ token, map, terrainGrid });
    const path = getPathToTarget(result, 15, 10);
    
    expect(path).toBeNull();
  });
});

describe('isSquareReachable', () => {
  const createTestToken = (): Token => ({
    id: 'test-token',
    characterId: null,
    name: 'Test Token',
    imageUrl: '',
    position: { x: 10, y: 10 },
    size: { width: 1, height: 1 },
    layer: 'token',
    visible: true,
    controlledBy: 'user-1',
    rotation: 0,
    conditions: [],
    metadata: {},
    type: 'player',
    disposition: 'friendly',
    hp: { current: 30, max: 30, temp: 0 },
    showHpBar: true,
    movement: {
      speed: 30,
      movementMode: 'walk',
      remainingThisTurn: 30,
      usedThisTurn: 0,
      difficultTerrainMultiplier: 1,
      threatenedSquares: [],
      reach: 5,
    },
  });
  
  it('should return true for reachable squares', () => {
    const token = createTestToken();
    const map = { width: 20, height: 20, gridSize: 50, feetPerSquare: 5 };
    const terrainGrid = { width: 20, height: 20, gridSize: 50, terrain: new Array(400).fill('normal') };
    
    const result = calculateReachableArea({ token, map, terrainGrid });
    
    expect(isSquareReachable(result, 11, 10)).toBe(true);
    expect(isSquareReachable(result, 15, 10)).toBe(true);
  });
  
  it('should return false for unreachable squares', () => {
    const token = createTestToken();
    const map = { width: 20, height: 20, gridSize: 50, feetPerSquare: 5 };
    const terrainGrid = { width: 20, height: 20, gridSize: 50, terrain: new Array(400).fill('normal') };
    
    // Beyond 30ft (6 squares)
    const result = calculateReachableArea({ token, map, terrainGrid });
    
    expect(isSquareReachable(result, 17, 10)).toBe(false);
  });
});

describe('getMovementCost', () => {
  const createTestToken = (): Token => ({
    id: 'test-token',
    characterId: null,
    name: 'Test Token',
    imageUrl: '',
    position: { x: 10, y: 10 },
    size: { width: 1, height: 1 },
    layer: 'token',
    visible: true,
    controlledBy: 'user-1',
    rotation: 0,
    conditions: [],
    metadata: {},
    type: 'player',
    disposition: 'friendly',
    hp: { current: 30, max: 30, temp: 0 },
    showHpBar: true,
    movement: {
      speed: 30,
      movementMode: 'walk',
      remainingThisTurn: 30,
      usedThisTurn: 0,
      difficultTerrainMultiplier: 1,
      threatenedSquares: [],
      reach: 5,
    },
  });
  
  it('should return correct cost for reachable squares', () => {
    const token = createTestToken();
    const map = { width: 20, height: 20, gridSize: 50, feetPerSquare: 5 };
    const terrainGrid = { width: 20, height: 20, gridSize: 50, terrain: new Array(400).fill('normal') };
    
    const result = calculateReachableArea({ token, map, terrainGrid });
    
    expect(getMovementCost(result, 11, 10)).toBe(5);
    expect(getMovementCost(result, 12, 10)).toBe(10);
  });
  
  it('should return null for unreachable squares', () => {
    const token = createTestToken();
    const map = { width: 20, height: 20, gridSize: 50, feetPerSquare: 5 };
    const terrainGrid = { width: 20, height: 20, gridSize: 50, terrain: new Array(400).fill('normal') };
    
    const result = calculateReachableArea({ token, map, terrainGrid });
    
    expect(getMovementCost(result, 20, 10)).toBeNull();
  });
});
