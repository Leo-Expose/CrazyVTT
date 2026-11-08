// ============================================
// Reachable Area Calculator (Phase 6)
// A* pathfinding with terrain costs for D&D 5e movement
// ============================================

import type { Token, TerrainType } from '../../types/index.js';

export interface TerrainGrid {
  width: number;
  height: number;
  gridSize: number; // feet per square (default 5)
  // Flat array: index = y * width + x
  terrain: TerrainType[];
  // Optional: hazardous terrain damage info
  hazards?: Array<{
    index: number;
    damageType: string;
    damageExpression: string; // e.g., "1d6"
  }>;
}

export interface ReachableSquare {
  x: number;
  y: number;
  cost: number; // Movement cost in feet
  path: { x: number; y: number }[]; // Path from start to this square
  isDifficult: boolean;
  isHazardous: boolean;
  hazardDamage?: { type: string; amount: string };
}

export interface ReachableAreaResult {
  reachable: ReachableSquare[];
  speedUsed: number;
  movementMode: string;
}

export interface MovementCalculationOptions {
  token: Token;
  map: { width: number; height: number; gridSize: number; feetPerSquare: number };
  terrainGrid: TerrainGrid;
  // DM overrides
  ignoreDifficultTerrain?: boolean;
  ignoreHazardousTerrain?: boolean;
  ignoreAllTerrain?: boolean; // For teleport
  grantExtraMovement?: number; // Extra feet this turn
  useSpeedOverride?: number; // Override token's speed
}

/**
 * Get the movement speed for a token based on its movement mode
 */
function getMovementSpeed(token: Token, mode: string, overrideSpeed?: number): number {
  if (overrideSpeed !== undefined) return overrideSpeed;
  
  const movement = token.movement;
  if (!movement) return 30; // Default
  
  switch (mode) {
    case 'fly':
      return movement.flySpeed ?? movement.speed;
    case 'swim':
      return movement.swimSpeed ?? Math.floor(movement.speed / 2);
    case 'climb':
      return movement.climbSpeed ?? Math.floor(movement.speed / 2);
    case 'burrow':
      return movement.burrowSpeed ?? Math.floor(movement.speed / 2);
    case 'teleport':
      return movement.speed; // Teleport uses base speed as range
    case 'walk':
    default:
      return movement.speed;
  }
}

/**
 * Get the terrain cost multiplier for a movement mode
 */
function getTerrainMultiplier(mode: string, terrainType: TerrainType, ignoreDifficult: boolean, ignoreHazardous: boolean): number {
  // Teleport ignores all terrain
  if (mode === 'teleport') return 1;
  
  switch (terrainType) {
    case 'normal':
      return 1;
    case 'difficult':
      return ignoreDifficult ? 1 : 2;
    case 'hazardous':
      return ignoreHazardous ? 1 : 2; // Hazardous is also difficult terrain
    case 'impassable':
      return Infinity;
    default:
      return 1;
  }
}

/**
 * Check if a movement mode can traverse a terrain type
 */
function canTraverse(mode: string, terrainType: TerrainType): boolean {
  // Teleport can go anywhere (line of sight permitting, checked separately)
  if (mode === 'teleport') return true;
  
  // Fly ignores ground-based difficult/impassable terrain
  if (mode === 'fly' && terrainType === 'impassable') return true;
  if (mode === 'fly' && terrainType === 'difficult') return true;
  
  // Swim: water is normal, land is difficult
  // This would need water/land classification - simplified here
  
  // Climb: vertical surfaces - simplified
  
  // Burrow: solid is normal
  if (mode === 'burrow' && terrainType === 'impassable') return true;
  
  return terrainType !== 'impassable';
}

/**
 * A* pathfinding to calculate reachable squares
 */
