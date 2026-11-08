import { useState, useCallback, useMemo } from 'react';
import {
  findAffectedTokens,
  DEFAULT_SPELL_TEMPLATES,
  type AoETemplateDefinition,
  type Point,
  type TokenTarget,
  type AffectedTokenResult,
} from '../../../../utils/rules/spellAoE';

export interface UseAoEToolOptions {
  mapId: string;
  gameSystem?: string;
  tokens: TokenTarget[];
  onConfirmCast?: (castPayload: {
    template: AoETemplateDefinition;
    originGrid: Point;
    targetGrid: Point | null;
    angleRad: number;
    affectedTokens: AffectedTokenResult[];
  }) => void;
}

export function useAoETool({
  gameSystem = 'DND_5E',
  tokens,
  onConfirmCast,
}: UseAoEToolOptions) {
  const [active, setActive] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AoETemplateDefinition>(() => {
    const list = DEFAULT_SPELL_TEMPLATES[gameSystem] || DEFAULT_SPELL_TEMPLATES.DND_5E;
    return list[0];
  });
  const [originGrid, setOriginGrid] = useState<Point | null>(null);
  const [targetGrid, setTargetGrid] = useState<Point | null>(null);

  const angleRad = useMemo(() => {
    if (!originGrid || !targetGrid) return 0;
    if (originGrid.x === targetGrid.x && originGrid.y === targetGrid.y) return 0;
    return Math.atan2(targetGrid.y - originGrid.y, targetGrid.x - originGrid.x);
  }, [originGrid, targetGrid]);

  const snapPoint = useCallback(
    (pointInGrid: Point): Point => {
      if (!selectedTemplate.gridSnap) {
        return pointInGrid;
      }
      if (selectedTemplate.origin === 'intersection') {
        // Point is in grid units (where each unit = 5ft).
        // 1 grid intersection corresponds to whole integer coordinates.
        return {
          x: Math.round(pointInGrid.x),
          y: Math.round(pointInGrid.y),
        };
      } else {
        // Cell center = integer + 0.5
        return {
          x: Math.floor(pointInGrid.x) + 0.5,
          y: Math.floor(pointInGrid.y) + 0.5,
        };
      }
    },
    [selectedTemplate]
  );

  const handlePointerDown = useCallback(
    (rawGridPoint: Point) => {
      if (!active) return;
      const snapped = snapPoint(rawGridPoint);
      setOriginGrid(snapped);
      setTargetGrid(null);
    },
    [active, snapPoint]
  );

  const handlePointerMove = useCallback(
    (rawGridPoint: Point) => {
      if (!active || !originGrid) return;
      setTargetGrid(rawGridPoint);
    },
    [active, originGrid]
  );

  const affectedTokens = useMemo<AffectedTokenResult[]>(() => {
    if (!originGrid) return [];
    // Convert origin from grid units to feet (x5)
    const originFeet: Point = {
      x: originGrid.x * 5,
      y: originGrid.y * 5,
    };
    return findAffectedTokens(
      selectedTemplate,
      originFeet,
      angleRad,
      tokens,
      5,
      0.499
    );
  }, [originGrid, selectedTemplate, angleRad, tokens]);

  const confirmCast = useCallback(() => {
    if (!originGrid) return;
    if (onConfirmCast) {
      onConfirmCast({
        template: selectedTemplate,
        originGrid,
        targetGrid,
        angleRad,
        affectedTokens: affectedTokens.filter((t) => t.isAffected),
      });
    }
  }, [originGrid, onConfirmCast, selectedTemplate, targetGrid, angleRad, affectedTokens]);

  const cancelPlacement = useCallback(() => {
    setOriginGrid(null);
    setTargetGrid(null);
  }, []);

  return {
    active,
    setActive,
    selectedTemplate,
    setSelectedTemplate,
    originGrid,
    targetGrid,
    angleRad,
    affectedTokens,
    handlePointerDown,
    handlePointerMove,
    confirmCast,
    cancelPlacement,
  };
}
