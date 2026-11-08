/**
 * DM Review Panel
 * Sidebar for DMs to review, suggest, lock, override character changes
 * and manage conflicts
 */

import { useState, useEffect, useCallback } from 'react';
import { socket } from '@/services/socket';
import { api } from '@/services/api';
import { useToast } from '@/contexts/ToastContext';
import type { Character } from '@/types';
import {
  AlertTriangle,
  Lock,
  Unlock,
  X,
  Check,
  Users,
  History,
  Flag,
  Bell,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Modal from '@/components/ui/Modal';

export interface CharacterConflict {
  id: string;
  characterId: string;
  fieldPath: string;
  conflictType: string;
  description: string;
  severity: string;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolution: string | null;
}

interface CharacterLock {
  id: string;
  characterId: string;
  fieldPath: string;
  lockedById: string;
  lockedBy: { id: string; displayName: string };
  reason: string | null;
  createdAt: string;
}

interface CharacterChange {
  id: string;
  characterId: string;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: string;
  authorId: string;
  author: { id: string; displayName: string };
  resolvedById: string | null;
  resolvedBy: { id: string; displayName: string } | null;
  resolvedAt: string | null;
  note: string | null;
  createdAt: string;
}

interface PresenceUser {
  userId: string;
  displayName: string;
  fieldPath?: string;
  cursorPosition?: { x: number; y: number };
  lastActive: number;
  isDM?: boolean;
}

interface DMReviewPanelProps {
  character: Character;
  campaignId: string;
  userId: string;
  userDisplayName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DMReviewPanel({
  character,
  campaignId: _campaignId,
  userId,
  userDisplayName: _userDisplayName,
  isOpen,
  onClose,
}: DMReviewPanelProps) {
  const { showToast } = useToast();
  const [conflicts, setConflicts] = useState<CharacterConflict[]>([]);
  const [locks, setLocks] = useState<CharacterLock[]>([]);
  const [history, setHistory] = useState<CharacterChange[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [activeTab, setActiveTab] = useState<'conflicts' | 'locks' | 'history' | 'presence'>('conflicts');
  const [loading, setLoading] = useState(true);
  const [showLockModal, setShowLockModal] = useState<{ fieldPath: string } | null>(null);
  const [showSuggestModal, setShowSuggestModal] = useState<{ fieldPath: string; currentValue: unknown } | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState<{ fieldPath: string; currentValue: unknown } | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [suggestValue, setSuggestValue] = useState('');
  const [suggestNote, setSuggestNote] = useState('');
  const [overrideValue, setOverrideValue] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [historyPage, setHistoryPage] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  // Load initial data
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [conflictsRes, locksRes, historyRes] = await Promise.all([
          api.getCharacterConflicts(character.id),
          api.getCharacterLocks(character.id),
          api.getCharacterChangeHistory(character.id, 50, 0),
        ]);
        setConflicts(conflictsRes.conflicts || []);
        setLocks(locksRes.locks || []);
        setHistory(historyRes.changes || []);
        setHasMoreHistory(historyRes.total > 50);
      } catch (error) {
        console.error('Failed to load DM review data:', error);
        showToast('Failed to load review data', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Join WebSocket room for real-time updates
    socket.emit('character:draft:join', { characterId: character.id });

    const handleConflicts = (data: { characterId: string; conflicts: CharacterConflict[] }) => {
      if (data.characterId === character.id) setConflicts(data.conflicts);
    };

    const handleLocked = (data: { characterId: string; lock: CharacterLock; conflicts: CharacterConflict[] }) => {
      if (data.characterId === character.id) {
        setLocks(prev => [...prev.filter(l => l.fieldPath !== data.lock.fieldPath), data.lock]);
        setConflicts(data.conflicts || []);
      }
    };

    const handleUnlocked = (data: { characterId: string; fieldPath: string; conflicts: CharacterConflict[] }) => {
      if (data.characterId === character.id) {
        setLocks(prev => prev.filter(l => l.fieldPath !== data.fieldPath));
        setConflicts(data.conflicts || []);
      }
    };

    const handleSuggested = (data: { characterId: string; change: CharacterChange; conflicts: CharacterConflict[] }) => {
      if (data.characterId === character.id) {
        setHistory(prev => [data.change, ...prev.slice(0, 49)]);
        setConflicts(data.conflicts || []);
      }
    };

    const handleOverridden = (data: { characterId: string; change: CharacterChange; conflicts: CharacterConflict[] }) => {
      if (data.characterId === character.id) {
        setHistory(prev => [data.change, ...prev.slice(0, 49)]);
        setConflicts(data.conflicts || []);
      }
    };

    const handleResolved = (data: { characterId: string; conflicts: CharacterConflict[] }) => {
      if (data.characterId === character.id) setConflicts(data.conflicts);
    };

    const handlePresence = (data: { characterId: string; presences: PresenceUser[] }) => {
      if (data.characterId === character.id) {
        setPresence(data.presences.filter(p => p.userId !== userId));
      }
    };

    socket.on('character:draft:conflict', handleConflicts);
    socket.on('character:draft:locked', handleLocked);
    socket.on('character:draft:unlocked', handleUnlocked);
    socket.on('character:draft:suggested', handleSuggested);
    socket.on('character:draft:overridden', handleOverridden);
    socket.on('character:draft:resolved', handleResolved);
    socket.on('character:draft:presence', handlePresence);

    return () => {
      socket.off('character:draft:conflict', handleConflicts);
      socket.off('character:draft:locked', handleLocked);
      socket.off('character:draft:unlocked', handleUnlocked);
      socket.off('character:draft:suggested', handleSuggested);
      socket.off('character:draft:overridden', handleOverridden);
      socket.off('character:draft:resolved', handleResolved);
      socket.off('character:draft:presence', handlePresence);
      socket.emit('character:draft:leave', { characterId: character.id });
    };
  }, [isOpen, character.id, userId, showToast]);

  // Load more history
  const loadMoreHistory = useCallback(async () => {
    if (historyLoading || !hasMoreHistory) return;
    try {
      setHistoryLoading(true);
      const res = await api.getCharacterChangeHistory(character.id, 50, (historyPage + 1) * 50);
      setHistory(prev => [...prev, ...(res.changes || [])]);
      setHistoryPage(prev => prev + 1);
      setHasMoreHistory(res.changes?.length === 50);
    } catch (error) {
      console.error('Failed to load more history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [character.id, historyPage, historyLoading, hasMoreHistory]);

  // Handlers
  const handleLock = async (fieldPath: string) => {
    if (!lockReason.trim()) {
      showToast('Please provide a reason for locking', 'warning');
      return;
    }
    try {
      await api.lockCharacterField(character.id, fieldPath, lockReason);
      setShowLockModal(null);
      setLockReason('');
      showToast('Field locked successfully', 'success');
    } catch {
      showToast('Failed to lock field', 'error');
    }
  };

  const handleUnlock = async (fieldPath: string) => {
    try {
      await api.unlockCharacterField(character.id, fieldPath);
      showToast('Field unlocked successfully', 'success');
    } catch {
      showToast('Failed to unlock field', 'error');
    }
  };

  const handleSuggest = async (fieldPath: string) => {
    let value: unknown;
    try {
      value = JSON.parse(suggestValue);
    } catch {
      value = suggestValue;
    }
    try {
      await api.suggestCharacterChange(character.id, fieldPath, value, suggestNote);
      setShowSuggestModal(null);
      setSuggestValue('');
      setSuggestNote('');
      showToast('Suggestion sent to player', 'success');
    } catch {
      showToast('Failed to send suggestion', 'error');
    }
  };

  const handleOverride = async (fieldPath: string) => {
    let value: unknown;
    try {
      value = JSON.parse(overrideValue);
    } catch {
      value = overrideValue;
    }
    try {
      await api.overrideCharacterField(character.id, fieldPath, value, overrideNote);
      setShowOverrideModal(null);
      setOverrideValue('');
      setOverrideNote('');
      showToast('Field overridden', 'success');
    } catch {
      showToast('Failed to override field', 'error');
    }
  };

  const handleResolveConflict = async (conflictId: string, resolution: 'accept' | 'reject' | 'force') => {
    try {
      await api.resolveCharacterConflict(character.id, conflictId, resolution);
      showToast(`Conflict ${resolution}ed`, 'success');
    } catch {
      showToast('Failed to resolve conflict', 'error');
    }
  };

  // Render field path nicely
  const formatFieldPath = (path: string) => {
    return path.replace(/\.([a-zA-Z]+)/g, ' → $1').replace(/\[(\d+)\]/g, '[$1]');
  };

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'BLOCKING': return 'bg-danger/20 text-danger-ink border-danger/30';
      case 'ERROR': return 'bg-danger/10 text-danger-ink border-danger/20';
      case 'WARNING': return 'bg-warning/20 text-warning-ink border-warning/30';
      case 'INFO': return 'bg-info/20 text-info-ink border-info/30';
      default: return 'bg-stone-gray/20 text-stone-gray border-stone-gray/30';
    }
  };

  // Get change type color
  const getChangeTypeColor = (type: string) => {
    switch (type) {
      case 'PLAYER_EDIT': return 'bg-brand/10 text-brand-ink';
      case 'DM_SUGGESTION': return 'bg-info/10 text-info-ink';
      case 'DM_OVERRIDE': return 'bg-warning/10 text-warning-ink';
      case 'DM_LOCK': return 'bg-accent/10 text-accent-ink';
      case 'DM_UNLOCK': return 'bg-success/10 text-success-ink';
      case 'CONFLICT_RESOLVED': return 'bg-success/10 text-success-ink';
      case 'SYSTEM_CORRECTION': return 'bg-stone-gray/10 text-stone-gray';
      default: return 'bg-stone-gray/10 text-stone-gray';
    }
  };

  if (!isOpen) return null;

  const unresolvedConflicts = conflicts.filter(c => !c.resolvedAt);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="DM Review Panel"
      size="lg"
      className="max-h-[90vh] flex flex-col"
    >
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Tab Bar */}
        <div className="flex border-b border-ink/10 shrink-0">
          {[
            { id: 'conflicts', label: 'Conflicts', icon: AlertTriangle, count: unresolvedConflicts.length },
            { id: 'locks', label: 'Locks', icon: Lock, count: locks.length },
            { id: 'history', label: 'History', icon: History, count: history.length },
            { id: 'presence', label: 'Presence', icon: Users, count: presence.length },
          ].map(tab => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'primary' : 'ghost'}
              size="sm"
              className="flex-1 justify-center gap-1 px-3 py-2"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-ink/10 text-ink-muted'
                }`}>
                  {tab.count}
                </span>
              )}
            </Button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand border-t-transparent" />
            </div>
          )}

          {!loading && activeTab === 'conflicts' && (
            <div className="space-y-3">
              {unresolvedConflicts.length === 0 ? (
                <div className="text-center py-12 text-ink-muted">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-ink-muted/30" />
                  <p className="font-medium">No unresolved conflicts</p>
                  <p className="text-sm">All character data looks good!</p>
                </div>
              ) : (
                unresolvedConflicts.map(conflict => (
                  <div
                    key={conflict.id}
                    className={`p-4 rounded-lg border ${getSeverityColor(conflict.severity)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm text-ink">{formatFieldPath(conflict.fieldPath)}</span>
                          <span className={`px-2 py-0.5 text-xs rounded ${getSeverityColor(conflict.severity)}`}>
                            {conflict.severity}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded bg-ink/10 text-ink-muted">
                            {conflict.conflictType}
                          </span>
                        </div>
                        <p className="text-ink-secondary text-sm">{conflict.description}</p>
                        <p className="text-xs text-ink-muted mt-1">
                          Detected: {new Date(conflict.detectedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Tooltip content="Accept this conflict (apply suggested value)">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-success-ink hover:bg-success/10"
                            onClick={() => handleResolveConflict(conflict.id, 'accept')}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Reject this conflict (keep current value)">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger-ink hover:bg-danger/10"
                            onClick={() => handleResolveConflict(conflict.id, 'reject')}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Force resolution (DM decides)">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-warning-ink hover:bg-warning/10"
                            onClick={() => handleResolveConflict(conflict.id, 'force')}
                          >
                            <Flag className="w-4 h-4" />
                          </Button>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && activeTab === 'locks' && (
            <div className="space-y-3">
              {locks.length === 0 ? (
                <div className="text-center py-12 text-ink-muted">
                  <Lock className="w-12 h-12 mx-auto mb-3 text-ink-muted/30" />
                  <p className="font-medium">No locked fields</p>
                  <p className="text-sm">Click the lock icon on any field to lock it</p>
                </div>
              ) : (
                locks.map(lock => (
                  <div key={lock.id} className="p-4 rounded-lg border border-ink/10 bg-accent/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm text-ink">{formatFieldPath(lock.fieldPath)}</span>
                          <span className="px-2 py-0.5 text-xs rounded bg-accent/20 text-accent-ink">
                            Locked
                          </span>
                        </div>
                        {lock.reason && (
                          <p className="text-ink-secondary text-sm mb-1">Reason: {lock.reason}</p>
                        )}
                        <p className="text-xs text-ink-muted">
                          Locked by {lock.lockedBy.displayName} • {new Date(lock.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger-ink hover:bg-danger/10"
                        onClick={() => handleUnlock(lock.fieldPath)}
                      >
                        <Unlock className="w-4 h-4" />
                        <span className="hidden sm:inline">Unlock</span>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && activeTab === 'history' && (
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-12 text-ink-muted">
                  <History className="w-12 h-12 mx-auto mb-3 text-ink-muted/30" />
                  <p className="font-medium">No change history</p>
                </div>
              ) : (
                <>
                  {history.map(change => (
                    <div
                      key={change.id}
                      className={`p-3 rounded-lg border ${getChangeTypeColor(change.changeType)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm text-ink">{formatFieldPath(change.fieldPath)}</span>
                            <span className={`px-2 py-0.5 text-xs rounded ${getChangeTypeColor(change.changeType)}`}>
                              {change.changeType.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-ink-muted">
                            <span>By {change.author.displayName}</span>
                            <span>•</span>
                            <span>{new Date(change.createdAt).toLocaleString()}</span>
                          </div>
                          {change.note && (
                            <p className="text-sm text-ink-secondary mt-1">{change.note}</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {change.oldValue !== undefined && (
                            <Tooltip content="Old value">
                              <pre className="text-xs bg-ink/5 p-2 rounded max-w-xs overflow-auto whitespace-pre-wrap">
                                {JSON.stringify(change.oldValue, null, 2)}
                              </pre>
                            </Tooltip>
                          )}
                          {change.newValue !== undefined && (
                            <Tooltip content="New value">
                              <pre className="text-xs bg-ink/5 p-2 rounded max-w-xs overflow-auto whitespace-pre-wrap">
                                {JSON.stringify(change.newValue, null, 2)}
                              </pre>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {hasMoreHistory && (
                    <Button
                      variant="secondary"
                      className="w-full mt-2"
                      onClick={loadMoreHistory}
                      disabled={historyLoading}
                    >
                      {historyLoading ? 'Loading...' : 'Load More History'}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {!loading && activeTab === 'presence' && (
            <div className="space-y-3">
              {presence.length === 0 ? (
                <div className="text-center py-12 text-ink-muted">
                  <Users className="w-12 h-12 mx-auto mb-3 text-ink-muted/30" />
                  <p className="font-medium">No other users viewing</p>
                </div>
              ) : (
                presence.map(user => (
                  <div key={user.userId} className="p-4 rounded-lg border border-ink/10 bg-brand/5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-moss-green animate-pulse" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">{user.displayName}</span>
                          {user.isDM && (
                            <span className="px-2 py-0.5 text-xs rounded bg-brand/20 text-brand-ink">DM</span>
                          )}
                        </div>
                        {user.fieldPath && (
                          <p className="text-sm text-ink-muted">Editing: <span className="font-mono">{formatFieldPath(user.fieldPath)}</span></p>
                        )}
                        <p className="text-xs text-ink-muted">
                          Last active: {new Date(user.lastActive).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showLockModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowLockModal(null)}
          title={`Lock Field: ${formatFieldPath(showLockModal.fieldPath)}`}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-ink-secondary">Provide a reason for locking this field (optional)</p>
            <textarea
              value={lockReason}
              onChange={e => setLockReason(e.target.value)}
              placeholder="e.g., Point buy rules require STR 13 max at level 1"
              className="w-full p-3 rounded-lg border border-ink/20 bg-parchment text-ink focus:ring-2 focus:ring-brand"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowLockModal(null)}>Cancel</Button>
              <Button onClick={() => handleLock(showLockModal.fieldPath)}>Lock Field</Button>
            </div>
          </div>
        </Modal>
      )}

      {showSuggestModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowSuggestModal(null)}
          title={`Suggest Change: ${formatFieldPath(showSuggestModal.fieldPath)}`}
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Current Value</label>
              <pre className="p-3 rounded-lg border border-ink/20 bg-parchment text-ink text-sm overflow-auto max-h-32">
                {JSON.stringify(showSuggestModal.currentValue, null, 2)}
              </pre>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Suggested Value (JSON)</label>
              <textarea
                value={suggestValue}
                onChange={e => setSuggestValue(e.target.value)}
                placeholder='e.g., 14 or "new value" or {"key": "value"}'
                className="w-full p-3 rounded-lg border border-ink/20 bg-parchment text-ink focus:ring-2 focus:ring-brand font-mono text-sm"
                rows={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Note (optional)</label>
              <textarea
                value={suggestNote}
                onChange={e => setSuggestNote(e.target.value)}
                placeholder="Explain why this change is suggested..."
                className="w-full p-3 rounded-lg border border-ink/20 bg-parchment text-ink focus:ring-2 focus:ring-brand"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowSuggestModal(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => handleSuggest(showSuggestModal!.fieldPath)}>Send Suggestion</Button>
            </div>
          </div>
        </Modal>
      )}

      {showOverrideModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowOverrideModal(null)}
          title={`Override Field: ${formatFieldPath(showOverrideModal.fieldPath)}`}
          size="md"
        >
          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-warning/30 bg-warning/5">
              <p className="text-sm text-warning-ink font-medium flex items-center gap-1">
                <Bell className="w-4 h-4" />
                Warning: This will immediately change the player's character without their acceptance.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Current Value</label>
              <pre className="p-3 rounded-lg border border-ink/20 bg-parchment text-ink text-sm overflow-auto max-h-32">
                {JSON.stringify(showOverrideModal.currentValue, null, 2)}
              </pre>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Override Value (JSON)</label>
              <textarea
                value={overrideValue}
                onChange={e => setOverrideValue(e.target.value)}
                placeholder='e.g., 14 or "new value" or {"key": "value"}'
                className="w-full p-3 rounded-lg border border-ink/20 bg-parchment text-ink focus:ring-2 focus:ring-brand font-mono text-sm"
                rows={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Note (required)</label>
              <textarea
                value={overrideNote}
                onChange={e => setOverrideNote(e.target.value)}
                placeholder="Explain why this override is necessary..."
                className="w-full p-3 rounded-lg border border-ink/20 bg-parchment text-ink focus:ring-2 focus:ring-brand"
                rows={2}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowOverrideModal(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleOverride(showOverrideModal!.fieldPath)}>Override Field</Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

export default DMReviewPanel;
