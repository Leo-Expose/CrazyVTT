/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps -- socket event payloads are runtime-discriminated. */
import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import type { CharacterAction } from '@/types';

interface ReactionPrompt {
  reactionId: string;
  triggerType: 'opportunity_attack' | 'shield' | 'counterspell' | 'uncanny_dodge' | 'custom';
  triggerData: any;
  initiatorId: string;
  targetId: string;
  timeout: number;
  availableReactions: CharacterAction[];
}

interface UseReactionsReturn {
  pendingReaction: ReactionPrompt | null;
  usedReactions: Set<string>; // reaction IDs used this round
  respondToReaction: (reactionId: string, use: boolean, actionData?: any) => void;
  markReactionUsed: (reactionId: string) => void;
  resetReactions: (restType?: 'SHORT_REST' | 'LONG_REST' | 'TURN_START') => void;
  hasReactionAvailable: (type: string) => boolean;
}

/**
 * Hook for managing reaction state and responding to reaction prompts
 */
export function useReactions(characterId?: string): UseReactionsReturn {
  const { socket, status } = useWebSocket();
  const { campaign } = useCampaign();
  const { showToast } = useToast();
  const [pendingReaction, setPendingReaction] = useState<ReactionPrompt | null>(null);
  const [usedReactions, setUsedReactions] = useState<Set<string>>(new Set());
  const [reactionTimeout, setReactionTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Listen for reaction prompts
  useEffect(() => {
    if (!socket || status !== 'connected' || !campaign?.id) return;

    const handleReactionRequested = (data: ReactionPrompt) => {
      // Only show prompt if it's for our character or we're the DM (characterId undefined)
      if (data.targetId === characterId || characterId === undefined) {
        setPendingReaction(data);
        
        // Auto-decline after timeout
        if (reactionTimeout) clearTimeout(reactionTimeout);
        const timeout = setTimeout(() => {
          if (pendingReaction?.reactionId === data.reactionId) {
            respondToReaction(data.reactionId, false);
            showToast('Reaction timed out - auto declined', 'info');
          }
        }, data.timeout);
        setReactionTimeout(timeout);
      }
    };

    const handleReactionResolved = (data: { reactionId: string; use: boolean }) => {
      if (pendingReaction?.reactionId === data.reactionId) {
        if (reactionTimeout) clearTimeout(reactionTimeout);
        setPendingReaction(null);
        
        if (data.use) {
          markReactionUsed(pendingReaction.reactionId);
        }
      }
    };

    socket.on('action:reactionRequested', handleReactionRequested);
    socket.on('action:reactionResolved', handleReactionResolved);

    return () => {
      socket.off('action:reactionRequested', handleReactionRequested);
      socket.off('action:reactionResolved', handleReactionResolved);
      if (reactionTimeout) clearTimeout(reactionTimeout);
    };
  }, [socket, status, campaign?.id, characterId, pendingReaction, showToast]);

  // Listen for turn start to reset reactions
  useEffect(() => {
    if (!socket || status !== 'connected') return;

    const handleTurnStart = (data: { tokenId: string }) => {
      if (data.tokenId === characterId) {
        resetReactions('TURN_START');
      }
    };

    socket.on('initiative:turnStart', handleTurnStart);

    return () => {
      socket.off('initiative:turnStart', handleTurnStart);
    };
  }, [socket, status, characterId]);

  const respondToReaction = useCallback((reactionId: string, use: boolean, actionData?: any) => {
    if (!socket || status !== 'connected') return;

    socket.emit('action:reactionResponse', { reactionId, use, actionData });
  }, [socket, status]);

  const markReactionUsed = useCallback((reactionId: string) => {
    setUsedReactions(prev => new Set(prev).add(reactionId));
  }, []);

  const resetReactions = useCallback((restType: 'SHORT_REST' | 'LONG_REST' | 'TURN_START' = 'TURN_START') => {
    if (!socket || status !== 'connected' || !campaign?.id || !characterId) return;

    socket.emit('action:resetUsed', { characterId, restType });
    setUsedReactions(new Set());
  }, [socket, status, campaign?.id, characterId]);

  const hasReactionAvailable = useCallback((type: string) => {
    // Check if we have an unused reaction of this type
    return !usedReactions.has(type);
  }, [usedReactions]);

  return {
    pendingReaction,
    usedReactions,
    respondToReaction,
    markReactionUsed,
    resetReactions,
    hasReactionAvailable,
  };
}
