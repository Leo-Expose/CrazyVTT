/* eslint-disable @typescript-eslint/no-explicit-any -- legacy character hook compatibility surface. */
// ============================================
// Character Hook (Phase 5/7)
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import { errorSummary } from '@/utils/errors';
import type { Currency } from '../types/shop';

interface UseCharacterReturn {
  character: any;
  currency: Currency | null;
  containers: any[];
  loading: boolean;
  error: string | null;
  fetchCharacter: (characterId: string) => Promise<void>;
  refetch: () => Promise<void>;
  getCurrencySummary: (characterId: string) => Promise<Currency>;
  addCurrency: (characterId: string, amount: Currency, description: string) => Promise<void>;
  spendCurrency: (characterId: string, amount: Currency, description: string) => Promise<void>;
  transferCurrency: (characterId: string, fromContainerId: string, toContainerId: string, amount: Currency) => Promise<void>;
}

export const useCharacter = (characterId?: string): UseCharacterReturn => {
  const [character, setCharacter] = useState<any>(null);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [containers, setContainers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCharacter = useCallback(async (cid: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ data?: { currency?: Currency }; currencyContainers?: any[] }>(`/characters/${cid}`);
      setCharacter(response.data);
      // Extract currency from character data
      if (response.data.data?.currency) {
        setCurrency(response.data.data.currency);
      }
      if (response.data.currencyContainers) {
        setContainers(response.data.currencyContainers);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch character');
    } finally {
      setLoading(false);
    }
  }, []);

  const getCurrencySummary = useCallback(async (cid: string): Promise<Currency> => {
    try {
      const response = await api.get<{ currency: Currency }>(`/characters/${cid}/currency/summary`);
      setCurrency(response.data.currency);
      return response.data.currency;
    } catch (err) {
      console.error('Failed to fetch currency summary:', errorSummary(err));
      return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
    }
  }, []);

  const addCurrency = useCallback(async (cid: string, amount: Currency, description: string) => {
    await api.post(`/characters/${cid}/currency/add`, { amount, description });
    // Refresh currency
    await getCurrencySummary(cid);
  }, [getCurrencySummary]);

  const spendCurrency = useCallback(async (cid: string, amount: Currency, description: string) => {
    await api.post(`/characters/${cid}/currency/spend`, { amount, description });
    await getCurrencySummary(cid);
  }, [getCurrencySummary]);

  const transferCurrency = useCallback(async (cid: string, fromContainerId: string, toContainerId: string, amount: Currency) => {
    await api.post(`/characters/${cid}/currency/transfer`, { fromContainerId, toContainerId, amount });
    await getCurrencySummary(cid);
  }, [getCurrencySummary]);

  useEffect(() => {
    if (characterId) {
      fetchCharacter(characterId);
    }
  }, [characterId, fetchCharacter]);

  const refetch = useCallback(async () => {
    if (characterId) {
      await fetchCharacter(characterId);
    }
  }, [characterId, fetchCharacter]);

  return {
    character,
    currency,
    containers,
    loading,
    error,
    fetchCharacter,
    refetch,
    getCurrencySummary,
    addCurrency,
    spendCurrency,
    transferCurrency,
  };
};
