import { useState, useCallback } from 'react';
import { socket } from '../services/socket';
import {
  OverrideTargetType,
  OverrideVisibility,
  type DMOverride,
} from '../types';

export function useDMOverride(campaignId: string | undefined) {
  const [history, setHistory] = useState<DMOverride[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const issueOverride = useCallback(
    (
      targetType: OverrideTargetType,
      targetId: string,
      fieldPath: string,
      previousValue: unknown,
      newValue: unknown,
      reason: string,
      visibility: OverrideVisibility = OverrideVisibility.DM_ONLY
    ) => {
      socket.emit('override:issue', {
        campaignId,
        targetType,
        targetId,
        fieldPath,
        previousValue,
        newValue,
        reason,
        visibility,
      });
    },
    [campaignId]
  );

  const revertOverride = useCallback(
    (overrideId: string, revertReason: string) => {
      socket.emit('override:revert', {
        overrideId,
        revertReason,
      });
    },
    []
  );

  const fetchHistory = useCallback(
    (targetType: OverrideTargetType, targetId: string) => {
      setIsLoading(true);
      socket.emit('override:history', {
        campaignId,
        targetType,
        targetId,
      });
    },
    [campaignId]
  );

  return {
    history,
    overrides: history,
    setHistory,
    isLoading,
    issueOverride,
    revertOverride,
    fetchHistory,
  };
}
