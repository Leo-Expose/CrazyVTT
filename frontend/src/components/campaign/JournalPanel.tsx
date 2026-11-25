/**
 * Journal Panel
 * Main UI for campaign journal/handouts with rich text editing
 */

import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  FolderPlus,
  Plus,
  ChevronDown,
  ChevronRight,
  Edit2,
  Trash2,
  Users,
  Lock,
  Globe,
  Loader2,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';
import api from '@/services/api';
import { JournalVisibility } from '@/types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { apiErrorMessage } from '@/utils/errors';
import JournalEditor from './JournalEditor';

export default function JournalPanel() {
  const { campaign, userRole } = useCampaign();
  const { user } = useAuth();
  const { socket } = useWebSocket();
  const { showToast } = useToast();

  const [folders, setFolders] = useState<import('@/types').JournalFolder[]>([]);
  const [entries, setEntries] = useState<import('@/types').JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<import('@/types').JournalEntry | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [folderForm, setFolderForm] = useState({ name: '', parentId: '', color: '#8FBC8F' });
  const [isDM] = useState(userRole === 'DM');

  const campaignId = campaign?.id;

  const loadData = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const [foldersRes, treeRes] = await Promise.all([
        api.getJournalFolders(campaignId),
        api.getJournalTree(campaignId),
      ]);
      setFolders(foldersRes.folders);
      // Merge entries from tree (which includes visibility filtering)
      setEntries(treeRes.unassignedEntries);
      treeRes.folders.forEach(f => {
        if (f.children) {
          f.children.forEach(c => {
            if (c.entryCount && c.entryCount > 0) {
              // We'll load entries per folder when selected
            }
          });
        }
      });
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Failed to load journal');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const loadEntriesForFolder = useCallback(async (folderId: string | null) => {
    if (!campaignId) return;
    setLoading(true);
    try {
      const { entries: loaded } = await api.listJournalEntries(campaignId, { folderId });
      setEntries(loaded);
      setSelectedFolderId(folderId);
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Failed to load entries');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (campaignId) {
      loadData();
    }
  }, [campaignId, loadData]);

  // WebSocket listeners for real-time updates
  useEffect(() => {
    if (!socket || !campaignId) return;

    const handleCreated = (data: { entry: import('@/types').JournalEntry }) => {
      setEntries(prev => [data.entry, ...prev]);
    };
    const handleUpdated = (data: { entry: import('@/types').JournalEntry }) => {
      setEntries(prev => prev.map(e => e.id === data.entry.id ? data.entry : e));
      if (selectedEntry?.id === data.entry.id) {
        setSelectedEntry(data.entry);
      }
    };
    const handleDeleted = (data: { entryId: string }) => {
      setEntries(prev => prev.filter(e => e.id !== data.entryId));
      if (selectedEntry?.id === data.entryId) {
        setSelectedEntry(null);
      }
    };
    const handleFolderCreated = (data: { folder: import('@/types').JournalFolder }) => {
      setFolders(prev => [...prev, data.folder]);
    };
    const handleFolderUpdated = (data: { folder: import('@/types').JournalFolder }) => {
      setFolders(prev => prev.map(f => f.id === data.folder.id ? data.folder : f));
    };
    const handleFolderDeleted = (data: { folderId: string }) => {
      setFolders(prev => prev.filter(f => f.id !== data.folderId));
      if (selectedFolderId === data.folderId) {
        setSelectedFolderId(null);
        loadEntriesForFolder(null);
      }
    };

    socket.on('journal.created', handleCreated);
    socket.on('journal.updated', handleUpdated);
    socket.on('journal.deleted', handleDeleted);
    socket.on('journal.folder.created', handleFolderCreated);
    socket.on('journal.folder.updated', handleFolderUpdated);
    socket.on('journal.folder.deleted', handleFolderDeleted);

    return () => {
      socket.off('journal.created', handleCreated);
      socket.off('journal.updated', handleUpdated);
      socket.off('journal.deleted', handleDeleted);
      socket.off('journal.folder.created', handleFolderCreated);
      socket.off('journal.folder.updated', handleFolderUpdated);
      socket.off('journal.folder.deleted', handleFolderDeleted);
    };
  }, [socket, campaignId, loadEntriesForFolder, selectedEntry?.id, selectedFolderId]);

  if (!campaignId) return null;

  const isOwner = user?.id === selectedEntry?.createdById;
  const canEdit = isDM || isOwner;

  const visibilityIcon = (vis: JournalVisibility) => {
    switch (vis) {
      case 'PUBLIC': return <Globe className="w-3.5 h-3.5" />;
      case 'DM_ONLY': return <Lock className="w-3.5 h-3.5" />;
      case 'PLAYER_SPECIFIC': return <Users className="w-3.5 h-3.5" />;
    }
  };

  const visibilityLabel = (vis: JournalVisibility) => {
    switch (vis) {
      case 'PUBLIC': return 'Public';
      case 'DM_ONLY': return 'DM Only';
      case 'PLAYER_SPECIFIC': return 'Specific Players';
    }
  };

  const visibilityColor = (vis: JournalVisibility) => {
    switch (vis) {
      case 'PUBLIC': return 'text-moss-green';
      case 'DM_ONLY': return 'text-blue-600';
      case 'PLAYER_SPECIFIC': return 'text-purple-600';
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderForm.name.trim()) return;
    try {
      await api.createJournalFolder(campaignId, {
        name: folderForm.name.trim(),
        parentId: folderForm.parentId || undefined,
        color: folderForm.color,
      });
      setShowCreateFolder(false);
      setFolderForm({ name: '', parentId: '', color: '#8FBC8F' });
      showToast('Folder created', 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to create folder', 'error');
    }
  };

  const handleCreateEntry = async () => {
    try {
      const { entry } = await api.createJournalEntry(campaignId, {
        title: 'New Entry',
        content: '',
        visibility: 'PUBLIC',
        folderId: selectedFolderId || undefined,
      });
      setSelectedEntry(entry);
      setShowCreateEntry(false);
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to create entry', 'error');
    }
  };

  const handleDeleteEntry = async () => {
    if (!selectedEntry || !window.confirm(`Delete "${selectedEntry.title}"?`)) return;
    try {
      await api.deleteJournalEntry(campaignId, selectedEntry.id);
      setSelectedEntry(null);
      showToast('Entry deleted', 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to delete entry', 'error');
    }
  };

  const handleUpdateFolder = async (folder: import('@/types').JournalFolder) => {
    try {
      await api.updateJournalFolder(campaignId, folder.id, {
        name: folder.name,
        parentId: folder.parentId,
        color: folder.color ?? undefined,
        sortOrder: folder.sortOrder,
      });
      showToast('Folder updated', 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to update folder', 'error');
    }
  };

  const handleDeleteFolder = async (folder: import('@/types').JournalFolder) => {
    if (!window.confirm(`Delete folder "${folder.name}" and move entries to root?`)) return;
    try {
      await api.deleteJournalFolder(campaignId, folder.id, false);
      setSelectedFolderId(null);
      showToast('Folder deleted', 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to delete folder', 'error');
    }
  };

  const getFolderOptions = () => {
    const options: { value: string; label: string }[] = [{ value: '', label: '— Root —' }];
    const addOptions = (folders: import('@/types').JournalFolder[], prefix = '') => {
      folders.forEach(f => {
        options.push({ value: f.id, label: `${prefix}${f.name}` });
        if (f.children?.length) addOptions(f.children, `${prefix}  `);
      });
    };
    addOptions(folders);
    return options;
  };

  if (loading && folders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-warm-amber" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar - Folder Tree */}
      <div className="w-64 border-r border-warm-amber/20 bg-parchment/30 flex flex-col">
        <div className="p-3 border-b border-warm-amber/20 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand-ink flex items-center gap-1">
            <BookOpen className="w-4 h-4" />
            Journal
          </h3>
          {isDM && (
            <Button onClick={() => setShowCreateFolder(true)} variant="ghost" size="sm" className="p-1">
              <FolderPlus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {folders.filter(f => !f.parentId).map(folder => (
            <FolderTreeNode
              key={folder.id}
              folder={folder}
              allFolders={folders}
              selectedFolderId={selectedFolderId}
              onSelect={loadEntriesForFolder}
              onEdit={isDM ? handleUpdateFolder : undefined}
              onDelete={isDM ? handleDeleteFolder : undefined}
            />
          ))}
          {folders.length === 0 && !isDM && (
            <p className="text-xs text-warm-gray text-center py-4">No folders yet. Ask your DM to create some.</p>
          )}
        </div>

        {isDM && (
          <div className="p-3 border-t border-warm-amber/20">
            <Button onClick={() => setShowCreateFolder(true)} variant="secondary" className="w-full gap-1">
              <FolderPlus className="w-3.5 h-3.5" />
              New Folder
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 w-72 border-r border-warm-amber/20 bg-parchment/20 flex flex-col">
        {/* Entries List */}
        <div className="p-3 border-b border-warm-amber/20 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-brand-ink">
            {selectedFolderId ? (
              folders.find(f => f.id === selectedFolderId)?.name || 'Loading...'
            ) : (
              'All Entries'
            )}
          </h4>
          {(isDM || selectedFolderId !== null || folders.length === 0) && (
            <Button onClick={() => setShowCreateEntry(true)} size="sm" className="gap-1">
              <Plus className="w-3.5 h-3.5" />
              New
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {entries.length === 0 ? (
            <p className="text-xs text-warm-gray text-center py-8">
              No entries in this folder. {isDM || folders.length === 0 ? 'Create one!' : 'Select a folder or ask your DM.'}
            </p>
          ) : (
            entries.map(entry => (
              <EntryListItem
                key={entry.id}
                entry={entry}
                selected={selectedEntry?.id === entry.id}
                onClick={() => setSelectedEntry(entry)}
                visibilityIcon={visibilityIcon(entry.visibility)}
                visibilityLabel={visibilityLabel(entry.visibility)}
                visibilityColor={visibilityColor(entry.visibility)}
              />
            ))
          )}
        </div>
      </div>

      {/* Entry Viewer/Editor */}
      <div className="flex-1 min-w-0 flex flex-col">
        {selectedEntry ? (
          <div className="flex-1 flex flex-col">
            <div className="p-3 border-b border-warm-amber/20 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={visibilityColor(selectedEntry.visibility)}>
                  {visibilityIcon(selectedEntry.visibility)}
                </span>
                <input
                  type="text"
                  value={selectedEntry.title}
                  onChange={e => {
                    if (canEdit) {
                      const updated = { ...selectedEntry, title: e.target.value };
                      setSelectedEntry(updated);
                      api.updateJournalEntry(campaignId, selectedEntry.id, { title: e.target.value });
                    }
                  }}
                  readOnly={!canEdit}
                  className="text-lg font-semibold text-brand-ink bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-warm-amber rounded px-1 min-w-0"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[11px] px-1.5 py-0.5 rounded bg-${visibilityColor(selectedEntry.visibility).replace('text-', '')}/10 ${visibilityColor(selectedEntry.visibility)}`}>
                  {visibilityLabel(selectedEntry.visibility)}
                </span>
                {canEdit && (
                  <>
                    <Button onClick={() => {
                      const updated = { ...selectedEntry, content: selectedEntry.content };
                      setSelectedEntry(updated);
                    }} variant="ghost" size="sm" className="p-1" title="Edit">
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button onClick={handleDeleteEntry} variant="ghost" size="sm" className="p-1 text-danger-ink hover:bg-danger/10" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <JournalEditor
                entry={selectedEntry}
                readOnly={!canEdit}
                onSave={async (content) => {
                  try {
                    await api.updateJournalEntry(campaignId, selectedEntry.id, { content });
                    setSelectedEntry({ ...selectedEntry, content });
                    showToast('Saved', 'success');
                  } catch (err) {
                    showToast(apiErrorMessage(err) ?? 'Failed to save', 'error');
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-warm-gray">
            <div className="text-center">
              <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">Select an entry to read</p>
              <p className="text-sm mt-1">Or create a new one from the list</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <Modal open={showCreateFolder} onClose={() => { setShowCreateFolder(false); setFolderForm({ name: '', parentId: '', color: '#8FBC8F' }); }} title="Create Folder">
          <form onSubmit={handleCreateFolder} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-brand-ink mb-1">Folder Name</label>
              <input
                type="text"
                value={folderForm.name}
                onChange={e => setFolderForm({ ...folderForm, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-ink mb-1">Parent Folder (optional)</label>
              <select
                value={folderForm.parentId}
                onChange={e => setFolderForm({ ...folderForm, parentId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber"
              >
                <option value="">— Root —</option>
                {getFolderOptions().slice(1).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-ink mb-1">Color</label>
              <input
                type="color"
                value={folderForm.color}
                onChange={e => setFolderForm({ ...folderForm, color: e.target.value })}
                className="w-12 h-10 rounded border border-warm-amber/30 cursor-pointer"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" onClick={() => { setShowCreateFolder(false); setFolderForm({ name: '', parentId: '', color: '#8FBC8F' }); }} variant="secondary">
                Cancel
              </Button>
              <Button type="submit">Create Folder</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create Entry confirmation */}
      {showCreateEntry && (
        <Modal open={showCreateEntry} onClose={() => setShowCreateEntry(false)} title="Create New Entry">
          <p className="text-sm text-ink-secondary mb-4">Create a new journal entry in the current folder?</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowCreateEntry(false)} variant="secondary">Cancel</Button>
            <Button onClick={handleCreateEntry}>Create</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Folder Tree Node Component
interface FolderTreeNodeProps {
  folder: import('@/types').JournalFolder;
  allFolders: import('@/types').JournalFolder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onEdit?: (folder: import('@/types').JournalFolder) => void;
  onDelete?: (folder: import('@/types').JournalFolder) => void;
}

function FolderTreeNode({ folder, allFolders, selectedFolderId, onSelect, onEdit, onDelete }: FolderTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const children = allFolders.filter(f => f.parentId === folder.id);
  const isSelected = selectedFolderId === folder.id;

  return (
    <div className="group">
      <button
        onClick={() => onSelect(folder.id)}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-cozy text-left transition-colors ${
          isSelected ? 'bg-warm-amber/20 text-brand-ink font-medium' : 'text-stone-gray hover:bg-parchment/50'
        }`}
      >
        <button
          onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
          className="p-0.5 text-stone-gray hover:text-brand-ink"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <span className="flex-1 truncate text-sm">{folder.name}</span>
        {(folder.entryCount ?? 0) > 0 && (
          <span className="text-[10px] text-warm-gray px-1.5 py-0.5 rounded bg-warm-amber/10">{folder.entryCount}</span>
        )}
      </button>
      {onEdit || onDelete ? (
        <div className="opacity-0 group-hover:opacity-100 absolute right-1 top-1 flex gap-0.5 transition-opacity">
          {onEdit && (
            <button onClick={e => { e.stopPropagation(); onEdit(folder); }} className="p-1 rounded hover:bg-warm-amber/10 text-stone-gray hover:text-brand-ink" title="Edit">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button onClick={e => { e.stopPropagation(); onDelete(folder); }} className="p-1 rounded hover:bg-danger/10 text-stone-gray hover:text-danger-ink" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : null}
      {expanded && children.length > 0 && (
        <div className="ml-4 space-y-1">
          {children.map(child => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              allFolders={allFolders}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Entry List Item Component
interface EntryListItemProps {
  entry: import('@/types').JournalEntry;
  selected: boolean;
  onClick: () => void;
  visibilityIcon: React.ReactNode;
  visibilityLabel: string;
  visibilityColor: string;
}

function EntryListItem({ entry, selected, onClick, visibilityIcon, visibilityLabel, visibilityColor }: EntryListItemProps) {
  const updatedAt = new Date(entry.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-2 p-2 rounded-cozy text-left transition-colors ${
        selected ? 'bg-warm-amber/20 border border-warm-amber/30' : 'hover:bg-parchment/50'
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {visibilityIcon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-brand-ink truncate block">{entry.title}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${visibilityColor.replace('text-', 'bg-')}/10 ${visibilityColor}`}>
            {visibilityLabel}
          </span>
        </div>
        <p className="text-[11px] text-warm-gray truncate mt-0.5">{updatedAt}</p>
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {entry.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] text-stone-gray px-1.5 py-0.5 rounded bg-parchment/50">{tag}</span>
            ))}
            {entry.tags.length > 3 && <span className="text-[10px] text-warm-gray">+{entry.tags.length - 3}</span>}
          </div>
        )}
      </div>
    </button>
  );
}
