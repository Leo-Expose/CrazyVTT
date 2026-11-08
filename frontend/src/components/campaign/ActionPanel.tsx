import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Search, 
  Sword, 
  Sparkles, 
  Star, 
  Package, 
  Zap,
  Shield,
  ChevronDown,
  ChevronRight,
  Target,
  Heart,
  Info,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { ActionType, type CharacterAction, type ActionCost, type AttackPreview } from '@/types';
import { useToast } from '@/contexts/ToastContext';

interface ActionPanelProps {
  characterId: string;
  onActionSelect: (action: CharacterAction, preview: AttackPreview | null) => void;
  onClose?: () => void;
  compact?: boolean;
}

interface ActionDisplayData {
  description?: string;
  attackBonus?: number | string;
  damageExpression?: string;
  damageType?: string;
  spellSaveDC?: number | string;
  spellLevel?: number | string;
  range?: { normal?: number | string; long?: number | string };
}

const ACTION_TYPE_LABELS: Record<ActionType, { label: string; icon: React.ReactNode }> = {
  ATTACK_MELEE: { label: 'Melee Attacks', icon: <Sword className="w-4 h-4" /> },
  ATTACK_RANGED: { label: 'Ranged Attacks', icon: <Target className="w-4 h-4" /> },
  SPELL_ATTACK: { label: 'Spell Attacks', icon: <Sparkles className="w-4 h-4" /> },
  SPELL_SAVE: { label: 'Save Spells', icon: <Shield className="w-4 h-4" /> },
  SPELL_AOE: { label: 'Area Spells', icon: <Zap className="w-4 h-4" /> },
  FEATURE: { label: 'Features', icon: <Star className="w-4 h-4" /> },
  ITEM_USE: { label: 'Items', icon: <Package className="w-4 h-4" /> },
  REACTION: { label: 'Reactions', icon: <Shield className="w-4 h-4" /> },
  MOVEMENT: { label: 'Movement', icon: <Target className="w-4 h-4" /> },
  OTHER: { label: 'Other', icon: <Info className="w-4 h-4" /> },
};

const ACTION_COST_BADGES: Record<ActionCost, { label: string; className: string }> = {
  ACTION: { label: 'Action', className: 'bg-danger/15 text-danger-ink border-danger/30' },
  BONUS_ACTION: { label: 'Bonus', className: 'bg-warning/15 text-warning-ink border-warning/30' },
  REACTION: { label: 'Reaction', className: 'bg-spirit/15 text-spirit-ink border-spirit/30' },
  FREE: { label: 'Free', className: 'bg-success/15 text-success-ink border-success/30' },
  MOVEMENT: { label: 'Move', className: 'bg-info/15 text-info-ink border-info/30' },
  LEGENDARY: { label: 'Legendary', className: 'bg-warm-amber/15 text-warm-amber-ink border-warm-amber/30' },
  MYTHIC: { label: 'Mythic', className: 'bg-accent/15 text-accent-ink border-accent/30' },
};