export function calculateReachableArea(options: MovementCalculationOptions): ReachableAreaResult {
  const { token, map, terrainGrid, ignoreDifficultTerrain, ignoreHazardousTerrain, ignoreAllTerrain, grantExtraMovement, useSpeedOverride } = options;
  
  const movement = token.movement;
  const mode = movement?.movementMode ?? 'walk';
  const baseSpeed = getMovementSpeed(token, mode, useSpeedOverride);
  const speed = baseSpeed + (grantExtraMovement ?? 0);
  
  // Apply condition modifiers (prone = half speed, etc.)
  let effectiveSpeed = speed;
  if (token.conditions?.includes('prone')) {
    // Prone: crawling costs extra, but for movement calculation we halve speed
    effectiveSpeed = Math.floor(effectiveSpeed / 2);
  }
  if (token.conditions?.includes('restrained') || token.conditions?.includes('grappled')) {
    effectiveSpeed = 0;
  }
  if (token.conditions?.includes('paralyzed') || token.conditions?.includes('stunned') || token.conditions?.includes('unconscious')) {
    effectiveSpeed = 0;
  }
  
  // Encumbrance check (from Phase 5)
  // This would come from character sheet - simplified here
  // If heavily encumbered: speed - 10 (min 0)
  // If encumbered: speed - 10
  
  const maxMovementFeet = effectiveSpeed;
  const feetPerSquare = map.feetPerSquare ?? 5;
  
  const startX = token.position.x;
  const startY = token.position.y;
  const startIndex = startY * terrainGrid.width + startX;
  
  // A* data structures
  interface Node {
    x: number;
    y: number;
    index: number;
    gCost: number; // Cost from start
    fCost: number; // gCost + heuristic
    parent: Node | null;
  }
  
  const openSet: Node[] = [];
  const closedSet = new Set<number>();
  const nodeMap = new Map<number, Node>();
  
  // Start node
  const startNode: Node = {
    x: startX,
    y: startY,
    index: startIndex,
    gCost: 0,
    fCost: 0,
    parent: null,
  };
  
  openSet.push(startNode);
  nodeMap.set(startIndex, startNode);
  
  // Directions: 8-way movement (including diagonals)
  const directions = [
    { dx: 0, dy: -1 }, // North
    { dx: 1, dy: -1 }, // NE
    { dx: 1, dy: 0 },  // East
    { dx: 1, dy: 1 },  // SE
    { dx: 0, dy: 1 },  // South
    { dx: -1, dy: 1 }, // SW
    { dx: -1, dy: 0 }, // West
    { dx: -1, dy: -1 }, // NW
  ];
  
  // For diagonal movement cost (D&D 5e: first diagonal = 5ft, second = 10ft, alternating)
  // We'll use the "alternating" rule by default
  let diagonalCount = 0;
  
  while (openSet.length > 0) {
    // Find node with lowest fCost
    let currentIndex = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].fCost < openSet[currentIndex].fCost) {
        currentIndex = i;
      }
    }
    
    const current = openSet[currentIndex];
    
    // Remove from open set
    openSet.splice(currentIndex, 1);
    closedSet.add(current.index);
    
    // If we've exceeded movement range, skip expanding
    if (current.gCost > maxMovementFeet) continue;
    
    // Check neighbors
    for (let dirIndex = 0; dirIndex < directions.length; dirIndex++) {
      const dir = directions[dirIndex];
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      
      // Bounds check
      if (nx < 0 || nx >= terrainGrid.width || ny < 0 || ny >= terrainGrid.height) continue;
      
      const nIndex = ny * terrainGrid.width + nx;
      
      // Skip if already evaluated
      if (closedSet.has(nIndex)) continue;
      
      // Check terrain
      const terrainType = terrainGrid.terrain[nIndex] ?? 'normal';
      
      // Check if we can traverse this terrain
      if (!canTraverse(mode, terrainType)) continue;
      
      // Calculate movement cost
      let moveCost = feetPerSquare; // Base cost per square
      
      // Diagonal movement
      const isDiagonal = dir.dx !== 0 && dir.dy !== 0;
      if (isDiagonal) {
        // Check for corner cutting (can't move diagonally past two blocked corners)
        const ortho1Index = current.y * terrainGrid.width + nx;
        const ortho2Index = ny * terrainGrid.width + current.x;
        const ortho1Terrain = terrainGrid.terrain[ortho1Index] ?? 'normal';
        const ortho2Terrain = terrainGrid.terrain[ortho2Index] ?? 'normal';
        
        if (!canTraverse(mode, ortho1Terrain) && !canTraverse(mode, ortho2Terrain)) {
          continue; // Can't cut corners
        }
        
        // D&D 5e alternating diagonal rule
        diagonalCount++;
        moveCost = (diagonalCount % 2 === 1) ? feetPerSquare : feetPerSquare * 2;
      } else {
        diagonalCount = 0; // Reset on orthogonal move
      }
      
      // Apply terrain multiplier
      const terrainMultiplier = ignoreAllTerrain ? 1 : getTerrainMultiplier(mode, terrainType, ignoreDifficultTerrain ?? false, ignoreHazardousTerrain ?? false);
      moveCost *= terrainMultiplier;
      
      const newGCost = current.gCost + moveCost;
      
      // Skip if exceeds movement range
      if (newGCost > maxMovementFeet) continue;
      
      // Get or create neighbor node
      let neighbor = nodeMap.get(nIndex);
      if (!neighbor) {
        neighbor = {
          x: nx,
          y: ny,
          index: nIndex,
          gCost: Infinity,
          fCost: Infinity,
          parent: null,
        };
        nodeMap.set(nIndex, neighbor);
      }
      
      // If this path is better
      if (newGCost < neighbor.gCost) {
        neighbor.gCost = newGCost;
        neighbor.parent = current;
        
        // Heuristic: Manhattan distance * feetPerSquare (admissible)
        const hCost = (Math.abs(nx - startX) + Math.abs(ny - startY)) * feetPerSquare;
        neighbor.fCost = neighbor.gCost + hCost;
        
        // Add to open set if not already there
        if (!openSet.includes(neighbor)) {
          openSet.push(neighbor);
        }
      }
    }
  }
  
  // Build reachable squares from explored nodes
  const reachable: ReachableSquare[] = [];
  
  for (const node of nodeMap.values()) {
    if (node.gCost <= maxMovementFeet && node.gCost > 0) { // Exclude start position
      // Reconstruct path
      const path: { x: number; y: number }[] = [];
      let pathNode: Node | null = node;
      while (pathNode) {
        path.unshift({ x: pathNode.x, y: pathNode.y });
        pathNode = pathNode.parent;
      }
      
      const terrainType = terrainGrid.terrain[node.index] ?? 'normal';
      const hazard = terrainGrid.hazards?.find(h => h.index === node.index);
      
      reachable.push({
        x: node.x,
        y: node.y,
        cost: node.gCost,
        path,
        isDifficult: terrainType === 'difficult' || terrainType === 'hazardous',
        isHazardous: terrainType === 'hazardous',
        hazardDamage: hazard ? { type: hazard.damageType, amount: hazard.damageExpression } : undefined,
      });
    }
  }
  
  return {
    reachable,
    speedUsed: 0, // Will be set when movement is committed
    movementMode: mode,
  };
}

/**
 * Get the path to a specific target square
 */
export function getPathToTarget(
  reachableResult: ReachableAreaResult,
  targetX: number,
  targetY: number
): { x: number; y: number }[] | null {
  const square = reachableResult.reachable.find(s => s.x === targetX && s.y === targetY);
  return square?.path ?? null;
}

/**
 * Check if a square is reachable
 */
export function isSquareReachable(
  reachableResult: ReachableAreaResult,
  x: number,
  y: number
): boolean {
  return reachableResult.reachable.some(s => s.x === x && s.y === y);
}

/**
 * Get movement cost to a specific square
 */
export function getMovementCost(
  reachableResult: ReachableAreaResult,
  x: number,
  y: number
): number | null {
  const square = reachableResult.reachable.find(s => s.x === x && s.y === y);
  return square?.cost ?? null;
}
