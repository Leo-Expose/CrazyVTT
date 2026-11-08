import { X, Check } from 'lucide-react';
import { useReactions } from '@/hooks/useReactions';
import type { CharacterAction } from '@/types';

interface ReactionPromptProps {
  characterId?: string;
}

/**
 * UI component for displaying reaction prompts
 * Place this at the root of your campaign page to show reaction prompts
 */
export default function ReactionPromptUI({ characterId }: ReactionPromptProps) {
  const { pendingReaction, respondToReaction } = useReactions(characterId);

  if (!pendingReaction) return null;

  const triggerLabels: Record<string, string> = {
    opportunity_attack: 'Opportunity Attack',
    shield: 'Shield Spell',
    counterspell: 'Counterspell',
    uncanny_dodge: 'Uncanny Dodge',
    custom: 'Reaction',
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-in-right pointer-events-none">
      <div className="bg-soft-cream border-2 border-warm-amber/40 rounded-xl shadow-2xl p-4 min-w-[320px] max-w-md pointer-events-auto">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-warm-amber/15 flex items-center justify-center">
              <span className="text-accent-ink font-bold text-lg">⚡</span>
            </div>
            <div>
              <p className="font-semibold text-ink">Reaction Available</p>
              <p className="text-xs text-ink-secondary">{triggerLabels[pendingReaction.triggerType]}</p>
            </div>
          </div>
          <button
            onClick={() => respondToReaction(pendingReaction.reactionId, false)}
            className="p-1 rounded hover:bg-ink-muted/10 text-ink-muted"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-ink-secondary mb-3">
          {pendingReaction.triggerData?.description || 'An enemy action triggers your reaction.'}
        </p>

        {pendingReaction.availableReactions.length > 0 && (
          <div className="space-y-2 mb-3">
            <p className="text-xs font-medium text-ink-secondary uppercase">Choose Reaction:</p>
            {pendingReaction.availableReactions.map((reaction: CharacterAction) => {
              const actionDesc = (reaction.data as Record<string, unknown> | undefined)?.description;
              return (
                <button
                  key={reaction.id}
                  onClick={() => respondToReaction(pendingReaction.reactionId, true, { actionId: reaction.id })}
                  className="w-full flex items-center justify-between p-2 rounded-lg bg-paper/50 hover:bg-moss-green/10 border border-ink-muted/10 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{reaction.name}</span>
                    <span className="px-1.5 py-0.5 text-[10px] bg-brand/15 text-brand-ink rounded">
                      {reaction.cost}
                    </span>
                  </div>
                  {typeof actionDesc === 'string' && (
                    <span className="text-xs text-ink-muted">{actionDesc}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => respondToReaction(pendingReaction.reactionId, true, pendingReaction.availableReactions[0]?.id ? { actionId: pendingReaction.availableReactions[0].id } : undefined)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-success/15 hover:bg-success/25 border border-success/30 text-success-ink font-semibold text-sm"
          >
            <Check className="w-4 h-4" />
            Use Reaction
          </button>
          <button
            onClick={() => respondToReaction(pendingReaction.reactionId, false)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-danger/30 bg-danger/10 text-danger-ink font-semibold text-sm hover:bg-danger/20"
          >
            <X className="w-4 h-4" />
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
