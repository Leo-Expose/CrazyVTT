import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  DEFAULT_SPELL_TEMPLATES,
  type AoETemplateDefinition,
  type AffectedTokenResult,
} from '../../utils/rules/spellAoE';

export interface SpellTemplatePlacerProps {
  gameSystem?: string;
  active: boolean;
  selectedTemplate: AoETemplateDefinition;
  onSelectTemplate: (template: AoETemplateDefinition) => void;
  affectedTokens: AffectedTokenResult[];
  onConfirmCast: (autoApply?: boolean, damageDice?: string) => void;
  onCancel: () => void;
  customTemplates?: AoETemplateDefinition[];
}

export const SpellTemplatePlacer: React.FC<SpellTemplatePlacerProps> = ({
  gameSystem = 'DND_5E',
  active,
  selectedTemplate,
  onSelectTemplate,
  affectedTokens,
  onConfirmCast,
  onCancel,
  customTemplates = [],
}) => {
  const [expanded, setExpanded] = useState(true);

  if (!active) return null;

  const standardTemplates =
    DEFAULT_SPELL_TEMPLATES[gameSystem] || DEFAULT_SPELL_TEMPLATES.DND_5E;
  const allTemplates = [...standardTemplates, ...customTemplates];

  const affectedCount = affectedTokens.filter((t) => t.isAffected).length;

  return (
    <div
      className="absolute bottom-6 left-6 z-40 bg-surface/95 backdrop-blur-md rounded-xl border border-edge shadow-xl p-4 w-80 text-ink text-sm select-none"
      data-testid="spell-template-placer"
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-edge">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-brand" />
          <span className="font-semibold tracking-wide">Cast Spell AoE</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse spell template controls' : 'Expand spell template controls'}
          className="text-xs text-ink-muted hover:text-ink px-1.5 py-0.5 rounded hover:bg-surface-light transition-colors"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3">
          {/* Spell / Template Selector */}
          <div>
            <label htmlFor="spell-template-select" className="block text-xs font-medium text-ink-muted mb-1">
              Spell Template
            </label>
            <select
              id="spell-template-select"
              aria-label="Spell Template"
              value={selectedTemplate.id}
              onChange={(e) => {
                const found = allTemplates.find((t) => t.id === e.target.value);
                if (found) onSelectTemplate(found);
              }}
              className="w-full bg-surface-light border border-edge rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-brand text-sm"
            >
              {allTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.shape})
                </option>
              ))}
            </select>
          </div>

          {/* Template Details Summary */}
          <div className="bg-surface-light/60 rounded-lg p-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-ink-muted">Shape:</span>
              <span className="font-medium capitalize">{selectedTemplate.shape}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Origin Snap:</span>
              <span className="font-medium capitalize">{selectedTemplate.origin}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Grid Snap:</span>
              <span className="font-medium">{selectedTemplate.gridSnap ? 'Yes' : 'No'}</span>
            </div>
          </div>

          {/* Affected Tokens Live Counter */}
          <div className="pt-1">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-ink-muted">Affected Targets:</span>
              <span className="font-bold text-brand-ink bg-brand/10 px-2 py-0.5 rounded-full">
                {affectedCount} target{affectedCount === 1 ? '' : 's'}
              </span>
            </div>

            {affectedTokens.length > 0 && (
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {affectedTokens
                  .filter((t) => t.isAffected)
                  .map((t) => (
                    <div
                      key={t.tokenId}
                      className="flex items-center justify-between text-xs px-2 py-1 bg-surface-light rounded"
                    >
                      <span className="truncate max-w-[140px]">{t.tokenName}</span>
                      <span className="text-ink-muted text-[10px]">
                        {Math.round(t.coverageRatio * 100)}% cover
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Placement Hint */}
          <p className="text-[11px] text-ink-muted italic">
            Click map to place origin. Drag to orient direction. Targets with &ge;50% area coverage are highlighted (PRD §13).
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel spell placement"
              className="flex-1 py-1.5 px-3 rounded-lg border border-edge text-ink hover:bg-surface-light text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirmCast(true)}
              disabled={affectedCount === 0}
              className="flex-1 py-1.5 px-3 rounded-lg bg-brand text-brand-ink hover:bg-brand/90 disabled:opacity-50 text-xs font-medium transition-colors shadow-sm"
            >
              Cast &amp; Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
