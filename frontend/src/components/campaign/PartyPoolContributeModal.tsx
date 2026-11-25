/**
 * Party Pool Contribute Modal
 * Character contributes currency from their containers to the party pool
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import api from '@/services/api';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { apiErrorMessage } from '@/utils/errors';
import { formatPoolCurrency } from '@/utils/currency';
import type { PartyResourcePool, PoolCurrencyAmount } from '@/types';

interface PartyPoolContributeModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: PartyResourcePool & { formatted: import('@/types').FormattedPoolCurrency };
  onSuccess: () => void;
}

export default function PartyPoolContributeModal({ isOpen, onClose, pool, onSuccess }: PartyPoolContributeModalProps) {
  const { campaign } = useCampaign();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [characters, setCharacters] = useState<Array<{ id: string; name: string; userId: string; currency: PoolCurrencyAmount; formatted: import('@/types').FormattedPoolCurrency }>>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Currency amounts to contribute
  const [amounts, setAmounts] = useState<PoolCurrencyAmount>({
    cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0,
  });
  const [description, setDescription] = useState('');

  const campaignId = campaign?.id;
  const gameSystem = campaign?.gameSystem;
  const isDnD = gameSystem?.startsWith('DND') || gameSystem === 'PATHFINDER_2E';
  const isShadowrun = gameSystem === 'SHADOWRUN_6E';
  const isCoC = gameSystem === 'CALL_OF_CTHULHU_7E';

  // Load characters and their currency
  const loadCharacters = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    try {
      const { roster } = await api.getCampaignCharacters(campaignId);
      // Filter to current user's characters (or all if DM)
      const userChars = roster.flatMap(member =>
        member.characters
          .filter(c => c.userId === user?.id)
          .map(c => ({ id: c.id, name: c.name, userId: member.userId }))
      );
      
      // Fetch currency for each character
      const charsWithCurrency = await Promise.all(
        userChars.map(async char => {
          try {
            const { total } = await api.getTotalCurrency(campaignId, char.id);
            const formatted = formatPoolCurrency(total, gameSystem || 'DND_5E');
            return { ...char, currency: total, formatted };
          } catch {
            return { ...char, currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 }, formatted: formatPoolCurrency({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 }, gameSystem || 'DND_5E') };
          }
        })
      );
      setCharacters(charsWithCurrency);
      if (charsWithCurrency.length > 0 && !selectedCharacterId) {
        setSelectedCharacterId(charsWithCurrency[0].id);
      }
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Failed to load characters');
    } finally {
      setLoading(false);
    }
  }, [campaignId, gameSystem, user?.id, selectedCharacterId]);

  useEffect(() => {
    if (isOpen) {
      loadCharacters();
      // Reset form
      setAmounts({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 });
      setDescription('');
      setError(null);
    }
  }, [isOpen, loadCharacters]);

  const selectedCharacter = characters.find(c => c.id === selectedCharacterId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCharacterId) {
      setError('Select a character');
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    // Check if any amount > 0
    const hasAmount = Object.values(amounts).some(v => v > 0);
    if (!hasAmount) {
      setError('Enter an amount to contribute');
      return;
    }
    // Check sufficient funds
    const charCurrency = selectedCharacter?.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
    if (amounts.cp > charCurrency.cp || amounts.sp > charCurrency.sp ||
        amounts.ep > charCurrency.ep || amounts.gp > charCurrency.gp ||
        amounts.pp > charCurrency.pp || amounts.nuyen > charCurrency.nuyen ||
        amounts.cash > charCurrency.cash) {
      setError('Insufficient funds in character\'s containers');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.contributeToPool(campaignId!, pool.id, {
        characterId: selectedCharacterId,
        amounts,
        description: description.trim(),
      });
      showToast(`Contributed ${formatPoolCurrency(amounts, gameSystem || 'DND_5E').display} to ${pool.name}`, 'success');
      onSuccess();
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Failed to contribute');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setAmounts({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 });
    setDescription('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const formattedAmounts = formatPoolCurrency(amounts, gameSystem || 'DND_5E');

  return (
    <Modal open={isOpen} onClose={handleClose} title={`Contribute to ${pool.name}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-danger-ink" role="alert">{error}</p>}

        {/* Character Selector */}
        <div>
          <label className="block text-xs font-medium text-brand-ink mb-1">Character</label>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-ink-secondary">
              <div className="w-4 h-4 border-2 border-warm-amber border-t-transparent rounded-full animate-spin" />
              Loading characters…
            </div>
          ) : characters.length === 0 ? (
            <p className="text-xs text-warm-gray">No characters in this campaign</p>
          ) : (
            <select
              value={selectedCharacterId}
              onChange={e => setSelectedCharacterId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber"
            >
              {characters.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.formatted.shortDisplay})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Character Currency Display */}
        {selectedCharacter && (
          <div className="p-3 rounded-cozy bg-parchment/60 border border-warm-amber/20">
            <div className="text-xs font-medium text-stone-gray mb-1">Available Currency</div>
            <div className="font-mono text-sm text-brand-ink">{selectedCharacter.formatted.display}</div>
          </div>
        )}

        {/* Currency Inputs */}
        <fieldset className="space-y-3" disabled={loading}>
          <legend className="text-xs font-medium text-brand-ink mb-2">Amount to Contribute</legend>
          {isDnD && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <CurrencyInput label="CP" value={amounts.cp} onChange={v => setAmounts(prev => ({ ...prev, cp: v }))} max={selectedCharacter?.currency.cp} />
              <CurrencyInput label="SP" value={amounts.sp} onChange={v => setAmounts(prev => ({ ...prev, sp: v }))} max={selectedCharacter?.currency.sp} />
              <CurrencyInput label="EP" value={amounts.ep} onChange={v => setAmounts(prev => ({ ...prev, ep: v }))} max={selectedCharacter?.currency.ep} />
              <CurrencyInput label="GP" value={amounts.gp} onChange={v => setAmounts(prev => ({ ...prev, gp: v }))} max={selectedCharacter?.currency.gp} />
              <CurrencyInput label="PP" value={amounts.pp} onChange={v => setAmounts(prev => ({ ...prev, pp: v }))} max={selectedCharacter?.currency.pp} />
            </div>
          )}
          {isShadowrun && (
            <CurrencyInput label="Nuyen (¥)" value={amounts.nuyen} onChange={v => setAmounts(prev => ({ ...prev, nuyen: v }))} max={selectedCharacter?.currency.nuyen} className="sm:max-w-xs" />
          )}
          {isCoC && (
            <CurrencyInput label="Cash ($)" value={amounts.cash} onChange={v => setAmounts(prev => ({ ...prev, cash: v }))} max={selectedCharacter?.currency.cash} className="sm:max-w-xs" step="0.01" />
          )}
          {!isDnD && !isShadowrun && !isCoC && (
            <p className="text-xs text-warm-gray">Currency fields appear based on campaign game system.</p>
          )}
        </fieldset>

        {/* Total Preview */}
        {Object.values(amounts).some(v => v > 0) && (
          <div className="p-3 rounded-cozy bg-moss-green/10 border border-moss-green/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-brand-ink">Total Contributing</span>
              <span className="font-mono text-sm text-moss-green">{formattedAmounts.display}</span>
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-brand-ink mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g., Share of goblin loot, Party fund contribution"
            className="w-full px-3 py-2 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber"
            maxLength={500}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={handleClose} variant="secondary" disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || loading || !selectedCharacterId}>
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Contributing…</> : 'Contribute'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CurrencyInput({ label, value, onChange, max, className = '', step = '1' }: { label: string; value: number; onChange: (v: number) => void; max?: number; className?: string; step?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[11px] font-medium text-stone-gray">{label}</label>
      <input
        type="number"
        min="0"
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-2 py-1.5 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber"
      />
      {max !== undefined && max > 0 && (
        <span className="text-[10px] text-warm-gray">Max: {max}</span>
      )}
    </div>
  );
}