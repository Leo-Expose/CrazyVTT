/**
 * InventoryManager Component
 * Tabbed view: Equipped | Carried | Stowed | Containers | Currency
 * Drag-drop between locations, weight per location, encumbrance badge
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useCharacter } from '../../hooks/useCharacter';
import { useCampaign } from '../../contexts/CampaignContext';
import { api } from '../../services/api';
import { errorSummary } from '@/utils/errors';
import { Button, Modal, Input, Select, Checkbox, Tooltip } from '../ui';
import {
  Package,
  Box,
  Shield,
  Coins,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GripVertical,
  RotateCcw,
  Trash2,
  Edit2,
  Plus,
  Minus,
} from 'lucide-react';

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  notes: string;
  equippable: boolean;
  equipped: boolean;
  containerId?: string;
  location: 'EQUIPPED' | 'CARRIED' | 'STOWED' | 'CONTAINER';
  capacity?: number;
  capacityUnit?: 'LBS' | 'BULK';
  requiresAttunement: boolean;
  attuned: boolean;
  attunementNotes: string;
  magical: boolean;
  charges?: { max: number; current: number; recharge?: string };
  value?: { amount: number; currency: string } | number;
}

interface CurrencyAmount {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  nuyen: number;
  cash: number;
}

interface CurrencyContainer {
  id: string;
  name: string;
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  nuyen: number;
  cash: number;
  isDefault: boolean;
  containerId?: string;
}

interface ContainerTree {
  id: string;
  name: string;
  type: string;
  capacity: number;
  capacityUnit: string;
  baseWeight: number;
  totalWeight: number;
  totalContentsWeight: number;
  remainingCapacity: number;
  isOverCapacity: boolean;
  isMagical: boolean;
  magicType: string | null;
  children: ContainerTree[];
  items: InventoryItem[];
}

interface EncumbranceStatus {
  currentWeight: number;
  maxWeight: number;
  pushDragLift: number;
  status: 'NORMAL' | 'ENCUMBERED' | 'HEAVILY_ENCUMBERED';
  speedPenalty: number;
  dexCheckDisadvantage: boolean;
  strDexCheckPenalty: number;
  statusLabel: string;
  statusColor: string;
  capacityPercent: number;
  remainingCapacity: number;
}

interface WeightBreakdown {
  equipped: number;
  carried: number;
  stowed: number;
  containers: { [key: string]: number };
  total: number;
}

interface CharacterData {
  inventory: InventoryItem[];
  currency?: CurrencyAmount;
  currencyContainers?: CurrencyContainer[];
  stats?: {
    strength?: { score: number; modifier: number };
  };
  attributes?: {
    strength?: { score: number; modifier: number };
  };
  gameSystem: string;
}

type TabType = 'equipped' | 'carried' | 'stowed' | 'containers' | 'currency';

const TAB_CONFIG: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'equipped', label: 'Equipped', icon: <Shield className="w-4 h-4" /> },
  { id: 'carried', label: 'Carried', icon: <Package className="w-4 h-4" /> },
  { id: 'stowed', label: 'Stowed', icon: <Box className="w-4 h-4" /> },
  { id: 'containers', label: 'Containers', icon: <Package className="w-4 h-4" /> },
  { id: 'currency', label: 'Currency', icon: <Coins className="w-4 h-4" /> },
];

export function InventoryManager({ characterId }: { characterId: string }) {
  const { currentCampaign } = useCampaign();
  const { character, refetch } = useCharacter(characterId);
  const [activeTab, setActiveTab] = useState<TabType>('equipped');
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());
  const [dragState, setDragState] = useState<{
    itemId: string | null;
    sourceLocation: string | null;
    sourceContainerId: string | null;
  }>({ itemId: null, sourceLocation: null, sourceContainerId: null });
  const [encumbrance, setEncumbrance] = useState<EncumbranceStatus | null>(null);
  const [_weightBreakdown, setWeightBreakdown] = useState<WeightBreakdown | null>(null);
  const [containers, setContainers] = useState<ContainerTree[]>([]);
  const [currencyContainers, setCurrencyContainers] = useState<CurrencyContainer[]>([]);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showAddContainerModal, setShowAddContainerModal] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState<{ type: 'add' | 'transfer'; containerId?: string } | null>(null);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: '',
    quantity: 1,
    weight: 0,
    notes: '',
    equippable: false,
    requiresAttunement: false,
    magical: false,
  });
  const [newContainer, setNewContainer] = useState({
    name: '',
    type: 'CUSTOM',
    capacity: 0,
    capacityUnit: 'LBS',
    baseWeight: 0,
    parentId: '',
  });
  const [currencyAmount, setCurrencyAmount] = useState({
    cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0,
  });

  const characterData = character?.data as unknown as CharacterData;
  const gameSystem = character?.gameSystem || 'DND_5E';

  // Fetch encumbrance and container data on mount
  useEffect(() => {
    if (!characterId || !currentCampaign) return;

    const fetchData = async () => {
      try {
        // Fetch encumbrance
        const encRes = await api.get(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/encumbrance`);
        setEncumbrance(encRes.data as EncumbranceStatus);

        // Fetch weight breakdown
        const weightRes = await api.get(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/weight-breakdown`);
        setWeightBreakdown(weightRes.data as WeightBreakdown);

        // Fetch containers
        const contRes = await api.get(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/containers/tree`);
        setContainers(contRes.data as ContainerTree[]);

        // Fetch currency containers
        const currRes = await api.get(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/currency/containers`);
        setCurrencyContainers(currRes.data as CurrencyContainer[]);
      } catch (error) {
        console.error('Failed to fetch inventory data:', errorSummary(error));
      }
    };

    fetchData();
  }, [characterId, currentCampaign]);

  // Get items for current tab
  const getItemsForTab = useCallback((): InventoryItem[] => {
    if (!characterData?.inventory) return [];
    
    switch (activeTab) {
      case 'equipped':
        return characterData.inventory.filter(item => item.location === 'EQUIPPED');
      case 'carried':
        return characterData.inventory.filter(item => item.location === 'CARRIED');
      case 'stowed':
        return characterData.inventory.filter(item => item.location === 'STOWED');
      case 'containers':
        return characterData.inventory.filter(item => item.location === 'CONTAINER');
      default:
        return [];
    }
  }, [characterData, activeTab]);

  const items = getItemsForTab();

  // Calculate total weight for current tab
  const tabWeight = items.reduce((sum, item) => sum + (item.weight || 0) * item.quantity, 0);

  // Drag and drop handlers
  const handleDragStart = (item: InventoryItem, sourceLocation: string, sourceContainerId: string | null) => {
    setDragState({ itemId: item.id, sourceLocation, sourceContainerId });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = async (targetLocation: string, targetContainerId: string | null) => {
    if (!dragState.itemId || !currentCampaign) return;

    try {
      await api.post(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/inventory/move`, {
        itemId: dragState.itemId,
        fromContainerId: dragState.sourceContainerId,
        toContainerId: targetContainerId,
        newLocation: targetLocation,
      });

      refetch();
      setDragState({ itemId: null, sourceLocation: null, sourceContainerId: null });
    } catch (error) {
      console.error('Failed to move item:', errorSummary(error));
    }
  };

  const handleDragEnd = () => {
    setDragState({ itemId: null, sourceLocation: null, sourceContainerId: null });
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  };

  // Item actions
  const toggleEquipped = async (item: InventoryItem) => {
    if (!currentCampaign) return;
    try {
      await api.patch(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/inventory/${item.id}`, {
        equipped: !item.equipped,
        location: item.equipped ? 'CARRIED' : 'EQUIPPED',
      });
      refetch();
    } catch (error) {
      console.error('Failed to toggle equipped:', errorSummary(error));
    }
  };

  const toggleAttuned = async (item: InventoryItem) => {
    if (!currentCampaign) return;
    try {
      await api.patch(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/inventory/${item.id}`, {
        attuned: !item.attuned,
      });
      refetch();
    } catch (error) {
      console.error('Failed to toggle attunement:', errorSummary(error));
    }
  };

  const updateQuantity = async (item: InventoryItem, delta: number) => {
    if (!currentCampaign) return;
    const newQuantity = Math.max(0, item.quantity + delta);
    try {
      await api.patch(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/inventory/${item.id}`, {
        quantity: newQuantity,
      });
      refetch();
    } catch (error) {
      console.error('Failed to update quantity:', errorSummary(error));
    }
  };

  const deleteItem = async (item: InventoryItem) => {
    if (!currentCampaign || !window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await api.delete(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/inventory/${item.id}`);
      refetch();
    } catch (error) {
      console.error('Failed to delete item:', errorSummary(error));
    }
  };

  const editItem = (item: InventoryItem) => {
    setNewItem({ ...item });
    setShowAddItemModal(true);
  };

  const saveItem = async () => {
    if (!currentCampaign || !newItem.name) return;
    try {
      if (newItem.id) {
        await api.patch(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/inventory/${newItem.id}`, newItem);
      } else {
        await api.post(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/inventory`, newItem);
      }
      refetch();
      setShowAddItemModal(false);
      setNewItem({ name: '', quantity: 1, weight: 0, notes: '', equippable: false, requiresAttunement: false, magical: false });
    } catch (error) {
      console.error('Failed to save item:', errorSummary(error));
    }
  };

  // Container actions
  const toggleContainer = (containerId: string) => {
    setExpandedContainers(prev => {
      const next = new Set(prev);
      if (next.has(containerId)) next.delete(containerId);
      else next.add(containerId);
      return next;
    });
  };

  const saveContainer = async () => {
    if (!currentCampaign || !newContainer.name) return;
    try {
      await api.post(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/containers`, newContainer);
      refetch();
      setShowAddContainerModal(false);
      setNewContainer({ name: '', type: 'CUSTOM', capacity: 0, capacityUnit: 'LBS', baseWeight: 0, parentId: '' });
    } catch (error) {
      console.error('Failed to save container:', errorSummary(error));
    }
  };

  // Currency actions
  const openCurrencyModal = (type: 'add' | 'transfer', containerId?: string) => {
    setShowCurrencyModal({ type, containerId });
    setCurrencyAmount({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 });
  };

  const saveCurrency = async () => {
    if (!currentCampaign || !showCurrencyModal) return;
    try {
      if (showCurrencyModal.type === 'add') {
        await api.post(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/currency/add`, {
          containerId: showCurrencyModal.containerId,
          ...currencyAmount,
        });
      } else {
        await api.post(`/api/campaigns/${currentCampaign.id}/characters/${characterId}/currency/transfer`, {
          fromContainerId: showCurrencyModal.containerId!,
          ...currencyAmount,
        });
      }
      refetch();
      setShowCurrencyModal(null);
    } catch (error) {
      console.error('Failed to save currency:', errorSummary(error));
    }
  };

  // Format currency for display
  const formatCurrency = (amount: CurrencyAmount): string => {
    const parts: string[] = [];
    if (amount.pp > 0) parts.push(`${amount.pp.toLocaleString()} pp`);
    if (amount.gp > 0) parts.push(`${amount.gp.toLocaleString()} gp`);
    if (amount.ep > 0) parts.push(`${amount.ep.toLocaleString()} ep`);
    if (amount.sp > 0) parts.push(`${amount.sp.toLocaleString()} sp`);
    if (amount.cp > 0) parts.push(`${amount.cp.toLocaleString()} cp`);
    if (amount.nuyen > 0) parts.push(`¥${amount.nuyen.toLocaleString()}`);
    if (amount.cash > 0) parts.push(`$${amount.cash.toLocaleString()}`);
    return parts.length > 0 ? parts.join(', ') : '—';
  };

  const formatWeight = (weight: number): string => {
    if (gameSystem === 'PATHFINDER_2E') {
      return `${weight.toFixed(1)} Bulk`;
    }
    return `${weight.toFixed(1)} lbs`;
  };

  const getEncumbranceColor = (status: string): string => {
    switch (status) {
      case 'NORMAL': return 'text-success-ink bg-success/15';
      case 'ENCUMBERED': return 'text-warning-ink bg-warning/15';
      case 'HEAVILY_ENCUMBERED': return 'text-danger-ink bg-danger/15';
      default: return 'text-ink-muted bg-surface-light';
    }
  };

  const renderContainerTree = (nodes: ContainerTree[], depth: number = 0) => (
    <div>
      {nodes.map(node => (
        <div key={node.id} style={{ marginLeft: `${depth * 1.5}rem` }}>
          <div className="flex items-center gap-2 p-2 bg-surface-light rounded border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleContainer(node.id)}
              className="p-1"
            >
              {expandedContainers.has(node.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
            <span className="font-medium flex-1">{node.name}</span>
            <span className="text-sm text-ink-muted">
              {formatWeight(node.totalContentsWeight)} / {formatWeight(node.capacity)}
            </span>
            {node.isOverCapacity && (
              <AlertTriangle className="w-4 h-4 text-danger-ink" aria-label="Over capacity" />
            )}
            {node.isMagical && <Sparkles className="w-4 h-4 text-spirit-ink" aria-label="Magical" />}
          </div>
          
          {expandedContainers.has(node.id) && (
            <>
              {node.items.map(item => (
                <div key={item.id} className="flex items-center gap-2 p-2 ml-4 bg-white rounded border border-edge">
                  <span className="flex-1">{item.name} x{item.quantity}</span>
                  <span className="text-sm text-ink-muted">{formatWeight(item.weight * item.quantity)}</span>
                  {item.attuned && <Sparkles className="w-4 h-4 text-brand-ink" aria-label="Attuned" />}
                </div>
              ))}
              {node.children.length > 0 && renderContainerTree(node.children, depth + 1)}
            </>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Encumbrance Status Bar */}
      {encumbrance && (
        <div className="p-3 bg-surface-light border-b flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getEncumbranceColor(encumbrance.status)}`}>
              {encumbrance.statusLabel}
            </span>
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <span>Weight: <strong>{formatWeight(encumbrance.currentWeight)}</strong> / {formatWeight(encumbrance.maxWeight)}</span>
              <div className="w-32 h-2 bg-surface-dark rounded overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-success via-warning to-danger" 
                  style={{ width: `${encumbrance.capacityPercent}%` }}
                />
              </div>
              <span>{encumbrance.capacityPercent}%</span>
            </div>
            {encumbrance.speedPenalty > 0 && (
              <Tooltip content={`Speed penalty: -${encumbrance.speedPenalty} ft`}>
                <span className="text-danger-ink flex items-center gap-1">
                  <RotateCcw className="w-4 h-4" /> -{encumbrance.speedPenalty} ft
                </span>
              </Tooltip>
            )}
            {encumbrance.dexCheckDisadvantage && (
              <Tooltip content="Disadvantage on Dexterity checks">
                <span className="text-danger-ink flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> Dex Disadvantage
                </span>
              </Tooltip>
            )}
          </div>
          <div className="text-xs text-ink-muted">
            Push/Drag/Lift: {formatWeight(encumbrance.pushDragLift)}
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex border-b overflow-x-auto">
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-brand text-brand-ink bg-brand/10'
                : 'text-ink-muted hover:text-ink-secondary hover:bg-surface-light'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.id !== 'currency' && tab.id !== 'containers' && (
              <span className="px-2 py-0.5 text-xs bg-surface-light rounded">
                {items.length}
              </span>
            )}
            {tab.id === 'equipped' && <span className="text-xs text-ink-muted">{formatWeight(tabWeight)}</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'containers' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Containers</h3>
              <Button onClick={() => setShowAddContainerModal(true)} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Add Container
              </Button>
            </div>
            {containers.length === 0 ? (
              <div className="text-center py-8 text-ink-muted">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No containers yet. Add a backpack, pouch, or magical container.</p>
              </div>
            ) : (
              renderContainerTree(containers)
            )}
          </div>
        )}

        {activeTab === 'currency' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Currency</h3>
              <Button onClick={() => openCurrencyModal('add')} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Add Currency
              </Button>
            </div>

            {/* Total currency */}
            <div className="p-4 bg-gradient-to-r from-warning/10 to-warning/10 rounded-lg border border-warning/30">
              <div className="font-medium text-ink-secondary">Total Wealth</div>
              <div className="text-lg font-mono font-semibold text-warning-ink mt-1">
                {formatCurrency(characterData?.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 })}
              </div>
            </div>

            {/* Currency containers */}
            {currencyContainers.length === 0 ? (
              <div className="text-center py-8 text-ink-muted">
                <Coins className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No currency containers. Add a purse, pouch, or bank.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {currencyContainers.map(container => (
                  <div key={container.id} className="flex items-center justify-between p-3 bg-surface-light rounded border">
                    <div className="flex items-center gap-3">
                      <Coins className="w-5 h-5 text-warning-ink" />
                      <div>
                        <div className="font-medium">{container.name}</div>
                        <div className="text-sm text-ink-muted font-mono">
                          {formatCurrency({
                            cp: container.cp,
                            sp: container.sp,
                            ep: container.ep,
                            gp: container.gp,
                            pp: container.pp,
                            nuyen: container.nuyen,
                            cash: container.cash,
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openCurrencyModal('add', container.id)}>
                        Add
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openCurrencyModal('transfer', container.id)}>
                        Transfer
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(activeTab !== 'containers' && activeTab !== 'currency') && (
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium capitalize">{activeTab} Items</h3>
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <span>{items.length} items</span>
                <span>•</span>
                <span>{formatWeight(tabWeight)}</span>
                <Button onClick={() => setShowAddItemModal(true)} size="sm">
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-8 text-ink-muted">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No {activeTab} items. Add items to your inventory.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <InventoryItemRow
                    key={item.id}
                    item={item}
                    onDragStart={handleDragStart}
                    onToggleEquipped={toggleEquipped}
                    onToggleAttuned={toggleAttuned}
                    onUpdateQuantity={updateQuantity}
                    onDelete={deleteItem}
                    onEdit={editItem}
                    formatWeight={formatWeight}
                    gameSystem={gameSystem}
                    dragState={dragState}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={() => handleDrop(activeTab.toUpperCase() as string, null)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Item Modal */}
      <Modal isOpen={showAddItemModal} onClose={() => setShowAddItemModal(false)} title={newItem.id ? 'Edit Item' : 'Add Item'}>
        <div className="space-y-4">
          <Input label="Name" value={newItem.name || ''} onChange={v => setNewItem({...newItem, name: v})} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Quantity" type="number" value={newItem.quantity || 1} onChange={v => setNewItem({...newItem, quantity: parseInt(v)})} />
            <Input label="Weight" type="number" step="0.1" value={newItem.weight || 0} onChange={v => setNewItem({...newItem, weight: parseFloat(v)})} />
          </div>
          <Input label="Notes" value={newItem.notes || ''} onChange={v => setNewItem({...newItem, notes: v})} multiline rows={2} />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <Checkbox checked={newItem.equippable} onChange={v => setNewItem({...newItem, equippable: v})} />
              Equippable
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={newItem.requiresAttunement} onChange={v => setNewItem({...newItem, requiresAttunement: v})} />
              Requires Attunement
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={newItem.magical} onChange={v => setNewItem({...newItem, magical: v})} />
              Magical
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddItemModal(false)}>Cancel</Button>
            <Button onClick={saveItem}>{newItem.id ? 'Save' : 'Add'}</Button>
          </div>
        </div>
      </Modal>

      {/* Add Container Modal */}
      <Modal isOpen={showAddContainerModal} onClose={() => setShowAddContainerModal(false)} title="Add Container">
        <div className="space-y-4">
          <Input label="Name" value={newContainer.name} onChange={v => setNewContainer({...newContainer, name: v})} required />
          <Select label="Type" value={newContainer.type} onChange={v => setNewContainer({...newContainer, type: v})} options={[
            { value: 'BACKPACK', label: 'Backpack' },
            { value: 'POUCH', label: 'Pouch' },
            { value: 'CHEST', label: 'Chest' },
            { value: 'CART', label: 'Cart' },
            { value: 'BAG_OF_HOLDING', label: 'Bag of Holding' },
            { value: 'PORTABLE_HOLE', label: 'Portable Hole' },
            { value: 'HANDY_HAVERSACK', label: 'Handy Haversack' },
            { value: 'QUIVER', label: 'Quiver' },
            { value: 'SCABBARD', label: 'Scabbard' },
            { value: 'BELT_POUCH', label: 'Belt Pouch' },
            { value: 'CUSTOM', label: 'Custom' },
          ]} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Capacity" type="number" value={newContainer.capacity} onChange={v => setNewContainer({...newContainer, capacity: parseFloat(v)})} />
            <Select label="Unit" value={newContainer.capacityUnit} onChange={v => setNewContainer({...newContainer, capacityUnit: v})} options={[
              { value: 'LBS', label: 'LBS' },
              { value: 'BULK', label: 'BULK' },
              { value: 'KG', label: 'KG' },
            ]} />
          </div>
          <Input label="Base Weight (empty)" type="number" step="0.1" value={newContainer.baseWeight} onChange={v => setNewContainer({...newContainer, baseWeight: parseFloat(v)})} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddContainerModal(false)}>Cancel</Button>
            <Button onClick={saveContainer}>Add Container</Button>
          </div>
        </div>
      </Modal>

      {/* Currency Modal */}
      <Modal isOpen={!!showCurrencyModal} onClose={() => setShowCurrencyModal(null)} title={showCurrencyModal?.type === 'add' ? 'Add Currency' : 'Transfer Currency'}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Input label="CP" type="number" value={currencyAmount.cp} onChange={v => setCurrencyAmount({...currencyAmount, cp: parseInt(v)})} />
            <Input label="SP" type="number" value={currencyAmount.sp} onChange={v => setCurrencyAmount({...currencyAmount, sp: parseInt(v)})} />
            <Input label="EP" type="number" value={currencyAmount.ep} onChange={v => setCurrencyAmount({...currencyAmount, ep: parseInt(v)})} />
            <Input label="GP" type="number" value={currencyAmount.gp} onChange={v => setCurrencyAmount({...currencyAmount, gp: parseInt(v)})} />
            <Input label="PP" type="number" value={currencyAmount.pp} onChange={v => setCurrencyAmount({...currencyAmount, pp: parseInt(v)})} />
            <Input label="Nuyen" type="number" value={currencyAmount.nuyen} onChange={v => setCurrencyAmount({...currencyAmount, nuyen: parseInt(v)})} />
            <Input label="Cash" type="number" step="0.01" value={currencyAmount.cash} onChange={v => setCurrencyAmount({...currencyAmount, cash: parseFloat(v)})} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCurrencyModal(null)}>Cancel</Button>
            <Button onClick={saveCurrency}>{showCurrencyModal?.type === 'add' ? 'Add' : 'Transfer'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Inventory Item Row Component
interface InventoryItemRowProps {
  item: InventoryItem;
  onDragStart: (item: InventoryItem, sourceLocation: string, sourceContainerId: string | null) => void;
  onToggleEquipped: (item: InventoryItem) => void;
  onToggleAttuned: (item: InventoryItem) => void;
  onUpdateQuantity: (item: InventoryItem, delta: number) => void;
  onDelete: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  formatWeight: (weight: number) => string;
  gameSystem: string;
  dragState: { itemId: string | null; sourceLocation: string | null; sourceContainerId: string | null };
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function InventoryItemRow({
  item,
  onDragStart,
  onToggleEquipped,
  onToggleAttuned,
  onUpdateQuantity,
  onDelete,
  onEdit,
  formatWeight,
  gameSystem: _gameSystem,
  dragState,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: InventoryItemRowProps) {
  const isDragging = dragState.itemId === item.id;

  return (
    <div
      className={`flex items-center gap-3 p-3 bg-white rounded border transition-all ${
        isDragging ? 'opacity-50 ring-2 ring-brand' : ''
      }`}
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(item, 'CARRIED', item.containerId || null);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <GripVertical className="w-5 h-5 text-ink-muted cursor-grab active:cursor-grabbing" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{item.name}</span>
          {item.magical && <Sparkles className="w-4 h-4 text-spirit-ink" aria-label="Magical" />}
          {item.requiresAttunement && !item.attuned && <AlertTriangle className="w-4 h-4 text-warning-ink" aria-label="Requires Attunement" />}
          {item.attuned && <Sparkles className="w-4 h-4 text-brand-ink" aria-label="Attuned" />}
          {item.equipped && <Shield className="w-4 h-4 text-success-ink" aria-label="Equipped" />}
        </div>
        <div className="flex items-center gap-4 text-sm text-ink-muted">
          <span>Qty: {item.quantity}</span>
          <span>Weight: {formatWeight(item.weight * item.quantity)}</span>
          {item.charges && (
            <span>Charges: {item.charges.current}/{item.charges.max}</span>
          )}
          {item.value && (
            <span className="text-warning-ink">
              Value: {typeof item.value === 'object' ? `${item.value.amount} ${item.value.currency}` : `${item.value} gp`}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => onUpdateQuantity(item, -1)} disabled={item.quantity <= 1}>
          <Minus className="w-4 h-4" />
        </Button>
        <span className="w-8 text-center">{item.quantity}</span>
        <Button variant="ghost" size="sm" onClick={() => onUpdateQuantity(item, 1)}>
          <Plus className="w-4 h-4" />
        </Button>

        {item.equippable && (
          <Tooltip content={item.equipped ? 'Unequip' : 'Equip'}>
            <Button variant="ghost" size="sm" onClick={() => onToggleEquipped(item)}>
              {item.equipped ? <Shield className="w-4 h-4 text-success-ink" /> : <Shield className="w-4 h-4" />}
            </Button>
          </Tooltip>
        )}

        {item.requiresAttunement && (
          <Tooltip content={item.attuned ? 'Unattune' : 'Attune'}>
            <Button variant="ghost" size="sm" onClick={() => onToggleAttuned(item)}>
              {item.attuned ? <Sparkles className="w-4 h-4 text-brand-ink" /> : <Sparkles className="w-4 h-4" />}
            </Button>
          </Tooltip>
        )}

        <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(item)} className="text-danger-ink hover:text-danger-ink">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default InventoryManager;
