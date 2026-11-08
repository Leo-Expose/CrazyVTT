/**
 * LootDistributor Component
 * DM opens loot table → items listed with value, weight, attunement
 * Distribute to Party button → auto-suggest by value/weight/need
 * Manual override: drag items to character portraits
 * Confirm → updates all sheets, logs transaction
 * Currency split: even division with remainder to DM
 */

import React, { useState, useEffect } from 'react';
import { useCampaign } from '../../contexts/CampaignContext';
import { api } from '../../services/api';
import { Button, Modal, Select, Input, Checkbox, Tabs, TabList, Tab, TabPanel } from '../ui';
import {
  Package,
  Coins,
  Sparkles,
  AlertTriangle,
  Users,
  Check,
  X,
  Plus,
  Edit2,
  Trash2,
  GripVertical,
  Calculator,
  Target,
  Scale,
  Zap,
  EyeOff,
} from 'lucide-react';

interface LootItem {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  value: number;
  valueCurrency: 'CP' | 'SP' | 'EP' | 'GP' | 'PP';
  requiresAttunement: boolean;
  attuned: boolean;
  magical: boolean;
  charges?: { max: number; current: number; recharge?: string };
  description?: string;
  assignedTo?: string;
  assignedQuantity?: number;
}

interface LootCurrency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  nuyen: number;
  cash: number;
}

interface CharacterSummary {
  id: string;
  name: string;
  gameSystem: string;
  currentWeight: number;
  maxWeight: number;
  attunementUsed: number;
  attunementMax: number;
}
type LootCharacter = CharacterSummary;

interface LootDistribution {
  id: string;
  name: string;
  sourceType: string;
  sourceId?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  items: LootItem[];
  currency: LootCurrency;
  campaignId: string;
  createdById: string;
  createdAt: string;
  assignments: LootAssignment[];
}

interface LootAssignment {
  id: string;
  characterId: string;
  character: { id: string; name: string };
  assignedItems: LootItem[];
  assignedCurrency: LootCurrency;
  confirmedAt?: string;
  confirmedById?: string;
  assignedById: string;
}

interface SuggestionMethod {
  id: 'even' | 'value' | 'weight' | 'need';
  label: string;
  icon: React.ReactNode;
  description: string;
}

const SUGGESTION_METHODS: SuggestionMethod[] = [
  { id: 'even', label: 'Even Split', icon: <Scale className="w-4 h-4" />, description: 'Distribute items and currency evenly among party members' },
  { id: 'value', label: 'By Value', icon: <Coins className="w-4 h-4" />, description: 'Give high-value items to characters with lowest total value' },
  { id: 'weight', label: 'By Weight', icon: <Package className="w-4 h-4" />, description: 'Assign heavy items to characters with most carrying capacity' },
  { id: 'need', label: 'By Need', icon: <Target className="w-4 h-4" />, description: 'Prioritize attunement items for characters with open slots' },
];

