import React, { useState, useMemo, useEffect } from 'react';
import { useShop } from '../../hooks/useShop';
import { useCampaign } from '../../hooks/useCampaign';
import { useToast } from '@/contexts/ToastContext';
import { Modal, Button, Input, Textarea, Select, Field } from '@/components/ui';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  Plus,
  Trash2,
  Lock,
  Search,
  ShoppingBag,
  Coins,
  Settings,
  RefreshCw,
  Eye,
  EyeOff,
  GripVertical,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Shop, ShopItem, ShopItemType, ShopType, CreateShopInput } from '../../types/shop';
import { formatCurrency } from '../../utils/currency';

interface ShopBuilderProps {
  campaignId: string;
  shopId?: string;
  onClose: () => void;
  onSave: (shop: Shop) => void;
}

const SHOP_ITEM_TYPE_LABELS: Record<ShopItemType, string> = {
  RULEBOOK_SPELL: 'Rulebook Spell',
  RULEBOOK_ITEM: 'Rulebook Item',
  RULEBOOK_MONSTER_PART: 'Monster Part',
  CUSTOM_ITEM: 'Custom Item',
  CHARACTER_TEMPLATE: 'Character Template',
  TOKEN_TEMPLATE: 'Token Template',
  LOOT_TABLE: 'Loot Table',
};

const SHOP_TYPE_LABELS: Record<ShopType, string> = {
  GENERAL: 'General Store',
  MAGIC: 'Magic Shop',
  BLACKSMITH: 'Blacksmith',
  ALCHEMIST: 'Alchemist',
  TEMPLE: 'Temple',
  BLACK_MARKET: 'Black Market',
  CUSTOM: 'Custom',
};

