// ============================================
// RulebookActivationPanel
// DM-only panel for activating/deactivating rulebook content
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Search,
  Filter,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import api from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import Button from '@/components/ui/Button';
import { Rulebook, RulebookActivation, ChunkType, RulebookChunk } from '@/types';

interface RulebookActivationPanelProps {
  campaignId: string;
  rulebook: Rulebook;
  onActivationChange?: () => void;
}

const CHUNK_TYPE_LABELS: Record<ChunkType, string> = {
  SPELL: 'Spells',
  ITEM: 'Items',
  CLASS: 'Classes',
  SUBCLASS: 'Subclasses',
  FEAT: 'Feats',
  MONSTER: 'Monsters',
  RACE: 'Races',
  BACKGROUND: 'Backgrounds',
  RULE: 'Rules',
  TABLE: 'Tables',
  NARRATIVE: 'Narrative',
};

const CHUNK_TYPE_ICONS: Record<ChunkType, React.ReactNode> = {
  SPELL: <Sparkles className="w-4 h-4" />,
  ITEM: <BookOpen className="w-4 h-4" />,
  CLASS: <Sparkles className="w-4 h-4" />,
  SUBCLASS: <Sparkles className="w-4 h-4" />,
  FEAT: <Sparkles className="w-4 h-4" />,
  MONSTER: <BookOpen className="w-4 h-4" />,
  RACE: <Sparkles className="w-4 h-4" />,
  BACKGROUND: <BookOpen className="w-4 h-4" />,
  RULE: <BookOpen className="w-4 h-4" />,
  TABLE: <BookOpen className="w-4 h-4" />,
  NARRATIVE: <BookOpen className="w-4 h-4" />,
};

