/* eslint-disable @typescript-eslint/no-explicit-any -- shop payloads preserve game-system-specific item data. */
// ============================================
// Shop Hook (Phase 7)
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import { errorSummary } from '@/utils/errors';
import type { Shop, ShopItem, ShopTransaction, ShopVisit, CreateShopInput, UpdateShopInput, CreateShopItemInput, UpdateShopItemInput, BuyItemsInput, SellItemsInput } from '../types/shop';

interface UseShopReturn {
  shops: Shop[];
  loading: boolean;
  error: string | null;
  fetchShops: (campaignId: string) => Promise<void>;
  getShop: (campaignId: string, shopId: string) => Promise<Shop | null>;
  createShop: (campaignId: string, data: CreateShopInput) => Promise<Shop>;
  updateShop: (shopId: string, data: UpdateShopInput) => Promise<Shop>;
  deleteShop: (campaignId: string, shopId: string) => Promise<void>;
  // Items
  addShopItem: (campaignId: string, shopId: string, data: CreateShopItemInput) => Promise<ShopItem>;
  updateShopItem: (shopId: string, itemId: string, data: UpdateShopItemInput) => Promise<ShopItem>;
  deleteShopItem: (campaignId: string, shopId: string, itemId: string) => Promise<void>;
  reorderItems: (shopId: string, itemOrders: Array<{ id: string; sortOrder: number; category?: string }>) => Promise<void>;
  // Transactions
  buyItems: (shopId: string, characterId: string, data: BuyItemsInput) => Promise<{ success: boolean; transaction?: any; error?: string }>;
  sellItems: (shopId: string, characterId: string, data: SellItemsInput) => Promise<{ success: boolean; transaction?: any; error?: string }>;
  getTransactions: (shopId: string) => Promise<ShopTransaction[]>;
  getVisits: (shopId: string) => Promise<ShopVisit[]>;
  // Restock
  restockShop: (shopId: string, itemIds?: string[]) => Promise<{ success: boolean; results: any[]; error?: string }>;
}

export const useShop = (campaignId?: string): UseShopReturn => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShops = useCallback(async (cid: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ shops: Shop[] }>(`/campaigns/${cid}/shops`);
      setShops(response.data.shops);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch shops');
      setShops([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const getShop = useCallback(async (cid: string, shopId: string): Promise<Shop | null> => {
    try {
      const response = await api.get<{ shop: Shop }>(`/campaigns/${cid}/shops/${shopId}`);
      return response.data.shop;
    } catch (err) {
      console.error('Failed to fetch shop:', errorSummary(err));
      return null;
    }
  }, []);

  const createShop = useCallback(async (cid: string, data: CreateShopInput): Promise<Shop> => {
    const response = await api.post<{ shop: Shop }>(`/campaigns/${cid}/shops`, data);
    setShops(prev => [response.data.shop, ...prev]);
    return response.data.shop;
  }, []);

  const updateShop = useCallback(async (shopId: string, data: UpdateShopInput): Promise<Shop> => {
    const response = await api.put<{ shop: Shop }>(`/campaigns/${campaignId}/shops/${shopId}`, data);
    setShops(prev => prev.map(s => s.id === shopId ? response.data.shop : s));
    return response.data.shop;
  }, [campaignId]);

  const deleteShop = useCallback(async (cid: string, shopId: string) => {
    await api.delete(`/campaigns/${cid}/shops/${shopId}`);
    setShops(prev => prev.filter(s => s.id !== shopId));
  }, []);

  const addShopItem = useCallback(async (cid: string, shopId: string, data: CreateShopItemInput): Promise<ShopItem> => {
    const response = await api.post<{ item: ShopItem }>(`/campaigns/${cid}/shops/${shopId}/items`, data);
    return response.data.item;
  }, []);

  const updateShopItem = useCallback(async (shopId: string, itemId: string, data: UpdateShopItemInput): Promise<ShopItem> => {
    const response = await api.put<{ item: ShopItem }>(`/campaigns/${campaignId}/shops/${shopId}/items/${itemId}`, data);
    return response.data.item;
  }, [campaignId]);

  const deleteShopItem = useCallback(async (cid: string, shopId: string, itemId: string) => {
    await api.delete(`/campaigns/${cid}/shops/${shopId}/items/${itemId}`);
  }, []);

  const reorderItems = useCallback(async (shopId: string, itemOrders: Array<{ id: string; sortOrder: number; category?: string }>) => {
    await api.post(`/campaigns/${campaignId}/shops/${shopId}/items/reorder`, { itemOrders });
  }, [campaignId]);

  const buyItems = useCallback(async (shopId: string, characterId: string, data: BuyItemsInput) => {
    const response = await api.post<{ success: boolean; transaction?: any; error?: string }>(
      `/campaigns/${campaignId}/shops/${shopId}/buy`,
      { ...data, characterId }
    );
    return response.data;
  }, [campaignId]);

  const sellItems = useCallback(async (shopId: string, characterId: string, data: SellItemsInput) => {
    const response = await api.post<{ success: boolean; transaction?: any; error?: string }>(
      `/campaigns/${campaignId}/shops/${shopId}/sell`,
      { ...data, characterId }
    );
    return response.data;
  }, [campaignId]);

  const getTransactions = useCallback(async (shopId: string): Promise<ShopTransaction[]> => {
    const response = await api.get<{ transactions: ShopTransaction[] }>(`/campaigns/${campaignId}/shops/${shopId}/transactions`);
    return response.data.transactions;
  }, [campaignId]);

  const getVisits = useCallback(async (shopId: string): Promise<ShopVisit[]> => {
    const response = await api.get<{ visits: ShopVisit[] }>(`/campaigns/${campaignId}/shops/${shopId}/visits`);
    return response.data.visits;
  }, [campaignId]);

  const restockShop = useCallback(async (shopId: string, itemIds?: string[]) => {
    const response = await api.post<{ success: boolean; results: any[]; error?: string }>(
      `/campaigns/${campaignId}/shops/${shopId}/restock`,
      { itemIds }
    );
    return response.data;
  }, [campaignId]);

  // Auto-fetch when campaignId changes
  useEffect(() => {
    if (campaignId) {
      fetchShops(campaignId);
    }
  }, [campaignId, fetchShops]);

  return {
    shops,
    loading,
    error,
    fetchShops,
    getShop,
    createShop,
    updateShop,
    deleteShop,
    addShopItem,
    updateShopItem,
    deleteShopItem,
    reorderItems,
    buyItems,
    sellItems,
    getTransactions,
    getVisits,
    restockShop,
  };
};
