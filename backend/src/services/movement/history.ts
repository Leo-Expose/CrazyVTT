// ============================================
// Movement History Service (Phase 6)
// Records all movement for audit trail and session notes
// ============================================

import { prisma } from '../../config/database';
import type { MovementMode } from '../../types/index.js';

export interface MovementHistoryRecord {
  tokenId: string;
  tokenName: string;
  mapId: string;
  campaignId: string;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  path: { x: number; y: number }[];
  distance: number; // Feet
  movementMode: MovementMode;
  opportunityAttacks: Array<{
    enemyTokenId: string;
    enemyName: string;
    hit: boolean;
    damage?: number;
    stoppedMovement: boolean;
    attackRoll?: { expression: string; result: number; total: number };
  }>;
  dmOverrides: string[];
  movedById: string;
  movedByName: string;
  turnInfo?: {
    round: number;
    combatantName: string;
  };
}

export interface MovementHistoryEntry extends MovementHistoryRecord {
  id: string;
  createdAt: Date;
}

/**
 * Record a movement event in the history
 */
export async function recordMovement(record: MovementHistoryRecord): Promise<void> {
  // For now, we'll store in a JSON field on the campaign or map
  // In the future, this could be a dedicated Prisma model
  
  const historyEntry = {
    ...record,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  
  // Store in campaign's movement history (JSON array in a new field or metadata)
  // For now, we'll add it to the map's metadata or a dedicated column
  // Since we don't have a dedicated model yet, we'll log it
  console.log('[MovementHistory]', JSON.stringify(historyEntry));
  
  // TODO: When Prisma model is added, use:
  // await prisma.movementHistory.create({ data: historyEntry });
  void prisma; // Suppress unused warning
}

/**
 * Get movement history for a campaign
 */
export async function getMovementHistory(_campaignId: string, _limit = 100): Promise<MovementHistoryEntry[]> {
  // TODO: Implement when Prisma model exists
  return [];
}

/**
 * Get movement history for a specific token
 */
export async function getTokenMovementHistory(_tokenId: string, _campaignId: string): Promise<MovementHistoryEntry[]> {
  // TODO: Implement when Prisma model exists
  return [];
}

/**
 * Get movement history for a turn/round
 */
export async function getTurnMovementHistory(_campaignId: string, _round: number): Promise<MovementHistoryEntry[]> {
  // TODO: Implement when Prisma model exists
  return [];
}

/**
 * Format movement history for display in initiative tracker
 */
export function formatMovementSummary(record: MovementHistoryRecord): string {
  const parts: string[] = [];
  
  parts.push(`${record.tokenName} moved ${record.distance}ft`);
  
  if (record.movementMode !== 'walk') {
    parts.push(`(${record.movementMode})`);
  }
  
  if (record.opportunityAttacks.length > 0) {
    const aooSummary = record.opportunityAttacks.map(aoo => {
      const result = aoo.hit ? `hit for ${aoo.damage}` : 'missed';
      return `${aoo.enemyName} AoO: ${result}${aoo.stoppedMovement ? ' (stopped)' : ''}`;
    }).join('; ');
    parts.push(`provoked ${record.opportunityAttacks.length} AoO: ${aooSummary}`);
  }
  
  if (record.dmOverrides.length > 0) {
    parts.push(`DM overrides: ${record.dmOverrides.join(', ')}`);
  }
  
  return parts.join(' | ');
}

/**
 * Format per-turn movement summary
 */
export function formatTurnMovementSummary(records: MovementHistoryRecord[]): string {
  if (records.length === 0) return 'No movement this turn';
  
  return records.map(r => formatMovementSummary(r)).join('\n');
}