export default function RulebookActivationPanel({
  campaignId: _campaignId,
  rulebook,
  onActivationChange,
}: RulebookActivationPanelProps) {
  const { showToast } = useToast();
  const [activations, setActivations] = useState<RulebookActivation[]>([]);
  const [chunks, setChunks] = useState<RulebookChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Set<ChunkType>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<ChunkType | 'all'>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [activationsRes, chunksRes] = await Promise.all([
        api.getRulebookActivations(rulebook.id),
        api.getRulebookChunks({ rulebookId: rulebook.id, limit: 500 }),
      ]);
      setActivations(activationsRes);
      setChunks(chunksRes.data);
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to load rulebook data', 'error');
    } finally {
      setLoading(false);
    }
  }, [rulebook.id, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isTypeActivated = (contentType: ChunkType | null) => {
    // Check if there's a specific activation for this type, or a global one
    const specificActivation = activations.find(a => a.contentType === contentType);
    const globalActivation = activations.find(a => a.contentType === null);
    return !!specificActivation || !!globalActivation;
  };

  const handleToggleActivation = async (contentType: ChunkType | null, currentlyActive: boolean) => {
    const key = contentType ?? 'global';
    setActivating(key);

    try {
      if (currentlyActive) {
        // Deactivate - find the activation and delete it
        const activation = activations.find(a => a.contentType === contentType);
        if (activation) {
          await api.deactivateRulebook(rulebook.id, activation.id);
          setActivations(prev => prev.filter(a => a.id !== activation.id));
          showToast(`${contentType ? CHUNK_TYPE_LABELS[contentType] : 'All content'} deactivated`, 'success');
        }
      } else {
        // Activate - create new activation with all source IDs for this type
        const typeChunks = chunks.filter(c => c.contentType === contentType);
        const sourceIds = typeChunks.map(c => c.structured && typeof c.structured === 'object' && 'name' in c.structured
          ? String((c.structured as Record<string, unknown>)['name']).toLowerCase().replace(/[^a-z0-9]/g, '-')
          : '').filter(Boolean);

        await api.activateRulebook({
          rulebookId: rulebook.id,
          contentType: contentType ?? undefined,
          sourceIds,
        });
        await loadData();
        showToast(`${contentType ? CHUNK_TYPE_LABELS[contentType] : 'All content'} activated`, 'success');
      }
      onActivationChange?.();
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to update activation', 'error');
    } finally {
      setActivating(null);
    }
  };

  const handleToggleSourceId = async (contentType: ChunkType, sourceId: string, currentlyActive: boolean) => {
    const activation = activations.find(a => a.contentType === contentType);
    const globalActivation = activations.find(a => a.contentType === null);

    // If no specific activation exists but global does, we need to create one first
    if (!activation && globalActivation) {
      // Create specific activation with all currently active source IDs from global
      const globalSourceIds = globalActivation.sourceIds;
      try {
        await api.activateRulebook({
          rulebookId: rulebook.id,
          contentType,
          sourceIds: globalSourceIds,
        });
        await loadData();
      } catch (err) {
        showToast(apiErrorMessage(err) ?? 'Failed to create specific activation', 'error');
      }
      return;
    }

    if (activation) {
      const newSourceIds = currentlyActive
        ? activation.sourceIds.filter(id => id !== sourceId)
        : [...activation.sourceIds, sourceId];

      try {
        await api.activateRulebook({
          rulebookId: rulebook.id,
          contentType,
          sourceIds: newSourceIds,
        });
        await loadData();
        onActivationChange?.();
      } catch (err) {
        showToast(apiErrorMessage(err) ?? 'Failed to update activation', 'error');
      }
    }
  };

  const isSourceIdActivated = (contentType: ChunkType, sourceId: string) => {
    const specificActivation = activations.find(a => a.contentType === contentType);
    const globalActivation = activations.find(a => a.contentType === null);
    return specificActivation?.sourceIds.includes(sourceId) ?? globalActivation?.sourceIds.includes(sourceId) ?? false;
  };

  const getChunksForType = (contentType: ChunkType) => {
    let typeChunks = chunks.filter(c => c.contentType === contentType);
    if (searchQuery) {
      typeChunks = typeChunks.filter(c =>
        (c.structured && typeof c.structured === 'object' && 'name' in c.structured
          ? String((c.structured as Record<string, unknown>)['name']).toLowerCase()
          : c.rawText.substring(0, 100).toLowerCase()
        ).includes(searchQuery.toLowerCase())
      );
    }
    return typeChunks;
  };

  const chunkTypes: ChunkType[] = [
    'SPELL', 'ITEM', 'CLASS', 'SUBCLASS', 'FEAT',
    'MONSTER', 'RACE', 'BACKGROUND', 'RULE', 'TABLE', 'NARRATIVE'
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-8 h-8 animate-spin text-brand-ink" />
      </div>
    );
  }

  const globalActivated = isTypeActivated(null);
  const globalActivating = activating === 'global';

  return (
    <div className="bg-paper rounded-xl border border-ink/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-ink/10">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-brand-ink" />
          <div>
            <h3 className="font-semibold text-ink">{rulebook.title}</h3>
            <p className="text-sm text-ink-muted">
              {rulebook.edition} • {rulebook.sourceId} • {rulebook.totalPages ?? '?'} pages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              rulebook.status === 'COMPLETED' ? 'bg-success/10 text-success-ink' :
              rulebook.status === 'PROCESSING' ? 'bg-warning/10 text-warning-ink' :
              rulebook.status === 'FAILED' ? 'bg-danger/10 text-danger-ink' :
              'bg-ink/10 text-ink-muted'
            }`}
          >
            {rulebook.status}
          </span>
        </div>
      </div>

      {/* Global Activation Toggle */}
      <div className="p-4 border-b border-ink/10 bg-ink/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-brand-ink" />
            </div>
            <div>
              <p className="font-medium text-ink">All Content</p>
              <p className="text-sm text-ink-muted">
                Toggle all content types at once
              </p>
            </div>
          </div>
          <Button
            variant={globalActivated ? 'danger' : 'primary'}
            size="sm"
            onClick={() => handleToggleActivation(null, globalActivated)}
            disabled={globalActivating}
            loading={globalActivating}
          >
            {globalActivated ? 'Deactivate All' : 'Activate All'}
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="p-4 border-b border-ink/10 flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Search content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-canvas border border-ink/10 rounded-lg text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as ChunkType | 'all')}
            className="pl-10 pr-10 py-2 bg-canvas border border-ink/10 rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent appearance-none"
          >
            <option value="all">All Types</option>
            {chunkTypes.map(type => (
              <option key={type} value={type}>
                {CHUNK_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content Types */}
      <div className="divide-y divide-ink/10">
        {chunkTypes
          .filter(type => filterType === 'all' || filterType === type)
          .map(type => {
            const typeChunks = getChunksForType(type);
            const activated = isTypeActivated(type);
            const activatingType = activating === type;
            const isExpanded = expandedTypes.has(type);

            if (typeChunks.length === 0 && !searchQuery) return null;

            return (
              <div key={type} className="overflow-hidden">
                {/* Type Header */}
                <button
                  onClick={() => setExpandedTypes(prev => {
                    const next = new Set(prev);
                    if (next.has(type)) next.delete(type);
                    else next.add(type);
                    return next;
                  })}
                  className="w-full p-4 flex items-center justify-between gap-4 hover:bg-ink/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                      {CHUNK_TYPE_ICONS[type]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">{CHUNK_TYPE_LABELS[type]}</p>
                      <p className="text-sm text-ink-muted">
                        {typeChunks.length} entries • {activated ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-ink-muted" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-ink-muted" />
                    )}
                    <Button
                      variant={activated ? 'danger' : 'primary'}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleActivation(type, activated);
                      }}
                      disabled={activatingType}
                      loading={activatingType}
                    >
                      {activated ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </button>

                {/* Expanded Content List */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-l-2 border-brand/20 ml-11 space-y-2 max-h-96 overflow-y-auto">
                    {typeChunks.slice(0, 50).map(chunk => {
                      const structured = chunk.structured as { name?: string } | null;
                      const name = structured?.name ?? `Pages ${chunk.pageStart}-${chunk.pageEnd}`;
                      const sourceId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                      const sourceActivated = isSourceIdActivated(type, sourceId);

                      return (
                        <div
                          key={chunk.id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-ink/5 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="text-sm font-medium text-ink truncate">{name}</span>
                            <span className="text-xs text-ink-muted">pp. {chunk.pageStart}-{chunk.pageEnd}</span>
                            {chunk.confidence > 0 && (
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                chunk.confidence > 0.8 ? 'bg-success/10 text-success-ink' :
                                chunk.confidence > 0.5 ? 'bg-warning/10 text-warning-ink' :
                                'bg-danger/10 text-danger-ink'
                              }`}>
                                {Math.round(chunk.confidence * 100)}%
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleSourceId(type, sourceId, sourceActivated)}
                            className={sourceActivated ? 'text-success-ink' : ''}
                          >
                            {sourceActivated ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-ink-muted" />
                            )}
                          </Button>
                        </div>
                      );
                    })}
                    {typeChunks.length > 50 && (
                      <p className="text-sm text-ink-muted text-center py-2">
                        Showing 50 of {typeChunks.length} entries. Use search to filter.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {chunkTypes.every(type => getChunksForType(type).length === 0) && (
        <div className="p-8 text-center text-ink-muted">
          <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No content found matching your search</p>
        </div>
      )}
    </div>
  );
}