export default function ActionPanel({ characterId, onActionSelect, onClose, compact = false }: ActionPanelProps) {
  const { socket, status } = useWebSocket();
  const { campaign } = useCampaign();
  const { showToast } = useToast();
  const [actions, setActions] = useState<CharacterAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ActionType | 'ALL'>('ALL');
  const [expandedCategories, setExpandedCategories] = useState<Set<ActionType>>(new Set<ActionType>([ActionType.ATTACK_MELEE, ActionType.ATTACK_RANGED]));
  const [selectedAction, setSelectedAction] = useState<CharacterAction | null>(null);
  const [preview, setPreview] = useState<AttackPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch actions on mount and when characterId changes
  useEffect(() => {
    if (!socket || status !== 'connected' || !campaign?.id) return;
    
    const loadActions = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await socket.emitWithAck<{ ok: boolean; actions: CharacterAction[]; error?: string }>('action:getRegistry', { 
          characterId, 
          forceRefresh: false 
        }, 5000);
        
        if (response.ok) {
          setActions(response.actions);
        } else {
          setError(response.error || 'Failed to load actions');
          showToast(response.error || 'Failed to load actions', 'error');
        }
      } catch {
        setError('Failed to load actions');
        showToast('Failed to load actions', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadActions();
  }, [socket, status, campaign?.id, characterId, showToast]);

  // Generate preview when action is selected
  const generatePreview = useCallback(async (action: CharacterAction) => {
    if (!socket || status !== 'connected') return;
    
    setPreviewLoading(true);
    try {
      const response = await socket.emitWithAck<{ ok: boolean; preview?: AttackPreview; error?: string }>('action:preview', {
        actionId: action.id,
        actionType: action.type,
        actionData: action.data,
        initiatorId: characterId,
      }, 5000);
      
      if (response.ok) {
        setPreview(response.preview ?? null);
      } else {
        setPreview({
          description: `Preview unavailable: ${response.error}`,
          warnings: [response.error || 'Preview unavailable'],
          attackRoll: { expression: '1d20', breakdown: 'N/A' },
        });
      }
    } catch {
      setPreview({
        description: 'Failed to generate preview',
        warnings: ['Connection error'],
        attackRoll: { expression: '1d20', breakdown: 'N/A' },
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [socket, status, characterId]);

  // Handle action selection
  const handleActionClick = (action: CharacterAction) => {
    if (selectedAction === action) {
      // Deselect if clicking same action
      setSelectedAction(null);
      setPreview(null);
    } else {
      setSelectedAction(action);
      generatePreview(action);
    }
    onActionSelect?.(action, preview);
  };

  // Filter actions by search and tab
  const filteredActions = useMemo(() => {
    let result = actions;
    
    if (activeTab !== 'ALL') {
      result = result.filter(a => a.type === activeTab);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(a => {
        const data = a.data as ActionDisplayData | undefined;
        return (
        a.name.toLowerCase().includes(query) ||
        (data?.description?.toLowerCase().includes(query)) ||
        (a.sourceRef?.toLowerCase().includes(query))
        );
      });
    }
    
    return result;
  }, [actions, activeTab, searchQuery]);

  // Group actions by type
  const groupedActions = useMemo(() => {
    const groups: Record<ActionType, CharacterAction[]> = {
      ATTACK_MELEE: [],
      ATTACK_RANGED: [],
      SPELL_ATTACK: [],
      SPELL_SAVE: [],
      SPELL_AOE: [],
      FEATURE: [],
      ITEM_USE: [],
      REACTION: [],
      MOVEMENT: [],
      OTHER: [],
    };
    
    for (const action of filteredActions) {
      groups[action.type].push(action);
    }
    
    return groups;
  }, [filteredActions]);

  // Get tabs that have actions
  const availableTabs = useMemo(() => {
    const tabs: (ActionType | 'ALL')[] = ['ALL'];
    const typesWithActions = new Set(actions.map(a => a.type));
    for (const type of [
      'ATTACK_MELEE', 'ATTACK_RANGED', 'SPELL_ATTACK', 'SPELL_SAVE', 'SPELL_AOE',
      'FEATURE', 'ITEM_USE', 'REACTION', 'MOVEMENT', 'OTHER'
    ] as ActionType[]) {
      if (typesWithActions.has(type)) {
        tabs.push(type);
      }
    }
    return tabs;
  }, [actions]);

  // Toggle category expansion
  const toggleCategory = (type: ActionType) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-brand-ink" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-center flex-1 text-danger-ink">
          <AlertTriangle className="w-6 h-6 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const totalActions = actions.length;

  return (
    <div className={`flex flex-col h-full bg-surface/50 backdrop-blur-xs rounded-lg border border-ink-muted/20 ${compact ? 'max-h-[400px]' : ''}`}>
      {/* Header */}
      <div className="shrink-0 p-3 border-b border-ink-muted/20 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sword className="w-5 h-5 text-brand-ink" />
            <h2 className="text-base font-semibold text-ink">Actions</h2>
            {totalActions > 0 && (
              <span className="text-xs px-2 py-0.5 bg-brand/15 text-brand-ink rounded-full">
                {totalActions}
              </span>
            )}
          </div>
          {onClose && (
            <button 
              onClick={onClose}
              className="p-1 rounded hover:bg-ink-muted/10 text-ink-secondary"
              aria-label="Close action panel"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search actions..."
            className="input-cozy w-full pl-8 pr-3 py-1.5 text-sm"
            aria-label="Search actions"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
          {availableTabs.map(tab => {
            const typeInfo = tab === 'ALL' ? { label: 'All', icon: <Info className="w-3.5 h-3.5" /> } : ACTION_TYPE_LABELS[tab];
            const count = tab === 'ALL' ? totalActions : groupedActions[tab]?.length || 0;
            const isActive = activeTab === tab;
            
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-brand text-brand-text shadow-xs'
                    : 'text-ink-secondary hover:bg-ink-muted/10 hover:text-ink'
                }`}
              >
                {typeInfo.icon}
                <span>{typeInfo.label}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                    isActive ? 'bg-brand-text/20 text-brand-text' : 'bg-ink-muted/20 text-ink-muted'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <Sword className="w-12 h-12 text-ink-muted/30 mb-3" />
            <p className="text-ink-secondary text-sm">
              {searchQuery ? 'No actions match your search' : 'No actions available for this character'}
            </p>
            <p className="text-xs text-ink-muted mt-1">
              Add attacks, spells, or features to your character sheet
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-3">
            {availableTabs.filter(t => t !== 'ALL').map(tab => {
              const groupActions = groupedActions[tab];
              if (!groupActions || groupActions.length === 0) return null;
              
              const isExpanded = expandedCategories.has(tab);
              const typeInfo = ACTION_TYPE_LABELS[tab];
              
              return (
                <div key={tab} className="border border-ink-muted/20 rounded-lg overflow-hidden">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(tab)}
                    className="w-full flex items-center justify-between p-2.5 bg-ink-muted/5 hover:bg-ink-muted/10 transition-colors"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-brand-ink ${isExpanded ? '' : 'rotate-0'} transition-transform`}>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {typeInfo.icon}
                        <span className="font-medium text-sm text-ink">{typeInfo.label}</span>
                        <span className="text-xs text-ink-muted px-1.5 py-0.5 rounded bg-ink-muted/20">
                          {groupActions.length}
                        </span>
                      </div>
                    </div>
                    {groupActions.some(a => a.used) && (
                      <span className="text-xs text-warning-ink bg-warning/10 px-2 py-0.5 rounded">
                        Some used
                      </span>
                    )}
                  </button>

                  {/* Actions in Category */}
                  <div className={`${isExpanded ? '' : 'hidden'} divide-y divide-ink-muted/10`}>
                    {groupActions.map(action => (
                      <ActionItem
                        key={action.id}
                        action={action}
                        isSelected={selectedAction?.id === action.id}
                        onClick={() => handleActionClick(action)}
                        compact={compact}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Panel */}
      {preview && (
        <div className="shrink-0 border-t border-ink-muted/20 bg-ink-muted/5 p-3 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Preview
            </h3>
            {previewLoading && <Loader2 className="w-4 h-4 animate-spin text-brand-ink" />}
          </div>
          
          <div className="text-xs text-ink-secondary space-y-1.5 font-mono leading-relaxed">
            <p className="whitespace-pre-wrap">{preview.description}</p>
            
            {preview.attackRoll && (
              <div className="pt-1.5 border-t border-ink-muted/10">
                <p className="font-semibold text-ink">Attack Roll:</p>
                <p className="ml-2">{preview.attackRoll.expression} vs AC {preview.attackRoll.vsAC ?? '?'}</p>
              </div>
            )}
            
            {preview.damageRoll && (
              <div className="pt-1.5 border-t border-ink-muted/10">
                <p className="font-semibold text-ink">Damage:</p>
                <p className="ml-2">{preview.damageRoll.expression} {preview.damageRoll.damageType ?? ''}</p>
              </div>
            )}
            
            {preview.saveDC && (
              <div className="pt-1.5 border-t border-ink-muted/10">
                <p className="font-semibold text-ink">Save:</p>
                <p className="ml-2">{preview.saveDC.ability} DC {preview.saveDC.dc} ({preview.saveDC.halfOnSuccess ? 'half on success' : 'full on success'})</p>
              </div>
            )}
            
            {preview.resourceCost && preview.resourceCost.length > 0 && (
              <div className="pt-1.5 border-t border-ink-muted/10">
                <p className="font-semibold text-ink">Resources:</p>
                {preview.resourceCost.map((r, i: number) => (
                  <p key={i} className="ml-2">• {r.details}</p>
                ))}
              </div>
            )}
            
            {preview.conditions && preview.conditions.length > 0 && (
              <div className="pt-1.5 border-t border-ink-muted/10">
                <p className="font-semibold text-ink">Conditions:</p>
                {preview.conditions.map((c, i: number) => (
                  <p key={i} className="ml-2">• {c.name} ({c.duration}, {c.saveEnds ? `DC ${c.saveDC} ends` : 'no save'})</p>
                ))}
              </div>
            )}
            
            {preview.warnings && preview.warnings.length > 0 && (
              <div className="pt-1.5 border-t border-warning/20 text-warning-ink">
                {preview.warnings.map((w: string, i: number) => (
                  <p key={i} className="ml-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected Action Indicator */}
      {selectedAction && !preview && !previewLoading && (
        <div className="shrink-0 border-t border-ink-muted/20 p-3 bg-warning/5">
          <p className="text-xs text-warning-ink text-center">
            Click to generate preview
          </p>
        </div>
      )}
    </div>
  );
}

interface ActionItemProps {
  action: CharacterAction;
  isSelected: boolean;
  onClick: () => void;
  compact?: boolean;
}

function ActionItem({ action, isSelected, onClick, compact }: ActionItemProps) {
  const displayData = action.data as ActionDisplayData;
  const costInfo = ACTION_COST_BADGES[action.cost] || { label: action.cost, className: 'bg-ink-muted/10 text-ink-muted border-ink-muted/20' };
  const isUsed = action.used;
  const hasRecharge = !!action.recharge;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 p-2 rounded-lg transition-all text-left ${
        isSelected
          ? 'bg-brand/10 border border-brand/30'
          : 'hover:bg-ink-muted/5 border border-transparent'
      } ${isUsed ? 'opacity-60' : ''} ${compact ? 'py-1.5' : ''}`}
      disabled={isUsed}
      aria-pressed={isSelected}
    >
      {/* Used indicator */}
      {isUsed && (
        <div className="w-5 h-5 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-stone-gray/30 border-2 border-stone-gray" />
        </div>
      )}
      {!isUsed && (
        <div className="w-5 h-5 flex items-center justify-center">
          {hasRecharge && (
            <div className="w-4 h-4 rounded-full border border-warm-amber/50 bg-warm-amber/10" title="Recharges" />
          )}
        </div>
      )}

      {/* Action Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm text-ink truncate">{action.name}</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${costInfo.className}`}>
            {costInfo.label}
          </span>
        </div>
        
        {/* Key Stats */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
          {displayData.attackBonus !== undefined && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-brand/10 text-brand-ink rounded">
              <Target className="w-2.5 h-2.5" />
              +{displayData.attackBonus}
            </span>
          )}
          {displayData.damageExpression && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-danger/10 text-danger-ink rounded">
              <Heart className="w-2.5 h-2.5" />
              {displayData.damageExpression} {displayData.damageType ?? ''}
            </span>
          )}
          {displayData.spellSaveDC !== undefined && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-spirit/10 text-spirit-ink rounded">
              <Shield className="w-2.5 h-2.5" />
              DC {displayData.spellSaveDC}
            </span>
          )}
          {displayData.spellLevel !== undefined && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-info/10 text-info-ink rounded">
              <Sparkles className="w-2.5 h-2.5" />
              Lv.{displayData.spellLevel}
            </span>
          )}
          {displayData.range && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-warning/10 text-warning-ink rounded">
              <Target className="w-2.5 h-2.5" />
              {displayData.range.normal}{displayData.range.long ? `/${displayData.range.long}` : ''} ft.
            </span>
          )}
        </div>
      </div>

      {/* Source */}
      <span className="text-[10px] text-ink-muted/60 px-1.5 py-0.5 bg-ink-muted/10 rounded">
        {action.source}
      </span>
    </button>
  );
}