export const ShopBuilder: React.FC<ShopBuilderProps> = ({ campaignId, shopId, onClose, onSave }) => {
  const { showToast } = useToast();
  const { shops, loading, createShop, updateShop, deleteShopItem, reorderItems, restockShop, addShopItem, updateShopItem } = useShop(campaignId);
  const { rulebookItems, customItems, characterTemplates, maps } = useCampaign(campaignId);

  const shop = useMemo(() => (shopId ? shops.find(s => s.id === shopId) : null), [shopId, shops]);
  const items = useMemo(() => shop?.items || [], [shop]);

  const [activeTab, setActiveTab] = useState<'details' | 'items' | 'pricing' | 'restock'>('details');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInvisible, setShowInvisible] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ShopType>('GENERAL');
  const [mapId, setMapId] = useState<string>('');
  const [tokenId, setTokenId] = useState<string>('');
  const [buyModifier, setBuyModifier] = useState<number>(1.0);
  const [sellModifier, setSellModifier] = useState<number>(0.5);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [currencies, setCurrencies] = useState<Record<string, number>>({
    cp: 0,
    sp: 0,
    ep: 0,
    gp: 1,
    pp: 0,
    nuyen: 0,
    cash: 0,
  });
  const [restockRule, setRestockRule] = useState<{
    interval: 'DAWN' | 'WEEKLY' | 'MONTHLY';
    chance: number;
    maxRestock: number;
  }>({
    interval: 'DAWN',
    chance: 0.5,
    maxRestock: 3,
  });

  // Notes Modal state
  const [notesModalItem, setNotesModalItem] = useState<ShopItem | null>(null);
  const [itemNotes, setItemNotes] = useState('');

  // Native drag & drop reorder state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (shop) {
      setName(shop.name || '');
      setDescription(shop.description || '');
      setType(shop.type || 'GENERAL');
      setMapId(shop.mapId || '');
      setTokenId(shop.tokenId || '');
      setBuyModifier(shop.buyModifier ?? 1.0);
      setSellModifier(shop.sellModifier ?? 0.5);
      setIsActive(shop.isActive ?? true);
      if (shop.currency) {
        setCurrencies(shop.currency as unknown as Record<string, number>);
      }
      if (shop.restockRule) {
        setRestockRule(shop.restockRule as { interval: 'DAWN' | 'WEEKLY' | 'MONTHLY'; chance: number; maxRestock: number });
      }
    }
  }, [shop]);

  const filteredItems = useMemo(() => {
    return items
      .filter(item => {
        if (!showInvisible && !item.isVisible) return false;
        if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
        if (searchQuery && !item.itemName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, selectedCategory, searchQuery, showInvisible]);

  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category).filter(Boolean) as string[]);
    return ['All', ...Array.from(cats).sort()];
  }, [items]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Shop name is required', 'error');
      return;
    }

    try {
      const payload: CreateShopInput = {
        campaignId,
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        mapId: mapId || undefined,
        tokenId: tokenId.trim() || undefined,
        buyModifier,
        sellModifier,
        currency: currencies as unknown as CreateShopInput['currency'],
        restockRule,
        isActive,
      };

      if (shopId) {
        const updated = await updateShop(shopId, payload);
        showToast('Shop updated successfully', 'success');
        onSave(updated);
      } else {
        const created = await createShop(campaignId, payload);
        showToast('Shop created successfully', 'success');
        onSave(created);
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save shop';
      showToast(message, 'error');
    }
  };

  const handleToggleVisibility = async (itemId: string, currentVisibility: boolean) => {
    if (!shopId) return;
    try {
      await updateShopItem(shopId, itemId, { isVisible: !currentVisibility });
      showToast(`Item ${!currentVisibility ? 'visible' : 'hidden'}`, 'info');
    } catch {
      showToast('Failed to toggle visibility', 'error');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!shopId) return;
    try {
      await deleteShopItem(campaignId, shopId, itemId);
      showToast('Item removed from shop', 'success');
      setItemToDelete(null);
    } catch {
      showToast('Failed to delete item', 'error');
    }
  };

  const handleRestock = async () => {
    if (!shopId) return;
    try {
      const res = await restockShop(shopId);
      if (res.success) {
        showToast('Shop inventory restocked', 'success');
      } else {
        showToast(res.error || 'Failed to restock', 'error');
      }
    } catch {
      showToast('Failed to restock shop', 'error');
    }
  };

  // HTML5 Native Drag and Drop
  const handleDragStart = (id: string) => {
    setDraggedItemId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetId: string) => {
    if (!draggedItemId || draggedItemId === targetId || !shopId) return;

    const sourceIdx = filteredItems.findIndex(i => i.id === draggedItemId);
    const targetIdx = filteredItems.findIndex(i => i.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const reordered = [...filteredItems];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      sortOrder: index,
      category: item.category,
    }));

    try {
      await reorderItems(shopId, updates);
      showToast('Items reordered', 'info');
    } catch {
      showToast('Failed to reorder items', 'error');
    } finally {
      setDraggedItemId(null);
    }
  };

  const moveItemOrder = async (index: number, direction: 'up' | 'down') => {
    if (!shopId) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredItems.length) return;

    const reordered = [...filteredItems];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const updates = reordered.map((item, idx) => ({
      id: item.id,
      sortOrder: idx,
      category: item.category,
    }));

    await reorderItems(shopId, updates);
  };

  const saveNotes = async () => {
    if (!shopId || !notesModalItem) return;
    try {
      await updateShopItem(shopId, notesModalItem.id, { notes: itemNotes.trim() || null });
      showToast('DM Notes updated', 'success');
      setNotesModalItem(null);
    } catch {
      showToast('Failed to save notes', 'error');
    }
  };

  return (
    <>
      <Modal
        open={true}
        onClose={onClose}
        title={shopId ? `Edit Shop: ${name || shop?.name}` : 'Create New Shop'}
        icon={ShoppingBag}
        size="xl"
        fitViewport
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} loading={loading}>
              {shopId ? 'Save Changes' : 'Create Shop'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col h-full space-y-4">
          {/* Navigation Tabs */}
          <div className="flex border-b border-ink-muted/20 gap-2">
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'details'
                  ? 'border-brand text-brand-ink font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
              onClick={() => setActiveTab('details')}
            >
              <Settings className="w-4 h-4" />
              Details
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'items'
                  ? 'border-brand text-brand-ink font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
              onClick={() => setActiveTab('items')}
            >
              <ShoppingBag className="w-4 h-4" />
              Items ({items.length})
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pricing'
                  ? 'border-brand text-brand-ink font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
              onClick={() => setActiveTab('pricing')}
            >
              <Coins className="w-4 h-4" />
              Pricing
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'restock'
                  ? 'border-brand text-brand-ink font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
              onClick={() => setActiveTab('restock')}
            >
              <RefreshCw className="w-4 h-4" />
              Restock
            </button>
          </div>

          {/* Tab 1: Details */}
          {activeTab === 'details' && (
            <div className="space-y-4 overflow-y-auto pr-1">
              <Field label="Shop Name" required>
                {(props) => (
                  <Input
                    {...props}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ye Olde Armory"
                  />
                )}
              </Field>

              <Field label="Description">
                {(props) => (
                  <Textarea
                    {...props}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Flavor text or description visible to players..."
                    rows={3}
                  />
                )}
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Shop Type" required>
                  {(props) => (
                    <Select
                      {...props}
                      value={type}
                      onChange={(e) => setType(e.target.value as ShopType)}
                    >
                      {Object.entries(SHOP_TYPE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="Linked Map (Optional)">
                  {(props) => (
                    <Select
                      {...props}
                      value={mapId}
                      onChange={(e) => setMapId(e.target.value)}
                    >
                      <option value="">No Map Link</option>
                      {maps?.map((m: { id: string; name: string }) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <Field label="Token ID (Optional)">
                  {(props) => (
                    <Input
                      {...props}
                      value={tokenId}
                      onChange={(e) => setTokenId(e.target.value)}
                      placeholder="Associated NPC Token ID"
                    />
                  )}
                </Field>

                <div className="pt-6">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="rounded border-ink-muted/30 text-brand-ink focus:ring-brand w-4 h-4"
                    />
                    <span className="text-sm font-medium text-ink">Shop is Open / Active</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Items */}
          {activeTab === 'items' && (
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-44">
                    <Select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="relative w-56">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink-muted" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search items..."
                      className="pl-9 text-sm"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showInvisible}
                      onChange={(e) => setShowInvisible(e.target.checked)}
                      className="rounded text-brand-ink"
                    />
                    Show Hidden
                  </label>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={() => setItemPickerOpen(true)}
                  disabled={!shopId}
                >
                  Add Item
                </Button>
              </div>

              {!shopId ? (
                <div className="p-6 text-center text-sm text-ink-muted bg-surface/40 rounded-lg">
                  Please save the shop first before adding items.
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-ink-muted border border-dashed border-ink-muted/20 rounded-lg">
                  <ShoppingBag className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm">No items in this shop yet.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    icon={Plus}
                    onClick={() => setItemPickerOpen(true)}
                  >
                    Add an item
                  </Button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto border border-ink-muted/20 rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface/80 border-b border-ink-muted/20 text-ink-secondary sticky top-0">
                      <tr>
                        <th className="py-2 px-3 w-8">#</th>
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3 text-center">Stock</th>
                        <th className="py-2 px-3 text-right">Price</th>
                        <th className="py-2 px-3 text-center">Vis</th>
                        <th className="py-2 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-muted/10">
                      {filteredItems.map((item, index) => {
                        const price = item.priceOverride || item.itemData?.price || { gp: 0 };
                        return (
                          <tr
                            key={item.id}
                            draggable
                            onDragStart={() => handleDragStart(item.id)}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDrop(item.id)}
                            className={`hover:bg-surface/50 transition-colors ${
                              !item.isVisible ? 'opacity-50' : ''
                            } ${draggedItemId === item.id ? 'bg-brand/10' : ''}`}
                          >
                            <td className="py-2 px-3 text-ink-muted cursor-grab">
                              <GripVertical className="w-3.5 h-3.5" />
                            </td>
                            <td className="py-2 px-3 font-medium text-ink">
                              <div>
                                <span className="font-semibold">{item.itemName}</span>
                                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-ink/5 text-ink-muted">
                                  {SHOP_ITEM_TYPE_LABELS[item.itemType] || item.itemType}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-ink-secondary">{item.category || '—'}</td>
                            <td className="py-2 px-3 text-center font-mono">
                              {item.stock === -1 ? (
                                <span className="text-success-ink font-bold">∞</span>
                              ) : (
                                <span className={item.currentStock <= 0 ? 'text-danger-ink font-semibold' : ''}>
                                  {item.currentStock}/{item.maxStock === -1 ? '∞' : item.maxStock}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-medium">
                              {formatCurrency(price as unknown as Parameters<typeof formatCurrency>[0])}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleVisibility(item.id, item.isVisible)}
                                className="text-ink-secondary hover:text-ink"
                                title={item.isVisible ? 'Hide from players' : 'Show to players'}
                              >
                                {item.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-ink-muted" />}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() => moveItemOrder(index, 'up')}
                                  className="text-ink-secondary hover:text-ink disabled:opacity-30"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={index === filteredItems.length - 1}
                                  onClick={() => moveItemOrder(index, 'down')}
                                  className="text-ink-secondary hover:text-ink disabled:opacity-30"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNotesModalItem(item);
                                    setItemNotes(item.notes || '');
                                  }}
                                  className={item.notes ? 'text-brand-ink' : 'text-ink-muted hover:text-ink'}
                                  title={item.notes ? 'Edit DM notes' : 'Add DM notes'}
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setItemToDelete(item.id)}
                                  className="text-danger-ink hover:opacity-80"
                                  title="Remove item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Pricing */}
          {activeTab === 'pricing' && (
            <div className="space-y-4 overflow-y-auto pr-1">
              <div>
                <h4 className="text-sm font-semibold text-ink">Price Modifiers</h4>
                <p className="text-xs text-ink-muted mb-3">Multipliers applied relative to rulebook base item values.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Buy Modifier (Price to Players)" hint="e.g. 1.0 = base price, 1.2 = 20% markup">
                    {(props) => (
                      <Input
                        {...props}
                        type="number"
                        step="0.05"
                        min="0.1"
                        max="10"
                        value={buyModifier}
                        onChange={(e) => setBuyModifier(parseFloat(e.target.value) || 1.0)}
                      />
                    )}
                  </Field>

                  <Field label="Sell Modifier (Offer for Player Items)" hint="e.g. 0.5 = 50% of base value">
                    {(props) => (
                      <Input
                        {...props}
                        type="number"
                        step="0.05"
                        min="0.05"
                        max="5"
                        value={sellModifier}
                        onChange={(e) => setSellModifier(parseFloat(e.target.value) || 0.5)}
                      />
                    )}
                  </Field>
                </div>
              </div>

              <div className="border-t border-ink-muted/15 pt-4">
                <h4 className="text-sm font-semibold text-ink">Accepted Currencies (Starting Stock)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                  {(['cp', 'sp', 'ep', 'gp', 'pp', 'nuyen', 'cash'] as const).map((curr) => (
                    <div key={curr} className="flex flex-col">
                      <label className="text-xs font-medium uppercase text-ink-secondary mb-1">
                        {curr}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={currencies[curr] || 0}
                        onChange={(e) =>
                          setCurrencies((prev) => ({
                            ...prev,
                            [curr]: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Restock */}
          {activeTab === 'restock' && (
            <div className="space-y-4 overflow-y-auto pr-1">
              <div>
                <h4 className="text-sm font-semibold text-ink">Automatic Restock Rules</h4>
                <p className="text-xs text-ink-muted mb-3">Replenish shop stock on scheduled triggers.</p>

                <div className="space-y-3">
                  <Field label="Restock Interval">
                    {(props) => (
                      <Select
                        {...props}
                        value={restockRule.interval}
                        onChange={(e) =>
                          setRestockRule((prev) => ({
                            ...prev,
                            interval: e.target.value as 'DAWN' | 'WEEKLY' | 'MONTHLY',
                          }))
                        }
                      >
                        <option value="DAWN">Daily at Dawn</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                      </Select>
                    )}
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Restock Chance (0.0 to 1.0)" hint="Probability an item restocks each cycle">
                      {(props) => (
                        <Input
                          {...props}
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          value={restockRule.chance}
                          onChange={(e) =>
                            setRestockRule((prev) => ({
                              ...prev,
                              chance: parseFloat(e.target.value) || 0,
                            }))
                          }
                        />
                      )}
                    </Field>

                    <Field label="Max Quantity Per Cycle" hint="Cap on added items">
                      {(props) => (
                        <Input
                          {...props}
                          type="number"
                          min="1"
                          max="100"
                          value={restockRule.maxRestock}
                          onChange={(e) =>
                            setRestockRule((prev) => ({
                              ...prev,
                              maxRestock: parseInt(e.target.value, 10) || 1,
                            }))
                          }
                        />
                      )}
                    </Field>
                  </div>
                </div>
              </div>

              {shopId && (
                <div className="border-t border-ink-muted/15 pt-4">
                  <h4 className="text-sm font-semibold text-ink mb-1">Manual Restock</h4>
                  <p className="text-xs text-ink-muted mb-3">
                    Trigger an immediate stock replenish using the restock chance above.
                  </p>
                  <Button
                    variant="secondary"
                    icon={RefreshCw}
                    onClick={handleRestock}
                    loading={loading}
                  >
                    Restock Now
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Item Picker Modal */}
      {itemPickerOpen && shopId && (
        <Modal
          open={true}
          onClose={() => setItemPickerOpen(false)}
          title="Add Items to Shop"
          icon={Plus}
          size="lg"
          fitViewport
          footer={
            <Button variant="secondary" onClick={() => setItemPickerOpen(false)}>
              Done
            </Button>
          }
        >
          <div className="flex flex-col h-full space-y-3">
            <div className="text-xs text-ink-muted">
              Select items from campaigns, rulebooks, or templates to stock this store:
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-ink-muted/15 pr-1">
              {[...(rulebookItems || []), ...(customItems || []), ...(characterTemplates || [])].map((item, idx) => (
                <div key={item.id || idx} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink">{item.name || item.itemName}</div>
                    <div className="text-xs text-ink-muted">
                      {item.category || item.type || 'General'}
                      {item.price ? ` · ${formatCurrency(item.price)}` : ''}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Plus}
                    onClick={async () => {
                      try {
                        await addShopItem(campaignId, shopId, {
                          itemType: item.rulebookId ? 'RULEBOOK_ITEM' : 'CUSTOM_ITEM',
                          itemRef: item.id,
                          itemName: item.name || item.itemName,
                          itemData: item,
                          category: item.category || 'General',
                          stock: 1,
                          maxStock: 5,
                          currentStock: 1,
                        });
                        showToast(`Added ${item.name || item.itemName}`, 'success');
                      } catch {
                        showToast('Failed to add item', 'error');
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* DM Notes Modal */}
      {notesModalItem && (
        <Modal
          open={true}
          onClose={() => setNotesModalItem(null)}
          title={`DM Notes: ${notesModalItem.itemName}`}
          icon={Lock}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setNotesModalItem(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={saveNotes}>
                Save Notes
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-ink-muted">
              Private DM-only notes (e.g. haggling bounds, item provenance, hidden curses).
            </p>
            <Textarea
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value)}
              placeholder="Private notes..."
              rows={4}
            />
          </div>
        </Modal>
      )}

      {/* Confirm Item Deletion */}
      {itemToDelete && (
        <ConfirmDialog
          open={true}
          title="Remove Item"
          message="Are you sure you want to remove this item from the shop inventory?"
          confirmLabel="Remove"
          danger
          onConfirm={() => handleDeleteItem(itemToDelete)}
          onCancel={() => setItemToDelete(null)}
        />
      )}
    </>
  );
};

export default ShopBuilder;