/**
 * Party Pool Settings Modal
 * DM-only settings for pool name, description, default status, withdrawal permissions
 */

import { useEffect, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import api from '@/services/api';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { apiErrorMessage } from '@/utils/errors';
import type { FormattedPoolCurrency, PartyResourcePool } from '@/types';

interface PartyPoolSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: PartyResourcePool & { formatted?: FormattedPoolCurrency };
  onSaved: () => void;
}

export default function PartyPoolSettingsModal({ isOpen, onClose, pool, onSaved }: PartyPoolSettingsModalProps) {
  const { showToast } = useToast();
  const [name, setName] = useState(pool.name);
  const [description, setDescription] = useState(pool.description || '');
  const [isDefault, setIsDefault] = useState(pool.isDefault);
  const [allowPlayerWithdraw, setAllowPlayerWithdraw] = useState(pool.allowPlayerWithdraw);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(pool.name);
    setDescription(pool.description || '');
    setIsDefault(pool.isDefault);
    setAllowPlayerWithdraw(pool.allowPlayerWithdraw);
    setError(null);
  }, [pool]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Pool name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updatePartyPool(pool.campaignId, pool.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        isDefault,
        allowPlayerWithdraw,
      });
      showToast('Pool settings saved', 'success');
      onSaved();
    } catch (err) {
      if (apiErrorMessage(err)?.includes('default')) {
        setError('Another pool is already the default. Unset it first.');
      } else {
        setError(apiErrorMessage(err) ?? 'Failed to save settings');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName(pool.name);
    setDescription(pool.description || '');
    setIsDefault(pool.isDefault);
    setAllowPlayerWithdraw(pool.allowPlayerWithdraw);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={handleClose} title={`Settings: ${pool.name}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-danger-ink" role="alert">{error}</p>}

        <div>
          <label className="block text-xs font-medium text-brand-ink mb-1">Pool Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber"
            maxLength={100}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-brand-ink mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber resize-y"
            maxLength={1000}
            placeholder="What is this pool for?"
          />
        </div>

        <div className="space-y-3 pt-2 border-t border-warm-amber/20">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-brand-ink">Default Pool</label>
              <p className="text-xs text-warm-gray">Automatically selected for new contributions</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={e => setIsDefault(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-warm-amber/20 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-warm-amber/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-warm-amber/30 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-warm-amber"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-brand-ink">Allow Player Withdrawals</label>
              <p className="text-xs text-warm-gray">Players can withdraw from this pool (DMs always can)</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={allowPlayerWithdraw}
                onChange={e => setAllowPlayerWithdraw(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-warm-amber/20 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-warm-amber/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-warm-amber/30 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-warm-amber"></div>
            </label>
          </div>
        </div>

        {/* Current Balance Display */}
        <div className="p-3 rounded-cozy bg-parchment/60 border border-warm-amber/20">
          <div className="text-xs font-medium text-stone-gray mb-1">Current Balance</div>
          <div className="font-mono text-sm text-brand-ink">{pool.formatted?.display || '—'}</div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={handleClose} variant="secondary" disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}