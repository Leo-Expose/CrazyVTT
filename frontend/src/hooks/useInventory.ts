/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads vary by game system. */
// ============================================
// Inventory Hook (Phase 5/7)
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import { errorSummary } from '@/utils/errors';

interface InventoryItem {
  id: string;
  name: string;
  type: string;
  quantity: number;
  weight: number;
  price?: any;
  value?: any;
  imageUrl?: string;
  [key: string]: any;
}

interface UseInventoryReturn {
  inventory: InventoryItem[];
  containers: any[];
  loading: boolean;
  error: string | null;
  fetchInventory: (characterId: string) => Promise<void>;
  getInventory: (characterId: string) => Promise<InventoryItem[]>;
  addItem: (characterId: string, item: InventoryItem) => Promise<void>;
  removeItem: (characterId: string, itemId: string, quantity: number) => Promise<void>;
  updateItem: (characterId: string, itemId: string, updates: Partial<InventoryItem>) => Promise<void>;
  moveItem: (characterId: string, itemId: string, toContainerId: string) => Promise<void>;
}

export const useInventory = (characterId?: string): UseInventoryReturn => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInventory = useCallback(async (cid: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ inventory: InventoryItem[]; containers: any[] }>(`/campaigns/${cid}/inventory`);
      setInventory(response.data.inventory);
      setContainers(response.data.containers);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  const getInventory = useCallback(async (cid: string): Promise<InventoryItem[]> => {
    try {
      const response = await api.get<{ inventory: InventoryItem[] }>(`/campaigns/${cid}/inventory`);
      setInventory(response.data.inventory);
      return response.data.inventory;
    } catch (err) {
      console.error('Failed to fetch inventory:', errorSummary(err));
      return [];
    }
  }, []);

  const addItem = useCallback(async (cid: string, item: InventoryItem) => {
    await api.post(`/campaigns/${cid}/inventory`, item);
    await fetchInventory(cid);
  }, [fetchInventory]);

  const removeItem = useCallback(async (cid: string, itemId: string, quantity: number) => {
    await api.delete(`/campaigns/${cid}/inventory/${itemId}?quantity=${quantity}`);
    await fetchInventory(cid);
  }, [fetchInventory]);

  const updateItem = useCallback(async (cid: string, itemId: string, updates: Partial<InventoryItem>) => {
    await api.patch(`/campaigns/${cid}/inventory/${itemId}`, updates);
    await fetchInventory(cid);
  }, [fetchInventory]);

  const moveItem = useCallback(async (cid: string, itemId: string, toContainerId: string) => {
    await api.post(`/campaigns/${cid}/inventory/move`, { itemId, toContainerId });
    await fetchInventory(cid);
  }, [fetchInventory]);

  useEffect(() => {
    if (characterId) {
      fetchInventory(characterId);
    }
  }, [characterId, fetchInventory]);

  return {
    inventory,
    containers,
    loading,
    error,
    fetchInventory,
    getInventory,
    addItem,
    removeItem,
    updateItem,
    moveItem,
  };
};