export function LootDistributor({ distributionId, onClose }: { distributionId: string; onClose?: () => void }) {
  const { currentCampaign } = useCampaign();
  const [distribution, setDistribution] = useState<LootDistribution | null>(null);
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, { items: LootItem[]; currency: LootCurrency }>>({});
  const [selectedMethod, setSelectedMethod] = useState<'even' | 'value' | 'weight' | 'need'>('even');
  const [dragState, setDragState] = useState<{ itemId: string; source: 'pool' | 'character'; characterId?: string } | null>(null);
  const [editingItem, setEditingItem] = useState<LootItem | null>(null);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'currency' | 'assignments' | 'summary'>('items');

  // Load distribution and characters
  useEffect(() => {
    if (!distributionId || !currentCampaign) return;

    const loadData = async () => {
      try {
        const [distRes, charRes] = await Promise.all([
          api.get<LootDistribution>(`/api/campaigns/${currentCampaign.id}/loot/${distributionId}`),
          api.get<CharacterSummary[]>(`/api/campaigns/${currentCampaign.id}/characters/summary`),
        ]);
        setDistribution(distRes.data);
        setCharacters(charRes.data);
      } catch {
        console.error('Failed to load loot distribution');
      }
    };

    loadData();
  }, [distributionId, currentCampaign]);

  // Generate suggestions when method changes
  useEffect(() => {
    if (!distributionId || !currentCampaign) return;

    const generateSuggestions = async () => {
      try {
        const res = await api.post<Record<string, { items: LootItem[]; currency: LootCurrency }>>(`/api/campaigns/${currentCampaign.id}/loot/${distributionId}/suggest`, {
          method: selectedMethod,
        });
        setSuggestions(res.data);
      } catch {
        console.error('Failed to generate suggestions');
      }
    };

    generateSuggestions();
  }, [selectedMethod, distributionId, currentCampaign]);

  const formatCurrency = (currency: LootCurrency): string => {
    const parts: string[] = [];
    if (currency.pp > 0) parts.push(`${currency.pp.toLocaleString()} pp`);
    if (currency.gp > 0) parts.push(`${currency.gp.toLocaleString()} gp`);
    if (currency.ep > 0) parts.push(`${currency.ep.toLocaleString()} ep`);
    if (currency.sp > 0) parts.push(`${currency.sp.toLocaleString()} sp`);
    if (currency.cp > 0) parts.push(`${currency.cp.toLocaleString()} cp`);
    if (currency.nuyen > 0) parts.push(`¥${currency.nuyen.toLocaleString()}`);
    if (currency.cash > 0) parts.push(`$${currency.cash.toLocaleString()}`);
    return parts.length > 0 ? parts.join(', ') : '—';
  };

  const formatWeight = (weight: number): string => `${weight.toFixed(1)} lbs`;

  const handleDragStart = (item: LootItem, source: 'pool' | 'character', characterId?: string) => {
    setDragState({ itemId: item.id, source, characterId });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (targetCharacterId: string) => {
    if (!dragState || !distribution || !currentCampaign) return;

    const item = distribution.items.find(i => i.id === dragState.itemId);
    if (!item) return;

    // This would call the API to assign the item
    // For now, we'll update local state optimistically
    setDistribution(prev => {
      if (!prev) return prev;
      const newAssignments = [...prev.assignments];
      const assignIndex = newAssignments.findIndex(a => a.characterId === targetCharacterId);
      
      const assignedItem: LootItem = {
        ...item,
        assignedTo: targetCharacterId,
        assignedQuantity: 1,
      };

      if (assignIndex >= 0) {
        newAssignments[assignIndex] = {
          ...newAssignments[assignIndex],
          assignedItems: [...newAssignments[assignIndex].assignedItems, assignedItem],
        };
      } else {
        newAssignments.push({
          id: `temp-${Date.now()}`,
          characterId: targetCharacterId,
          character: characters.find(c => c.id === targetCharacterId) || { id: targetCharacterId, name: 'Unknown' },
          assignedItems: [assignedItem],
          assignedCurrency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 },
          assignedById: 'current-user',
        });
      }

      return { ...prev, assignments: newAssignments };
    });

    setDragState(null);
  };

  const handleDropOnPool = () => {
    if (!dragState || !distribution) return;

    // Remove from character assignment
    setDistribution(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map(a => ({
          ...a,
          assignedItems: a.assignedItems.filter(i => i.id !== dragState.itemId),
        })),
      };
    });

    setDragState(null);
  };

  const assignItemToCharacter = async (itemId: string, characterId: string, quantity: number = 1) => {
    if (!currentCampaign) return;
    try {
      await api.post(`/api/campaigns/${currentCampaign.id}/loot/${distributionId}/assign`, {
        characterId,
        assignedItems: [{ itemId, quantity }],
      });
      // Refresh
      const res = await api.get<LootDistribution>(`/api/campaigns/${currentCampaign.id}/loot/${distributionId}`);
      setDistribution(res.data);
    } catch {
      console.error('Failed to assign item');
    }
  };

  const unassignItem = async (assignmentId: string, itemId: string) => {
    if (!currentCampaign) return;
    try {
      // This would call an unassign API
      // For now, update locally
      setDistribution(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          assignments: prev.assignments.map(a => 
            a.id === assignmentId 
              ? { ...a, assignedItems: a.assignedItems.filter(i => i.id !== itemId) }
              : a
          ),
        };
      });
    } catch {
      console.error('Failed to unassign item');
    }
  };

  const confirmAssignment = async (assignmentId: string) => {
    if (!currentCampaign) return;
    try {
      await api.post(`/api/campaigns/${currentCampaign.id}/loot/assignments/${assignmentId}/confirm`);
      const res = await api.get<LootDistribution>(`/api/campaigns/${currentCampaign.id}/loot/${distributionId}`);
      setDistribution(res.data);
    } catch {
      console.error('Failed to confirm assignment');
    }
  };

  const completeDistribution = async () => {
    if (!currentCampaign || !window.confirm('Complete this distribution and apply to character sheets?')) return;
    try {
      await api.post(`/api/campaigns/${currentCampaign.id}/loot/${distributionId}/complete`);
      if (onClose) onClose();
    } catch {
      console.error('Failed to complete distribution');
    }
  };

  const cancelDistribution = async () => {
    if (!currentCampaign || !window.confirm('Cancel this distribution? All assignments will be lost.')) return;
    try {
      await api.post(`/api/campaigns/${currentCampaign.id}/loot/${distributionId}/cancel`);
      if (onClose) onClose();
    } catch {
      console.error('Failed to cancel distribution');
    }
  };

  const openAddItemModal = (item?: LootItem) => {
    if (item) {
      setEditingItem({ ...item });
    } else {
      setEditingItem({
        id: `temp-${Date.now()}`,
        name: '',
        quantity: 1,
        weight: 0,
        value: 0,
        valueCurrency: 'GP',
        requiresAttunement: false,
        attuned: false,
        magical: false,
        description: '',
      });
    }
    setShowAddItemModal(true);
  };

  const saveItem = () => {
    if (!editingItem || !distribution || !currentCampaign) return;

    // In a real implementation, this would call the API
    // For now, update local state
    if (editingItem.id.startsWith('temp-')) {
      // New item
      setDistribution(prev => prev ? {
        ...prev,
        items: [...prev.items, editingItem!],
      } : null);
    } else {
      // Update existing
      setDistribution(prev => prev ? {
        ...prev,
        items: prev.items.map(i => i.id === editingItem!.id ? editingItem! : i),
      } : null);
    }
    setShowAddItemModal(false);
    setEditingItem(null);
  };

  const deleteItem = async (itemId: string) => {
    if (!currentCampaign || !window.confirm('Delete this item from the loot pool?')) return;
    // Would call delete API
    setDistribution(prev => prev ? {
      ...prev,
      items: prev.items.filter(i => i.id !== itemId),
    } : null);
  };

  const addCurrencyToAssignment = async (_characterId: string, _currency: LootCurrency) => {
    if (!currentCampaign) return;
    // Would call API to add currency to assignment
  };
  void assignItemToCharacter;
  void addCurrencyToAssignment;

  const getUnassignedItems = (): LootItem[] => {
    if (!distribution) return [];
    const assignedQuantities: Record<string, number> = {};
    
    for (const assignment of distribution.assignments) {
      for (const item of assignment.assignedItems) {
        assignedQuantities[item.id] = (assignedQuantities[item.id] || 0) + (item.assignedQuantity || item.quantity);
      }
    }

    return distribution.items
      .map(item => ({
        ...item,
        quantity: item.quantity - (assignedQuantities[item.id] || 0),
      }))
      .filter(item => item.quantity > 0);
  };

  const getUnassignedCurrency = (): LootCurrency => {
    if (!distribution) return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
    const currency = distribution.currency as LootCurrency;
    const assigned: LootCurrency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };

    for (const assignment of distribution.assignments) {
      const c = assignment.assignedCurrency as LootCurrency;
      assigned.cp += c.cp || 0;
      assigned.sp += c.sp || 0;
      assigned.ep += c.ep || 0;
      assigned.gp += c.gp || 0;
      assigned.pp += c.pp || 0;
      assigned.nuyen += c.nuyen || 0;
      assigned.cash += c.cash || 0;
    }

    return {
      cp: Math.max(0, (currency.cp || 0) - assigned.cp),
      sp: Math.max(0, (currency.sp || 0) - assigned.sp),
      ep: Math.max(0, (currency.ep || 0) - assigned.ep),
      gp: Math.max(0, (currency.gp || 0) - assigned.gp),
      pp: Math.max(0, (currency.pp || 0) - assigned.pp),
      nuyen: Math.max(0, (currency.nuyen || 0) - assigned.nuyen),
      cash: Math.max(0, (currency.cash || 0) - assigned.cash),
    };
  };

  if (!distribution) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    );
  }

  const unassignedItems = getUnassignedItems();
  const unassignedCurrency = getUnassignedCurrency();

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b bg-surface-light flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{distribution.name}</h2>
          <div className="flex items-center gap-4 text-sm text-ink-muted mt-1">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              distribution.status === 'PENDING' ? 'bg-surface-light text-ink-muted' :
              distribution.status === 'IN_PROGRESS' ? 'bg-brand/15 text-brand-ink' :
              distribution.status === 'COMPLETED' ? 'bg-success/15 text-success-ink' :
              'bg-danger/15 text-danger-ink'
            }`}>
              {distribution.status}
            </span>
            <span>Source: {distribution.sourceType}</span>
            <span>{unassignedItems.length} unassigned items</span>
            <span>Unassigned: {formatCurrency(unassignedCurrency)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={cancelDistribution} disabled={distribution.status === 'COMPLETED'}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button onClick={completeDistribution} disabled={distribution.status === 'COMPLETED' || unassignedItems.length > 0}>
            <Check className="w-4 h-4 mr-1" /> Complete
          </Button>
          {onClose && <Button variant="ghost" onClick={onClose}><EyeOff className="w-4 h-4" /></Button>}
        </div>
      </div>

      {/* Tab Bar */}
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value as typeof activeTab)} className="border-b">
        <TabList>
          <Tab value="items">
            <Package className="w-4 h-4 mr-1" /> Items ({distribution.items.length})
          </Tab>
          <Tab value="currency">
            <Coins className="w-4 h-4 mr-1" /> Currency
          </Tab>
          <Tab value="assignments">
            <Users className="w-4 h-4 mr-1" /> Assignments ({distribution.assignments.length})
          </Tab>
          <Tab value="summary">
            <Calculator className="w-4 h-4 mr-1" /> Summary
          </Tab>
        </TabList>
      </Tabs>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Items Tab */}
        <TabPanel value="items">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium">Loot Pool</h3>
            <Button onClick={() => openAddItemModal()} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          </div>

          {unassignedItems.length === 0 ? (
            <div className="text-center py-8 text-ink-muted">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>All items have been assigned.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {unassignedItems.map(item => (
                <LootItemCard
                  key={item.id}
                  item={item}
                  characters={characters}
                  onDragStart={handleDragStart}
                  onEdit={() => openAddItemModal(item)}
                  onDelete={() => deleteItem(item.id)}
                  formatWeight={formatWeight}
                  suggestions={suggestions}
                  isAssigned={false}
                />
              ))}
            </div>
          )}
        </TabPanel>

        {/* Currency Tab */}
        <TabPanel value="currency">
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-r from-warning/10 to-warning/10 rounded-lg border border-warning/30">
              <div className="font-medium text-ink-secondary">Total Currency in Pool</div>
              <div className="text-lg font-mono font-semibold text-warning-ink mt-1">
                {formatCurrency(distribution.currency as LootCurrency)}
              </div>
            </div>

            <div className="p-4 bg-surface-light rounded-lg border">
              <div className="font-medium mb-3">Unassigned Currency</div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <CurrencyInput label="CP" value={unassignedCurrency.cp} disabled />
                <CurrencyInput label="SP" value={unassignedCurrency.sp} disabled />
                <CurrencyInput label="EP" value={unassignedCurrency.ep} disabled />
                <CurrencyInput label="GP" value={unassignedCurrency.gp} disabled />
                <CurrencyInput label="PP" value={unassignedCurrency.pp} disabled />
                <CurrencyInput label="Nuyen" value={unassignedCurrency.nuyen} disabled />
              </div>
              <Button onClick={() => distributeCurrencyEvenly()} size="sm">
                <Calculator className="w-4 h-4 mr-1" /> Split Evenly Among Party
              </Button>
            </div>

            <h4 className="font-medium mt-4">Assign Currency to Characters</h4>
            <div className="space-y-2">
              {characters.map(char => {
                const assignment = distribution.assignments.find(a => a.characterId === char.id);
                const assignedCurrency = assignment?.assignedCurrency as LootCurrency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
                return (
                  <div key={char.id} className="p-3 bg-white border rounded flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand/15 flex items-center justify-center text-brand-ink font-medium">
                        {char.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium">{char.name}</div>
                        <div className="text-sm text-ink-muted">
                          Assigned: {formatCurrency(assignedCurrency)}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openCurrencyAssignment(char.id)}>
                      Edit
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </TabPanel>

        {/* Assignments Tab */}
        <TabPanel value="assignments">
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium">Party Members</h3>
              <Select
                value={selectedMethod}
                onChange={setSelectedMethod}
                options={SUGGESTION_METHODS.map(m => ({ value: m.id, label: m.label }))}
                className="w-48"
              />
            </div>

            <div className="p-3 bg-brand/10 rounded border border-brand/30 text-sm">
              <div className="font-medium text-brand-ink mb-1">Auto-Suggest: {SUGGESTION_METHODS.find(m => m.id === selectedMethod)?.label}</div>
              <div className="text-brand-ink">
                {SUGGESTION_METHODS.find(m => m.id === selectedMethod)?.description}
              </div>
            </div>

            {characters.length === 0 ? (
              <div className="text-center py-8 text-ink-muted">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No characters in this campaign.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {characters.map(char => {
                  const assignment = distribution.assignments.find(a => a.characterId === char.id);
                  const suggestedItems = suggestions[char.id]?.items || [];
                  const suggestedCurrency = suggestions[char.id]?.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
                  const assignedItems = assignment?.assignedItems || [];
                  const assignedCurrency = assignment?.assignedCurrency as LootCurrency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
                  const isConfirmed = !!assignment?.confirmedAt;

                  return (
                    <CharacterLootCard
                      key={char.id}
                      character={char}
                      assignedItems={assignedItems}
                      assignedCurrency={assignedCurrency}
                      suggestedItems={suggestedItems}
                      suggestedCurrency={suggestedCurrency}
                      isConfirmed={isConfirmed}
                      onDrop={() => handleDrop(char.id)}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onUnassign={unassignItem}
                      onConfirm={() => assignment?.id && confirmAssignment(assignment.id)}
                      formatWeight={formatWeight}
                      formatCurrency={formatCurrency}
                      dragState={dragState}
                      selectedMethod={selectedMethod}
                    />
                  );
                })}
              </div>
            )}

            {/* Drop zone for returning items to pool */}
            {dragState && dragState.source === 'character' && (
              <div
                className="mt-4 p-4 border-2 border-dashed border-danger rounded-lg bg-danger/10 text-center"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDropOnPool}
              >
                <X className="w-8 h-8 mx-auto text-danger-ink mb-2" />
                <p className="font-medium text-danger-ink">Drop here to return to pool</p>
              </div>
            )}
          </div>
        </TabPanel>

        {/* Summary Tab */}
        <TabPanel value="summary">
          <div className="space-y-4">
            <div className="p-4 bg-surface-light rounded-lg border">
              <h3 className="font-medium mb-3">Distribution Summary</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard label="Total Items" value={distribution.items.reduce((sum, i) => sum + i.quantity, 0)} icon={Package} />
                <StatCard label="Total Weight" value={formatWeight(distribution.items.reduce((sum, i) => sum + i.weight * i.quantity, 0))} icon={Package} />
                <StatCard label="Total Value" value={formatCurrency(distribution.currency as LootCurrency)} icon={Coins} />
              </div>
            </div>

            <div className="p-4 bg-surface-light rounded-lg border">
              <h3 className="font-medium mb-3">Per Character</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-ink-muted border-b">
                      <th className="pb-2">Character</th>
                      <th className="pb-2">Items</th>
                      <th className="pb-2">Weight</th>
                      <th className="pb-2">Currency</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {characters.map(char => {
                      const assignment = distribution.assignments.find(a => a.characterId === char.id);
                      const items = assignment?.assignedItems || [];
                      const currency = assignment?.assignedCurrency as LootCurrency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
                      const totalWeight = items.reduce((sum, i) => sum + i.weight * (i.assignedQuantity || i.quantity), 0);
                      return (
                        <tr key={char.id} className="border-b">
                          <td className="py-2 font-medium">{char.name}</td>
                          <td className="py-2">{items.length} ({items.reduce((sum, i) => sum + (i.assignedQuantity || i.quantity), 0)})</td>
                          <td className="py-2">{formatWeight(totalWeight)}</td>
                          <td className="py-2 font-mono">{formatCurrency(currency)}</td>
                          <td className="py-2">
                            {assignment?.confirmedAt ? (
                              <span className="text-success-ink flex items-center gap-1"><Check className="w-4 h-4" /> Confirmed</span>
                            ) : (
                              <span className="text-warning-ink">Pending</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-surface-light rounded-lg border">
              <h3 className="font-medium mb-3">Unassigned</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard label="Items" value={unassignedItems.length} icon={Package} />
                <StatCard label="Weight" value={formatWeight(unassignedItems.reduce((sum, i) => sum + i.weight * i.quantity, 0))} icon={Package} />
                <StatCard label="Currency" value={formatCurrency(unassignedCurrency)} icon={Coins} />
              </div>
            </div>
          </div>
        </TabPanel>
      </div>

      {/* Add/Edit Item Modal */}
      <Modal isOpen={showAddItemModal} onClose={() => { setShowAddItemModal(false); setEditingItem(null); }} title={editingItem?.id?.startsWith('temp-') ? 'Add Loot Item' : 'Edit Loot Item'}>
        <div className="space-y-4">
          <Input label="Name" value={editingItem?.name || ''} onChange={v => setEditingItem(prev => prev ? {...prev, name: v} : null)} required />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Quantity" type="number" value={editingItem?.quantity || 1} onChange={v => setEditingItem(prev => prev ? {...prev, quantity: parseInt(v)} : null)} />
            <Input label="Weight" type="number" step="0.1" value={editingItem?.weight || 0} onChange={v => setEditingItem(prev => prev ? {...prev, weight: parseFloat(v)} : null)} />
            <Select label="Value Currency" value={editingItem?.valueCurrency || 'GP'} onChange={v => setEditingItem(prev => prev ? {...prev, valueCurrency: v as LootItem['valueCurrency']} : null)} options={[
              { value: 'CP', label: 'CP' }, { value: 'SP', label: 'SP' }, { value: 'EP', label: 'EP' }, { value: 'GP', label: 'GP' }, { value: 'PP', label: 'PP' },
            ]} />
          </div>
          <Input label="Value" type="number" value={editingItem?.value || 0} onChange={v => setEditingItem(prev => prev ? {...prev, value: parseFloat(v)} : null)} />
          <Input label="Description" value={editingItem?.description || ''} onChange={v => setEditingItem(prev => prev ? {...prev, description: v} : null)} multiline rows={2} />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <Checkbox checked={editingItem?.requiresAttunement} onChange={v => setEditingItem(prev => prev ? {...prev, requiresAttunement: v} : null)} />
              Requires Attunement
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={editingItem?.magical} onChange={v => setEditingItem(prev => prev ? {...prev, magical: v} : null)} />
              Magical
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={editingItem?.attuned} onChange={v => setEditingItem(prev => prev ? {...prev, attuned: v} : null)} />
              Pre-attuned
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowAddItemModal(false); setEditingItem(null); }}>Cancel</Button>
            <Button onClick={saveItem}>{editingItem?.id?.startsWith('temp-') ? 'Add' : 'Save'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Components
interface LootItemCardProps {
  item: LootItem;
  characters: LootCharacter[];
  onDragStart: (item: LootItem, source: 'pool' | 'character', characterId?: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  formatWeight: (w: number) => string;
  suggestions: Record<string, { items: LootItem[]; currency: LootCurrency }>;
  isAssigned: boolean;
}
function LootItemCard({ item, characters: _characters, onDragStart, onEdit, onDelete, formatWeight, suggestions: _suggestions, isAssigned: _isAssigned }: LootItemCardProps) {
  return (
    <div
      className="flex items-center gap-3 p-3 bg-white rounded border transition-all hover:shadow-sm"
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(item, 'pool'); }}
    >
      <GripVertical className="w-5 h-5 text-ink-muted cursor-grab" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{item.name}</span>
          {item.magical && <Sparkles className="w-4 h-4 text-spirit-ink" aria-label="Magical" />}
          {item.requiresAttunement && <AlertTriangle className="w-4 h-4 text-warning-ink" aria-label="Requires Attunement" />}
        </div>
        <div className="flex items-center gap-4 text-sm text-ink-muted">
          <span>Qty: {item.quantity}</span>
          <span>Weight: {formatWeight(item.weight * item.quantity)}</span>
          <span className="text-warning-ink">Value: {item.value} {item.valueCurrency}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit}><Edit2 className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger-ink"><Trash2 className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

interface CharacterLootCardProps {
  character: LootCharacter;
  assignedItems: LootItem[];
  assignedCurrency: LootCurrency;
  suggestedItems: LootItem[];
  suggestedCurrency: LootCurrency;
  isConfirmed: boolean;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onUnassign: (assignmentId: string, itemId: string) => void;
  onConfirm: () => void;
  formatWeight: (w: number) => string;
  formatCurrency: (c: LootCurrency) => string;
  dragState: { source: string; itemId: string; characterId?: string } | null;
  selectedMethod: string;
}
function CharacterLootCard({ character, assignedItems, assignedCurrency, suggestedItems, suggestedCurrency: _suggestedCurrency, isConfirmed, onDrop, onDragOver, onDragLeave, onUnassign, onConfirm, formatWeight: _formatWeight, formatCurrency, dragState, selectedMethod }: CharacterLootCardProps) {
  const isDragTarget = dragState?.source === 'pool' && dragState?.characterId !== character.id;

  return (
    <div
      className={`p-4 bg-white rounded-lg border transition-all ${
        isConfirmed ? 'border-success/30 bg-success/10' : 'border-edge'
      } ${isDragTarget ? 'ring-2 ring-brand bg-brand/10' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand/15 flex items-center justify-center text-brand-ink font-medium text-lg">
            {character.name.charAt(0)}
          </div>
          <div>
            <div className="font-medium">{character.name}</div>
            <div className="text-xs text-ink-muted">
              {character.currentWeight}/{character.maxWeight} lbs • {character.attunementUsed}/{character.attunementMax} attuned
            </div>
          </div>
        </div>
        {isConfirmed && <Check className="w-5 h-5 text-success-ink" />}
      </div>

      {/* Assigned Items */}
      <div className="space-y-2 mb-3">
        {assignedItems.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-2">No items assigned</p>
        ) : (
          assignedItems.map((item: LootItem) => (
            <div key={item.id} className="flex items-center justify-between p-2 bg-surface-light rounded text-sm">
              <div className="flex items-center gap-2">
                {item.magical && <Sparkles className="w-3 h-3 text-spirit-ink" />}
                {item.requiresAttunement && <AlertTriangle className="w-3 h-3 text-warning-ink" />}
                <span>{item.name} x{item.assignedQuantity || item.quantity}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onUnassign(item.id, item.id)} className="text-danger-ink">
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Assigned Currency */}
      <div className="p-2 bg-surface-light rounded text-sm mb-3">
        <span className="text-ink-muted">Currency: </span>
        <span className="font-mono">{formatCurrency(assignedCurrency)}</span>
      </div>

      {/* Suggested Items */}
      {suggestedItems.length > 0 && !isConfirmed && (
        <div className="border-t pt-3">
          <div className="text-xs text-brand-ink font-medium mb-2 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Suggested ({selectedMethod})
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {suggestedItems.map((item: LootItem) => (
              <div key={item.id} className="text-xs text-ink-muted flex justify-between">
                <span>{item.name} x{item.quantity}</span>
                <Button variant="ghost" size="sm" className="px-1 py-0" onClick={() => { /* assign suggested */ }}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {!isConfirmed && (
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <Button size="sm" variant="secondary" className="flex-1" onClick={onConfirm}>
            <Check className="w-4 h-4 mr-1" /> Confirm
          </Button>
        </div>
      )}
    </div>
  );
}

function CurrencyInput({ label, value, disabled: _disabled }: { label: string; value: number; disabled: boolean }) {
  return (
    <div>
      <label className="text-xs text-ink-muted">{label}</label>
      <input
        type="number"
        value={value}
        disabled
        className="w-full px-2 py-1 border rounded bg-white text-right font-mono text-sm"
      />
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="p-3 bg-white rounded border text-center">
      <Icon className="w-6 h-6 mx-auto text-ink-muted mb-1" />
      <div className="text-sm text-ink-muted">{label}</div>
      <div className="font-mono font-semibold">{value}</div>
    </div>
  );
}

const distributeCurrencyEvenly = () => {
  // Would call API to split currency evenly
};

const openCurrencyAssignment = (_characterId: string) => {
  // Would open modal to edit currency assignment
};

export default LootDistributor;
