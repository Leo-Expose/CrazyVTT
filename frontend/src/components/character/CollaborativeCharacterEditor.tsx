/**
 * Collaborative Character Editor
 * Wraps the existing character editor with real-time collaboration features:
 * - Presence cursors (who's editing what)
 * - Conflict badges
 * - Real-time sync via WebSocket
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { socket } from '@/services/socket';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/services/api';
import type { Character, CharacterData } from '@/types';
import { AlertTriangle, Lock, Users, UserCog } from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { CharacterSheetRouter } from '@/components/character-sheets/CharacterSheetRouter';
import { apiErrorMessage, apiValidationIssues, errorSummary } from '@/utils/errors';
import { refusedSaveMessage } from '@/utils/sheetSaveRefusal';
import { isStaleCharacterSave } from '@/utils/staleCharacter';
import { useStaleSaveReapply } from './StaleSaveDialog';
import { isSignedOutSave, SIGNED_OUT_NOT_SAVED } from '@/utils/signedOut';
import { reportSignedIn, reportSignedOut } from '@/services/unsavedWork';

interface PresenceUser {
  userId: string;
  displayName: string;
  fieldPath?: string;
  cursorPosition?: { x: number; y: number };
  lastActive: number;
  isDM?: boolean;
}

interface CharacterConflict {
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

interface CollaborativeCharacterEditorProps {
  character: Character;
  onSave: (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onEditStart: () => void;
  campaignId: string;
  userId: string;
  userRole: 'DM' | 'PLAYER' | 'SPECTATOR';
  userDisplayName: string;
}

export function CollaborativeCharacterEditor({
  character,
  onSave: _onSave,
  onCancel,
  onDirtyChange: _onDirtyChange,
  onEditStart,
  campaignId,
  userId,
  userRole,
  userDisplayName: _userDisplayName,
}: CollaborativeCharacterEditorProps) {
  const { showToast } = useToast();
  const [hasUnsignedChanges, setHasUnsavedChanges] = useState(false);
  const [_saving, setSaving] = useState(false);
  const [loadedAt, setLoadedAt] = useState(character.updatedAt);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [conflicts, setConflicts] = useState<CharacterConflict[]>([]);
  const [locks, setLocks] = useState<CharacterLock[]>([]);
  const [draftVersion, setDraftVersion] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [showPresencePanel, setShowPresencePanel] = useState(false);

  const openedSheetRef = useRef(character.data);
  const staleSave = useStaleSaveReapply();
  const socketConnectedRef = useRef(false);
  const pendingPatchesRef = useRef<Array<{ op: string; path: string; value?: unknown; from?: string }>>([]);
  const patchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplyingRemotePatchRef = useRef(false);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!campaignId || !character.id) return;

    const joinDraft = async () => {
      try {
        // Get initial draft state via REST
        const response = await api.getCharacterDraft(character.id);
        setDraftVersion(response.draft.version);
        setLocks(response.locks || []);
        setConflicts(response.conflicts || []);
      } catch {
        console.error('Failed to get draft');
      }

      // Join WebSocket room
      socket.emit('character:draft:join', { characterId: character.id });
      socketConnectedRef.current = true;
    };

    joinDraft();

    // WebSocket event handlers
    const handleState = (data: {
      characterId: string;
      draft: { data: CharacterData; version: number };
      locks: CharacterLock[];
      conflicts: CharacterConflict[];
    }) => {
      if (data.characterId !== character.id) return;
      setDraftVersion(data.draft.version);
      setLocks(data.locks || []);
      setConflicts(data.conflicts || []);
      setIsConnected(true);
    };

    const handlePatched = (data: {
      characterId: string;
      patches: Array<{ op: string; path: string; value?: unknown; from?: string }>;
      version: number;
      changes: CharacterChange[];
      conflicts: CharacterConflict[];
      locks: CharacterLock[];
      authorId: string;
      authorName: string;
    }) => {
      if (data.characterId !== character.id) return;
      if (data.authorId === userId) return; // Ignore our own changes

      isApplyingRemotePatchRef.current = true;
      setDraftVersion(data.version);
      setConflicts(data.conflicts || []);
      setLocks(data.locks || []);

      // Apply patches to local character data
      // This would require the character sheet to be reactive to external changes
      // For now, we'll notify the user to refresh
      if (data.authorId !== userId) {
        showToast(`${data.authorName} made changes to the character`, 'info');
      }

      isApplyingRemotePatchRef.current = false;
    };

    const handleLocked = (data: {
      characterId: string;
      lock: CharacterLock;
      conflicts: CharacterConflict[];
      lockedBy: string;
      lockedByName: string;
    }) => {
      if (data.characterId !== character.id) return;
      setLocks(prev => [...prev.filter(l => l.fieldPath !== data.lock.fieldPath), data.lock]);
      setConflicts(data.conflicts || []);
      showToast(`${data.lockedByName} locked ${data.lock.fieldPath}`, 'info');
    };

    const handleUnlocked = (data: {
      characterId: string;
      fieldPath: string;
      conflicts: CharacterConflict[];
      unlockedBy: string;
      unlockedByName: string;
    }) => {
      if (data.characterId !== character.id) return;
      setLocks(prev => prev.filter(l => l.fieldPath !== data.fieldPath));
      setConflicts(data.conflicts || []);
      showToast(`${data.unlockedByName} unlocked ${data.fieldPath}`, 'info');
    };

    const handleSuggested = (data: {
      characterId: string;
      change: CharacterChange;
      conflicts: CharacterConflict[];
      suggestedBy: string;
      suggestedByName: string;
    }) => {
      if (data.characterId !== character.id) return;
      setConflicts(data.conflicts || []);
      showToast(`${data.suggestedByName} suggested a change to ${data.change.fieldPath}`, 'info');
    };

    const handleOverridden = (data: {
      characterId: string;
      change: CharacterChange;
      conflicts: CharacterConflict[];
      overriddenBy: string;
      overriddenByName: string;
    }) => {
      if (data.characterId !== character.id) return;
      setConflicts(data.conflicts || []);
      showToast(`${data.overriddenByName} overrode ${data.change.fieldPath}`, 'warning');
    };

    const handleResolved = (data: {
      characterId: string;
      conflict: CharacterConflict;
      change: CharacterChange | null;
      conflicts: CharacterConflict[];
      resolvedBy: string;
      resolvedByName: string;
      resolution: string;
    }) => {
      if (data.characterId !== character.id) return;
      setConflicts(data.conflicts || []);
      showToast(`${data.resolvedByName} ${data.resolution} a conflict`, 'success');
    };

    const handlePresence = (data: {
      characterId: string;
      presences: PresenceUser[];
    }) => {
      if (data.characterId !== character.id) return;
      setPresenceUsers(data.presences.filter(p => p.userId !== userId));
    };

    const handleCursor = (data: {
      characterId: string;
      userId: string;
      userName: string;
      fieldPath?: string;
      position?: { x: number; y: number };
    }) => {
      if (data.characterId !== character.id) return;
      setPresenceUsers(prev => {
        const existing = prev.find(p => p.userId === data.userId);
        if (existing) {
          return prev.map(p => p.userId === data.userId
            ? { ...p, fieldPath: data.fieldPath, cursorPosition: data.position, lastActive: Date.now() }
            : p);
        }
        return [...prev, {
          userId: data.userId,
          displayName: data.userName,
          fieldPath: data.fieldPath,
          cursorPosition: data.position,
          lastActive: Date.now(),
        }];
      });
    };

    socket.on('character:draft:state', handleState);
    socket.on('character:draft:patched', handlePatched);
    socket.on('character:draft:locked', handleLocked);
    socket.on('character:draft:unlocked', handleUnlocked);
    socket.on('character:draft:suggested', handleSuggested);
    socket.on('character:draft:overridden', handleOverridden);
    socket.on('character:draft:resolved', handleResolved);
    socket.on('character:draft:presence', handlePresence);
    socket.on('character:draft:cursor', handleCursor);

    return () => {
      socket.off('character:draft:state', handleState);
      socket.off('character:draft:patched', handlePatched);
      socket.off('character:draft:locked', handleLocked);
      socket.off('character:draft:unlocked', handleUnlocked);
      socket.off('character:draft:suggested', handleSuggested);
      socket.off('character:draft:overridden', handleOverridden);
      socket.off('character:draft:resolved', handleResolved);
      socket.off('character:draft:presence', handlePresence);
      socket.off('character:draft:cursor', handleCursor);

      socket.emit('character:draft:leave', { characterId: character.id });
      socketConnectedRef.current = false;
    };
  }, [campaignId, character.id, userId, showToast]);

  // Send cursor updates
  const _sendCursorUpdate = useCallback((fieldPath?: string, position?: { x: number; y: number }) => {
    if (!socketConnectedRef.current) return;
    socket.emit('character:draft:cursor', { characterId: character.id, fieldPath, position });
  }, [character.id]);

  // Debounced patch sending
  const _sendPatches = useCallback(async (patches: Array<{ op: string; path: string; value?: unknown; from?: string }>) => {
    if (!socketConnectedRef.current || patches.length === 0) return;

    pendingPatchesRef.current.push(...patches);

    if (patchTimeoutRef.current) clearTimeout(patchTimeoutRef.current);
    patchTimeoutRef.current = setTimeout(async () => {
      const patchesToSend = [...pendingPatchesRef.current];
      pendingPatchesRef.current = [];

      try {
        await api.patchCharacterDraft(character.id, {
          patches: patchesToSend,
          version: draftVersion,
        });
        setDraftVersion(prev => prev + 1);
      } catch {
        console.error('Failed to send patches');
        // Re-add to pending for retry
        pendingPatchesRef.current.unshift(...patchesToSend);
      }
    }, 50); // Debounce 50ms
  }, [character.id, draftVersion]);
  void _sendCursorUpdate;
  void _sendPatches;

  // Enhanced save handler that also syncs draft
  const handleSave = async (data: CharacterData, showToastParam = true, tokenImageUrl?: string) => {
    const picture = tokenImageUrl !== undefined ? { tokenImageUrl } : {};
    try {
      setSaving(true);

      let saved: Character;
      let carriedOver = false;
      try {
        ({ character: saved } = await api.updateCharacter(character.id, { data, updatedAt: loadedAt, ...picture }));
      } catch (error) {
        if (!isStaleCharacterSave(error)) throw error;
        const stored = await staleSave.reapply({
          opened: openedSheetRef.current,
          edited: data,
          withNewPicture: tokenImageUrl !== undefined,
          fetchLatest: async () => (await api.getCharacter(character.id)).character,
          onLatest: () => {},
          save: async (merged, updatedAt) =>
            (await api.updateCharacter(character.id, { data: merged, updatedAt, ...picture })).character,
        });
        if (!stored) throw error;
        saved = stored;
        carriedOver = true;
      }

      reportSignedIn();

      if (!carriedOver) {
        setLoadedAt(saved.updatedAt);
        openedSheetRef.current = saved.data;
      }

      // Also update draft
      try {
        await api.patchCharacterDraft(character.id, {
          patches: [], // Empty patches just to sync version
          version: draftVersion,
        });
        setDraftVersion(prev => prev + 1);
      } catch {
        console.warn('Failed to sync draft after save');
      }

      if (showToastParam) {
        showToast('Character saved!', 'success');
      }
    } catch (error) {
      console.error('Error saving character:', errorSummary(error));

      if (isSignedOutSave(error)) {
        reportSignedOut();
        showToast(SIGNED_OUT_NOT_SAVED, 'error');
        throw error;
      }

      if (isStaleCharacterSave(error)) throw error;

      const validationErrors = apiValidationIssues(error);
      if (validationErrors) console.error('Validation errors:', validationErrors);
      showToast(
        refusedSaveMessage(validationErrors ?? [], apiErrorMessage(error), 'Failed to save character'),
        'error'
      );
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!hasUnsignedChanges) {
      onCancel();
      return;
    }
    // Could show confirm dialog here
    onCancel();
  };

  // Check if a field is locked
  const _isFieldLocked = (fieldPath: string) => {
    return locks.some(lock => lock.fieldPath === fieldPath);
  };

  // Check if a field has conflicts
  const _getFieldConflicts = (fieldPath: string) => {
    return conflicts.filter(c => c.fieldPath === fieldPath && !c.resolvedAt);
  };
  void _isFieldLocked;
  void _getFieldConflicts;

  // Render presence indicators
  const renderPresenceIndicators = () => {
    if (presenceUsers.length === 0) return null;

    return (
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2" role="region" aria-label="Collaborative editing presence">
        {presenceUsers.map(user => (
          <Tooltip key={user.userId} content={`${user.displayName}${user.fieldPath ? ` is editing ${user.fieldPath}` : ' is viewing'}${user.isDM ? ' (DM)' : ''}`}>
            <div className="glass-panel px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 border-l-4 border-moss-green animate-slide-in">
              <div className="w-2 h-2 rounded-full bg-moss-green animate-pulse" />
              <span className="text-sm text-brand-ink font-medium">{user.displayName}</span>
              {user.fieldPath && (
                <span className="text-xs text-stone-gray px-2 py-0.5 bg-stone-gray/10 rounded">
                  {user.fieldPath}
                </span>
              )}
            </div>
          </Tooltip>
        ))}
      </div>
    );
  };

  // Render conflict badges on fields (this would be integrated into the actual sheet editors)
  // For now, we show a summary panel

  return (
    <>
      {renderPresenceIndicators()}

      {/* Collaboration Toolbar */}
      <div className="glass-panel mb-4 p-3 rounded-lg border border-moss-green/20 sticky top-0 z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-danger'}`} />
              <span className="text-sm text-ink-secondary">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* Draft Version */}
            <div className="text-sm text-ink-muted">
              Draft v{draftVersion}
            </div>

            {/* Conflict Indicator */}
            {conflicts.some(c => !c.resolvedAt) && (
              <Tooltip content={`${conflicts.filter(c => !c.resolvedAt).length} unresolved conflict(s)`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-warning-ink flex items-center gap-1"
                  onClick={() => setShowConflictPanel(!showConflictPanel)}
                >
                  <AlertTriangle className="w-4 h-4" />
                  {conflicts.filter(c => !c.resolvedAt).length}
                </Button>
              </Tooltip>
            )}

            {/* Lock Indicator */}
            {locks.length > 0 && (
              <Tooltip content={`${locks.length} field(s) locked by DM`}>
                <Button variant="ghost" size="sm" className="text-info-ink flex items-center gap-1">
                  <Lock className="w-4 h-4" />
                  {locks.length}
                </Button>
              </Tooltip>
            )}

            {/* Presence Indicator */}
            {presenceUsers.length > 0 && (
              <Tooltip content={`${presenceUsers.length} other user(s) viewing`}>
                <Button variant="ghost" size="sm" className="text-brand-ink flex items-center gap-1" onClick={() => setShowPresencePanel(!showPresencePanel)}>
                  <Users className="w-4 h-4" />
                  {presenceUsers.length}
                </Button>
              </Tooltip>
            )}
          </div>

          {/* User Role Badge */}
          <div className="flex items-center gap-2">
            {userRole === 'DM' && (
              <Tooltip content="You are the DM">
                <span className="px-2 py-1 text-xs font-medium bg-brand/10 text-brand-ink rounded-full flex items-center gap-1">
                  <UserCog className="w-3 h-3" />
                  DM
                </span>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Conflict Panel */}
        {showConflictPanel && conflicts.some(c => !c.resolvedAt) && (
          <div className="mt-3 p-3 bg-warning/5 border border-warning/20 rounded-lg animate-slide-down">
            <h4 className="text-sm font-medium text-warning-ink mb-2 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Unresolved Conflicts
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {conflicts.filter(c => !c.resolvedAt).map(conflict => (
                <div key={conflict.id} className="text-xs text-ink-secondary p-2 bg-parchment rounded">
                  <div className="font-medium text-warning-ink">{conflict.fieldPath}</div>
                  <div className="text-warning-ink/80">{conflict.description}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 text-xs rounded ${getSeverityColor(conflict.severity)}`}>
                      {conflict.severity}
                    </span>
                    <span className="text-ink-muted/60">{conflict.conflictType}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Presence Panel */}
        {showPresencePanel && presenceUsers.length > 0 && (
          <div className="mt-3 p-3 bg-brand/5 border border-brand/20 rounded-lg animate-slide-down">
            <h4 className="text-sm font-medium text-brand-ink mb-2 flex items-center gap-1">
              <Users className="w-4 h-4" />
              Collaborators
            </h4>
            <div className="space-y-1">
              {presenceUsers.map(user => (
                <div key={user.userId} className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-moss-green" />
                  <span className="font-medium text-ink">{user.displayName}</span>
                  {user.fieldPath && (
                    <span className="text-ink-muted text-xs">editing {user.fieldPath}</span>
                  )}
                  {user.isDM && (
                    <span className="px-1.5 py-0.5 text-xs bg-brand/20 text-brand-ink rounded">DM</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Character Sheet Editor */}
      <CharacterSheetRouter
        onDirtyChange={setHasUnsavedChanges}
        onEditStart={onEditStart}
        character={character}
        mode="edit"
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </>
  );
}

export default CollaborativeCharacterEditor;

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'BLOCKING': return 'bg-danger/20 text-danger-ink';
    case 'ERROR': return 'bg-danger/10 text-danger-ink';
    case 'WARNING': return 'bg-warning/20 text-warning-ink';
    case 'INFO': return 'bg-info/20 text-info-ink';
    default: return 'bg-stone-gray/20 text-stone-gray';
  }
}
