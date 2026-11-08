/* eslint-disable @typescript-eslint/no-explicit-any -- legacy context compatibility surface. */
// ============================================
// Campaign Hook (Phase 1/7)
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';

interface UseCampaignReturn {
  rulebookItems: any[];
  customItems: any[];
  characterTemplates: any[];
  tokenTemplates: any[];
  lootTables: any[];
  maps: any[];
  loading: boolean;
  error: string | null;
  fetchCampaignData: (campaignId: string) => Promise<void>;
}

export const useCampaign = (campaignId?: string): UseCampaignReturn => {
  const [rulebookItems, setRulebookItems] = useState<any[]>([]);
  const [customItems, setCustomItems] = useState<any[]>([]);
  const [characterTemplates, setCharacterTemplates] = useState<any[]>([]);
  const [tokenTemplates, setTokenTemplates] = useState<any[]>([]);
  const [lootTables, setLootTables] = useState<any[]>([]);
  const [maps, setMaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaignData = useCallback(async (cid: string) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all data needed for shop builder
      const [
        rulebooksRes,
        customItemsRes,
        templatesRes,
        tokensRes,
        lootRes,
        mapsRes,
      ] = await Promise.all([
        api.get<{ items?: any[] }>(`/campaigns/${cid}/rulebooks/items`),
        api.get<{ items?: any[] }>(`/campaigns/${cid}/custom-items`),
        api.get<{ templates?: any[] }>(`/character-templates`),
        api.get<{ templates?: any[] }>(`/campaigns/${cid}/token-templates`),
        api.get<{ tables?: any[] }>(`/campaigns/${cid}/loot/tables`),
        api.get<{ maps?: any[] }>(`/campaigns/${cid}/maps`),
      ]);

      setRulebookItems(rulebooksRes.data.items || []);
      setCustomItems(customItemsRes.data.items || []);
      setCharacterTemplates(templatesRes.data.templates || []);
      setTokenTemplates(tokensRes.data.templates || []);
      setLootTables(lootRes.data.tables || []);
      setMaps(mapsRes.data.maps || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch campaign data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (campaignId) {
      fetchCampaignData(campaignId);
    }
  }, [campaignId, fetchCampaignData]);

  return {
    rulebookItems,
    customItems,
    characterTemplates,
    tokenTemplates,
    lootTables,
    maps,
    loading,
    error,
    fetchCampaignData,
  };
};
