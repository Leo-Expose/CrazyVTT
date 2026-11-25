/**
 * Party Pool Transaction Log
 * Full paginated history of pool transactions
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Filter, Download } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import api from '@/services/api';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { apiErrorMessage } from '@/utils/errors';
import { formatPoolCurrency } from '@/utils/currency';
import type { PartyResourcePool, PartyResourceTransaction, PoolTransactionType } from '@/types';

interface PartyPoolTransactionLogProps {
  isOpen: boolean;
  onClose: () => void;
  pool: PartyResourcePool & { formatted: import('@/types').FormattedPoolCurrency };
}

const TRANSACTION_TYPE_LABELS: Record<PoolTransactionType, string> = {
  CONTRIBUTE: 'Contributed',
  WITHDRAW: 'Withdrew',
  DM_ADJUST: 'DM Adjusted',
  SPEND: 'Spent',
  LOOT_DEPOSIT: 'Loot Deposit',
};

const TRANSACTION_TYPE_COLORS: Record<PoolTransactionType, string> = {
  CONTRIBUTE: 'text-moss-green',
  WITHDRAW: 'text-warm-amber',
  DM_ADJUST: 'text-blue-600',
  SPEND: 'text-danger-ink',
  LOOT_DEPOSIT: 'text-purple-600',
};

export default function PartyPoolTransactionLog({ isOpen, onClose, pool }: PartyPoolTransactionLogProps) {
  const { showToast } = useToast();
  const [transactions, setTransactions] = useState<PartyResourceTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterType, setFilterType] = useState<PoolTransactionType | 'ALL'>('ALL');

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getPartyPoolTransactions(pool.campaignId, pool.id, page, 20);
      setTransactions(result.transactions);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [pool.campaignId, pool.id, page]);

  useEffect(() => {
    if (isOpen) {
      setPage(1);
      loadTransactions();
    }
  }, [isOpen, loadTransactions]);

  // Apply client-side filter
  const filteredTransactions = filterType === 'ALL'
    ? transactions
    : transactions.filter(t => t.type === filterType);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const getAmountDisplay = (tx: PartyResourceTransaction) => {
    const amounts: import('@/types').PoolCurrencyAmount = {
      cp: tx.cp, sp: tx.sp, ep: tx.ep, gp: tx.gp, pp: tx.pp,
      nuyen: tx.nuyen, cash: tx.cash, custom: tx.custom || undefined,
    };
    // For DM_ADJUST, we don't know direction from amounts alone
    // We could infer from description or just show absolute
    const formatted = formatPoolCurrency(amounts, 'DND_5E');
    return formatted.display;
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose} title={`Transaction History: ${pool.name}`} size="lg">
      <div className="space-y-4">
        {error && <p className="text-xs text-danger-ink" role="alert">{error}</p>}

        {/* Summary */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-warm-gray">
            {total} transaction{total !== 1 ? 's' : ''}
            {filteredTransactions.length !== transactions.length && (
              <> • {filteredTransactions.length} filtered</>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as PoolTransactionType | 'ALL')}
              className="px-2 py-1 text-xs border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber"
            >
              <option value="ALL">All Types</option>
              <option value="CONTRIBUTE">Contributions</option>
              <option value="WITHDRAW">Withdrawals</option>
              <option value="DM_ADJUST">DM Adjustments</option>
              <option value="SPEND">Spending</option>
              <option value="LOOT_DEPOSIT">Loot Deposits</option>
            </select>
            <Button variant="secondary" size="sm" className="gap-1">
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Transaction Table */}
        <div className="max-h-96 overflow-y-auto">
          {loading && transactions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-warm-amber border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-xs text-ink-secondary">Loading…</span>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <p className="text-xs text-warm-gray text-center py-8">
              {filterType === 'ALL' ? 'No transactions yet' : `No ${filterType.toLowerCase()} transactions`}
            </p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-warm-amber/20 sticky top-0 bg-parchment/80 backdrop-blur-sm">
                  <th className="text-left p-2 font-medium text-stone-gray">Date</th>
                  <th className="text-left p-2 font-medium text-stone-gray">Type</th>
                  <th className="text-left p-2 font-medium text-stone-gray">Character</th>
                  <th className="text-right p-2 font-medium text-stone-gray">Amount</th>
                  <th className="text-left p-2 font-medium text-stone-gray">Description</th>
                  <th className="text-left p-2 font-medium text-stone-gray">By</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map(tx => (
                  <tr key={tx.id} className="border-b border-warm-amber/10 hover:bg-parchment/40">
                    <td className="p-2 text-warm-gray whitespace-nowrap">{formatDate(tx.createdAt)}</td>
                    <td className="p-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${TRANSACTION_TYPE_COLORS[tx.type]}`}>
                        {TRANSACTION_TYPE_LABELS[tx.type]}
                      </span>
                    </td>
                    <td className="p-2 text-brand-ink">
                      {tx.character?.name ?? (tx.characterId ? 'Unknown' : '—')}
                    </td>
                    <td className="p-2 font-mono text-right text-brand-ink">
                      {getAmountDisplay(tx)}
                    </td>
                    <td className="p-2 text-brand-ink max-w-xs truncate" title={tx.description}>
                      {tx.description}
                    </td>
                    <td className="p-2 text-warm-gray">
                      {tx.createdBy?.displayName ?? 'Unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2 border-t border-warm-amber/20">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs text-stone-gray px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}