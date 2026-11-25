/**
 * Party Pool Panel
 * Main UI for campaign shared resources (gold, consumables, etc.)
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, Coins, ScrollText, ChevronDown, ChevronRight, Settings, Trash2, Edit2, ArrowDownToLine, ArrowUpFromLine, MoreHorizontal } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import api from '@/services/api';
import { CampaignRole } from '@/types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { apiErrorMessage } from '@/utils/errors';
import PartyPoolContributeModal from './PartyPoolContributeModal';
import PartyPoolWithdrawModal from './PartyPoolWithdrawModal';
import PartyPoolTransactionLog from './PartyPoolTransactionLog';
import PartyPoolSettingsModal from './PartyPoolSettingsModal';
import { formatPoolCurrency } from '@/utils/currency';

export default function PartyPoolPanel() {
  const { campaign, userRole, refreshCampaign } = useCampaign();
  const { user } = useAuth();
  const { socket } = useWebSocket();
  const { showToast } = useToast();

  const [pools, setPools] = useState<Array<import('@/types').PartyResourcePool & { formatted: import('@/types').FormattedPoolCurrency }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPoolId, setExpandedPoolId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsPool, setSettingsPool] = useState<import('@/types').PartyResourcePool | null>(null);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [contributePool, setContributePool] = useState<import('@/types').PartyResourcePool | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawPool, setWithdrawPool] = useState<import('@/types').PartyResourcePool | null>(null);
  const [showTransactionLog, setShowTransactionLog] = useState(false);
  const [transactionLogPool, setTransactionLogPool] = useState<import('@/types').PartyResourcePool | null>(null);
  const [deleteConfirmPool, setDeleteConfirmPool] = useState<import('@/types').PartyResourcePool | null>(null);
  const [isDM] = useState(userRole === 'DM');

  const campaignId = campaign?.id;

  const loadPools = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const { pools: fetched } = await api.listPartyPools(campaignId);
      setPools(fetched);
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not load party pools.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (campaignId) loadPools();
  }, [campaignId, loadPools]);

  // WebSocket listeners for real-time updates
  useEffect(() => {
    if (!socket || !campaignId) return;

    const handlePoolCreated = (data: { pool: import('@/types').PartyResourcePool & { formatted: import('@/types').FormattedPoolCurrency } }) => {
      setPools(prev => [...prev, data.pool].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)));
    };
    const handlePoolUpdated = (data: { pool: import('@/types').PartyResourcePool }) => {
      setPools(prev => prev.map(p => p.id === data.pool.id ? { ...p, ...data.pool } : p));
    };
    const handlePoolDeleted = (data: { poolId: string }) => {
      setPools(prev => prev.filter(p => p.id !== data.poolId));
    };

    socket.on('pool.created', handlePoolCreated);
    socket.on('pool.updated', handlePoolUpdated);
    socket.on('pool.deleted', handlePoolDeleted);

    return () => {
      socket.off('pool.created', handlePoolCreated);
      socket.off('pool.updated', handlePoolUpdated);
      socket.off('pool.deleted', handlePoolDeleted);
    };
  }, [socket, campaignId]);

  if (!campaignId) return null;

  const canManage = isDM || campaign?.ownerId === user?.id;

  const handleCreatePool = async (data: {
    name: string;
    description?: string;
    cp?: number;
    sp?: number;
    ep?: number;
    gp?: number;
    pp?: number;
    nuyen?: number;
    cash?: number;
    custom?: Record<string, number>;
    isDefault?: boolean;
    allowPlayerWithdraw?: boolean;
  }) => {
    try {
      await api.createPartyPool(campaignId, data);
      showToast('Pool created', 'success');
      setShowCreateModal(false);
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to create pool', 'error');
    }
  };

  const handleOpenSettings = (pool: import('@/types').PartyResourcePool) => {
    setSettingsPool(pool);
    setShowSettingsModal(true);
  };

  const handleOpenContribute = (pool: import('@/types').PartyResourcePool) => {
    setContributePool(pool);
    setShowContributeModal(true);
  };

  const handleOpenWithdraw = (pool: import('@/types').PartyResourcePool) => {
    setWithdrawPool(pool);
    setShowWithdrawModal(true);
  };

  const handleOpenTransactionLog = (pool: import('@/types').PartyResourcePool) => {
    setTransactionLogPool(pool);
    setShowTransactionLog(true);
  };

  const handleDeletePool = async (pool: import('@/types').PartyResourcePool) => {
    setDeleteConfirmPool(pool);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmPool) return;
    try {
      await api.deletePartyPool(campaignId, deleteConfirmPool.id, false);
      showToast('Pool deleted', 'success');
      setDeleteConfirmPool(null);
    } catch (err) {
      if (apiErrorMessage(err)?.includes('has currency')) {
        const confirm = window.confirm('Pool has currency. Force delete anyway?');
        if (confirm) {
          try {
            await api.deletePartyPool(campaignId, deleteConfirmPool.id, true);
            showToast('Pool deleted', 'success');
            setDeleteConfirmPool(null);
          } catch (err2) {
            showToast(apiErrorMessage(err2) ?? 'Failed to delete pool', 'error');
          }
        }
      } else {
        showToast(apiErrorMessage(err) ?? 'Failed to delete pool', 'error');
      }
    }
  };

  const handleSettingsSaved = async () => {
    await loadPools();
    setShowSettingsModal(false);
    setSettingsPool(null);
  };

  const handleContributeSuccess = async () => {
    await loadPools();
    setShowContributeModal(false);
    setContributePool(null);
  };

  const handleWithdrawSuccess = async () => {
    await loadPools();
    setShowWithdrawModal(false);
    setWithdrawPool(null);
  };

  const defaultPool = pools.find(p => p.isDefault);
  const otherPools = pools.filter(p => !p.isDefault);

  return (
    <div className="glass-panel p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-accent-ink" />
          <h3 className="text-sm font-semibold text-brand-ink">Party Resources</h3>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreateModal(true)} variant="secondary" size="sm" className="gap-1">
            <Plus className="w-3.5 h-3.5" />
            New Pool
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-danger-ink" role="alert">{error}</p>}

      {loading && pools.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-ink-secondary">
          <div className="w-4 h-4 border-2 border-warm-amber border-t-transparent rounded-full animate-spin" />
          Loading pools…
        </div>
      ) : pools.length === 0 ? (
        <p className="text-xs text-warm-gray text-center py-4">
          No resource pools yet. {canManage ? 'Create one to start pooling party gold!' : 'Ask your DM to create a pool.'}
        </p>
      ) : (
        <div className="space-y-3">
          {/* Default Pool */}
          {defaultPool && (
            <PoolCard
              pool={defaultPool}
              isDefault
              expanded={expandedPoolId === defaultPool.id}
              onToggle={() => setExpandedPoolId(expandedPoolId === defaultPool.id ? null : defaultPool.id)}
              onSettings={handleOpenSettings}
              onContribute={handleOpenContribute}
              onWithdraw={handleOpenWithdraw}
              onTransactionLog={handleOpenTransactionLog}
              onDelete={handleDeletePool}
              canManage={canManage}
              userRole={userRole}
              allowPlayerWithdraw={defaultPool.allowPlayerWithdraw}
            />
          )}

          {/* Other Pools */}
          {otherPools.length > 0 && (
            <div className="space-y-2">
              {otherPools.map(pool => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  isDefault={false}
                  expanded={expandedPoolId === pool.id}
                  onToggle={() => setExpandedPoolId(expandedPoolId === pool.id ? null : pool.id)}
                  onSettings={handleOpenSettings}
                  onContribute={handleOpenContribute}
                  onWithdraw={handleOpenWithdraw}
                  onTransactionLog={handleOpenTransactionLog}
                  onDelete={handleDeletePool}
                  canManage={canManage}
                  userRole={userRole}
                  allowPlayerWithdraw={pool.allowPlayerWithdraw}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Pool Modal */}
      <PartyPoolCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreatePool}
        gameSystem={campaign?.gameSystem}
      />

      {/* Settings Modal */}
      {settingsPool && (
        <PartyPoolSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          pool={settingsPool}
          onSaved={handleSettingsSaved}
        />
      )}

      {/* Contribute Modal */}
      {contributePool && (
        <PartyPoolContributeModal
          isOpen={showContributeModal}
          onClose={() => setShowContributeModal(false)}
          pool={contributePool}
          onSuccess={handleContributeSuccess}
        />
      )}

      {/* Withdraw Modal */}
      {withdrawPool && (
        <PartyPoolWithdrawModal
          isOpen={showWithdrawModal}
          onClose={() => setShowWithdrawModal(false)}
          pool={withdrawPool}
          onSuccess={handleWithdrawSuccess}
        />
      )}

      {/* Transaction Log Modal */}
      {transactionLogPool && (
        <PartyPoolTransactionLog
          isOpen={showTransactionLog}
          onClose={() => setShowTransactionLog(false)}
          pool={transactionLogPool}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirmPool && (
        <ConfirmDialog
          isOpen={!!deleteConfirmPool}
          onClose={() => setDeleteConfirmPool(null)}
          onConfirm={handleConfirmDelete}
          title="Delete Pool"
          message={deleteConfirmPool.cp || deleteConfirmPool.sp || deleteConfirmPool.ep || deleteConfirmPool.gp || deleteConfirmPool.pp || deleteConfirmPool.nuyen || deleteConfirmPool.cash
            ? 'This pool has currency in it. Are you sure you want to delete it? This action cannot be undone.'
            : `Delete "${deleteConfirmPool.name}"? This action cannot be undone.`}
          confirmText="Delete"
          variant="danger"
        />
      )}
    </div>
  );
}

// Pool Card Component
interface PoolCardProps {
  pool: import('@/types').PartyResourcePool & { formatted: import('@/types').FormattedPoolCurrency };
  isDefault: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSettings: (pool: import('@/types').PartyResourcePool) => void;
  onContribute: (pool: import('@/types').PartyResourcePool) => void;
  onWithdraw: (pool: import('@/types').PartyResourcePool) => void;
  onTransactionLog: (pool: import('@/types').PartyResourcePool) => void;
  onDelete: (pool: import('@/types').PartyResourcePool) => void;
  canManage: boolean;
  userRole: CampaignRole;
  allowPlayerWithdraw: boolean;
}

function PoolCard({
  pool,
  isDefault,
  expanded,
  onToggle,
  onSettings,
  onContribute,
  onWithdraw,
  onTransactionLog,
  onDelete,
  canManage,
  userRole,
  allowPlayerWithdraw,
}: PoolCardProps) {
  const isDM = userRole === 'DM';
  const canWithdraw = isDM || allowPlayerWithdraw;

  return (
    <div className="rounded-cozy border border-warm-amber/30 bg-parchment/40 overflow-hidden">
      {/* Pool Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 p-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isDefault && <span className="text-[10px] font-semibold text-warm-amber px-1.5 py-0.5 rounded bg-warm-amber/10">Default</span>}
          <h4 className="text-sm font-semibold text-brand-ink truncate">{pool.name}</h4>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="text-right min-w-[100px]">
            <div className="text-xs font-mono font-semibold text-brand-ink">{pool.formatted.shortDisplay}</div>
            <div className="text-[10px] text-warm-gray">{pool.formatted.display}</div>
          </div>
          <div className="flex items-center gap-1">
            {canManage && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); onSettings(pool); }}
                  className="p-1.5 rounded-sm hover:bg-moss-green/10 text-stone-gray hover:text-brand-ink"
                  title="Settings"
                  aria-label="Pool settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(pool); }}
                  className="p-1.5 rounded-sm hover:bg-danger/10 text-stone-gray hover:text-danger-ink"
                  title="Delete pool"
                  aria-label="Delete pool"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-stone-gray" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-gray" />}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-warm-amber/20 p-3 space-y-3">
          {pool.description && (
            <p className="text-xs text-brand-ink whitespace-pre-wrap">{pool.description}</p>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => onContribute(pool)}
              variant="secondary"
              size="sm"
              className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              Contribute
            </Button>
            {canWithdraw && (
              <Button
                onClick={() => onWithdraw(pool)}
                variant="secondary"
                size="sm"
                className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5"
              >
                <ArrowUpFromLine className="w-3.5 h-3.5" />
                Withdraw
              </Button>
            )}
            {!canWithdraw && !isDM && (
              <Button
                disabled
                variant="secondary"
                size="sm"
                className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 opacity-50"
                title="Withdrawals not allowed for this pool"
              >
                <ArrowUpFromLine className="w-3.5 h-3.5" />
                Withdraw
              </Button>
            )}
            <Button
              onClick={() => onTransactionLog(pool)}
              variant="secondary"
              size="sm"
              className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5"
            >
              <ScrollText className="w-3.5 h-3.5" />
              History
            </Button>
          </div>

          {/* Settings Info */}
          <div className="text-[11px] text-warm-gray space-y-1">
            <div className="flex items-center gap-1.5">
              {allowPlayerWithdraw ? (
                <span className="flex items-center gap-1 text-moss-green">
                  <span className="w-1.5 h-1.5 rounded-full bg-moss-green" />
                  Player withdrawals allowed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-warm-amber">
                  <span className="w-1.5 h-1.5 rounded-full bg-warm-amber" />
                  DM-only withdrawals
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Create Pool Modal
interface PartyPoolCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    cp?: number;
    sp?: number;
    ep?: number;
    gp?: number;
    pp?: number;
    nuyen?: number;
    cash?: number;
    custom?: Record<string, number>;
    isDefault?: boolean;
    allowPlayerWithdraw?: boolean;
  }) => void;
  gameSystem: string | null;
}

function PartyPoolCreateModal({ isOpen, onClose, onSubmit, gameSystem }: PartyPoolCreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [allowPlayerWithdraw, setAllowPlayerWithdraw] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Currency inputs based on game system
  const [cp, setCp] = useState(0);
  const [sp, setSp] = useState(0);
  const [ep, setEp] = useState(0);
  const [gp, setGp] = useState(0);
  const [pp, setPp] = useState(0);
  const [nuyen, setNuyen] = useState(0);
  const [cash, setCash] = useState(0);

  const isDnD = gameSystem?.startsWith('DND') || gameSystem === 'PATHFINDER_2E';
  const isShadowrun = gameSystem === 'SHADOWRUN_6E';
  const isCoC = gameSystem === 'CALL_OF_CTHULHU_7E';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Pool name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data: Parameters<typeof onSubmit>[0] = {
        name: name.trim(),
        description: description.trim() || undefined,
        isDefault,
        allowPlayerWithdraw,
      };
      if (isDnD) {
        data.cp = cp; data.sp = sp; data.ep = ep; data.gp = gp; data.pp = pp;
      } else if (isShadowrun) {
        data.nuyen = nuyen;
      } else if (isCoC) {
        data.cash = cash;
      }
      await onSubmit(data);
    } catch {
      setError('Failed to create pool');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName(''); setDescription(''); setIsDefault(false); setAllowPlayerWithdraw(true);
    setCp(0); setSp(0); setEp(0); setGp(0); setPp(0); setNuyen(0); setCash(0);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={handleClose} title="Create Resource Pool" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-danger-ink" role="alert">{error}</p>}

        <div>
          <label className="block text-xs font-medium text-brand-ink mb-1">Pool Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Party Gold, Ship Fund, etc."
            className="w-full px-3 py-2 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber"
            maxLength={100}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-brand-ink mb-1">Description (optional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What is this pool for?"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber resize-y"
            maxLength={1000}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-xs font-medium text-brand-ink mb-2">Initial Currency</legend>
          {isDnD && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <CurrencyInput label="CP" value={cp} onChange={setCp} />
              <CurrencyInput label="SP" value={sp} onChange={setSp} />
              <CurrencyInput label="EP" value={ep} onChange={setEp} />
              <CurrencyInput label="GP" value={gp} onChange={setGp} />
              <CurrencyInput label="PP" value={pp} onChange={setPp} />
            </div>
          )}
          {isShadowrun && (
            <CurrencyInput label="Nuyen (¥)" value={nuyen} onChange={setNuyen} className="sm:max-w-xs" />
          )}
          {isCoC && (
            <CurrencyInput label="Cash ($)" value={cash} onChange={setCash} className="sm:max-w-xs" step="0.01" />
          )}
          {!isDnD && !isShadowrun && !isCoC && (
            <p className="text-xs text-warm-gray">Select a game system in campaign settings to see currency fields.</p>
          )}
        </fieldset>

        <div className="space-y-2 pt-2 border-t border-warm-amber/20">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-warm-amber/30 text-warm-amber focus:ring-warm-amber"
            />
            <span className="text-sm text-brand-ink">Make this the default pool</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowPlayerWithdraw}
              onChange={e => setAllowPlayerWithdraw(e.target.checked)}
              className="w-4 h-4 rounded border-warm-amber/30 text-warm-amber focus:ring-warm-amber"
            />
            <span className="text-sm text-brand-ink">Allow players to withdraw</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={handleClose} variant="secondary" disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating…' : 'Create Pool'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CurrencyInput({ label, value, onChange, className = '', step = '1' }: { label: string; value: number; onChange: (v: number) => void; className?: string; step?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[11px] font-medium text-stone-gray">{label}</label>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={e => onChange(parseInt(e.target.value) || 0)}
        className="w-full px-2 py-1.5 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber"
      />
    </div>
  );
}