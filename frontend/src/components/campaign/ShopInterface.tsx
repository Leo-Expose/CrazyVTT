import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useShop } from '../../hooks/useShop';
import { useCharacter } from '../../hooks/useCharacter';
import { useInventory } from '../../hooks/useInventory';
import { useToast } from '@/contexts/ToastContext';
import { Modal, Button, Input, Select } from '@/components/ui';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  ShoppingCart,
  Coins,
  Search,
  Plus,
  Minus,
  Trash2,
  Check,
  History,
  FileText,
  ArrowLeft,
  AlertTriangle,
  Store,
  Printer,
  ArrowRightLeft,
} from 'lucide-react';
import type { ShopItem, ShopTransaction, ShopVisit, Currency } from '../../types/shop';
import { formatCurrency, addCurrency, compareCurrency } from '../../utils/currency';

interface ShopInterfaceProps {
  campaignId: string;
  shopId: string;
  characterId: string;
  onClose: () => void;
}

export const ShopInterface: React.FC<ShopInterfaceProps> = ({ campaignId, shopId, characterId, onClose }) => {
  const { showToast } = useToast();
  const { shops, loading: shopLoading, buyItems, sellItems, getTransactions, getVisits } = useShop(campaignId);
  const { currency, loading: currencyLoading } = useCharacter(characterId);
  const { inventory, getInventory } = useInventory(characterId);

  const [activeTab, setActiveTab] = useState<'browse' | 'cart' | 'sell' | 'history'>('browse');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [showOnlyAffordable, setShowOnlyAffordable] = useState(false);
  const [cart, setCart] = useState<Map<string, { item: ShopItem; quantity: number }>>(new Map());
  const [sellItemsList, setSellItemsList] = useState<Map<string, { item: { id: string; name: string; type?: string; price?: Currency; value?: Currency; quantity?: number; imageUrl?: string }; quantity: number }>>(new Map());
  const [transactions, setTransactions] = useState<ShopTransaction[]>([]);
  const [_visits, setVisits] = useState<ShopVisit[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [showReceipt, setShowReceipt] = useState<ShopTransaction | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [sellError, setSellError] = useState<string | null>(null);
  const [itemToRemoveFromCart, setItemToRemoveFromCart] = useState<string | null>(null);
  const [itemToRemoveFromSell, setItemToRemoveFromSell] = useState<string | null>(null);

  const currentShop = useMemo(() => shops?.find(s => s.id === shopId), [shops, shopId]);
  const items = useMemo(() => currentShop?.items || [], [currentShop]);
  const currencySummary = useMemo(() => currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 }, [currency]);

  const multiplyPrice = useCallback((price: Currency, multiplier: number): Currency => {
    const result: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
    (['cp', 'sp', 'ep', 'gp', 'pp', 'nuyen', 'cash'] as const).forEach(key => {
      result[key] = Math.round(price[key] * multiplier);
    });
    return result;
  }, []);

  const canAfford = useCallback((playerCurrency: Currency, cost: Currency): boolean => {
    return compareCurrency(playerCurrency, cost) >= 0;
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      const [txs, vis] = await Promise.all([
        getTransactions(shopId),
        getVisits(shopId),
      ]);
      setTransactions(txs || []);
      setVisits(vis || []);
    } catch {
      showToast('Failed to load transaction history', 'error');
    } finally {
      setLoadingTransactions(false);
    }
  }, [shopId, getTransactions, getVisits, showToast]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (!item.isVisible) return false;
      if (item.currentStock <= 0 && item.stock !== -1) return false;
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (searchQuery && !item.itemName.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      const price = (item.priceOverride || item.itemData?.price || { gp: 0 }) as Currency;
      const gpValue = (price.gp || 0) + (price.pp || 0) * 10 + (price.sp || 0) * 0.1 + (price.cp || 0) * 0.01;
      const [min, max] = priceRange;
      if (gpValue < min || gpValue > max) return false;

      if (showOnlyAffordable) {
        const totalPrice = multiplyPrice(price, currentShop?.buyModifier || 1);
        if (!canAfford(currencySummary, totalPrice)) return false;
      }

      return true;
    }).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, selectedCategory, searchQuery, priceRange, showOnlyAffordable, currentShop, currencySummary, multiplyPrice, canAfford]);

  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category).filter(Boolean) as string[]);
    return ['All', ...Array.from(cats).sort()];
  }, [items]);

  const handleAddToCart = (item: ShopItem) => {
    setCart(prev => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      const maxQty = item.stock === -1 ? 999 : item.currentStock;
      const newQty = (existing?.quantity || 0) + 1;
      if (newQty > maxQty) {
        showToast('Maximum available stock reached', 'info');
        return prev;
      }
      next.set(item.id, { item, quantity: newQty });
      return next;
    });
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart(prev => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        next.delete(itemId);
      } else {
        next.set(itemId, { ...existing, quantity: existing.quantity - 1 });
      }
      return next;
    });
  };

  const handleUpdateCartQuantity = (itemId: string, quantity: number) => {
    setCart(prev => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing) return prev;
      const maxQty = existing.item.stock === -1 ? 999 : existing.item.currentStock;
      if (quantity <= 0) {
        next.delete(itemId);
      } else if (quantity <= maxQty) {
        next.set(itemId, { ...existing, quantity });
      }
      return next;
    });
  };

  const handleAddToSell = (item: { id: string; name: string; type?: string; price?: Currency; value?: Currency; quantity?: number; imageUrl?: string }) => {
    setSellItemsList(prev => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      const maxQty = item.quantity || 1;
      const newQty = (existing?.quantity || 0) + 1;
      if (newQty > maxQty) {
        showToast('Cannot sell more than you own', 'info');
        return prev;
      }
      next.set(item.id, { item, quantity: newQty });
      return next;
    });
  };

  const handleRemoveFromSell = (itemId: string) => {
    setSellItemsList(prev => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        next.delete(itemId);
      } else {
        next.set(itemId, { ...existing, quantity: existing.quantity - 1 });
      }
      return next;
    });
  };

  const getTotalCartPrice = useCallback((): Currency => {
    let total: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
    cart.forEach(({ item, quantity }) => {
      const price = (item.priceOverride || item.itemData?.price || { gp: 0 }) as Currency;
      const unitPrice = multiplyPrice(price, currentShop?.buyModifier || 1);
      const itemTotal = multiplyPrice(unitPrice, quantity);
      total = addCurrency(total, itemTotal);
    });
    return total;
  }, [cart, currentShop?.buyModifier, multiplyPrice]);

  const getTotalSellPrice = useCallback((): Currency => {
    let total: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
    sellItemsList.forEach(({ item, quantity }) => {
      const price = (item.price || item.value || { gp: 0 }) as Currency;
      const unitPrice = multiplyPrice(price, currentShop?.sellModifier || 0.5);
      const itemTotal = multiplyPrice(unitPrice, quantity);
      total = addCurrency(total, itemTotal);
    });
    return total;
  }, [sellItemsList, currentShop?.sellModifier, multiplyPrice]);

  const cartTotal = useMemo(() => getTotalCartPrice(), [getTotalCartPrice]);
  const sellTotal = useMemo(() => getTotalSellPrice(), [getTotalSellPrice]);
  const canAffordCart = useMemo(() => canAfford(currencySummary, cartTotal), [canAfford, currencySummary, cartTotal]);

  const handleBuy = async () => {
    if (cart.size === 0) return;
    setBuyError(null);
    try {
      const itemsToBuy = Array.from(cart.values()).map(({ item, quantity }) => ({
        itemId: item.id,
        quantity,
      }));

      const result = await buyItems(shopId, characterId, { items: itemsToBuy });

      if (result.success) {
        showToast('Purchase completed!', 'success');
        setCart(new Map());
        if (result.transaction) {
          setShowReceipt(result.transaction);
        }
        loadHistory();
      } else {
        setBuyError(result.error || 'Purchase failed');
      }
    } catch {
      setBuyError('An error occurred during purchase');
    }
  };

  const handleSell = async () => {
    if (sellItemsList.size === 0) return;
    setSellError(null);
    try {
      const itemsToSell = Array.from(sellItemsList.values()).map(({ item, quantity }) => ({
        itemId: item.id,
        quantity,
      }));

      const result = await sellItems(shopId, characterId, { items: itemsToSell });

      if (result.success) {
        showToast('Items sold successfully!', 'success');
        setSellItemsList(new Map());
        if (result.transaction) {
          setShowReceipt(result.transaction);
        }
        loadHistory();
        getInventory(characterId);
      } else {
        setSellError(result.error || 'Sale failed');
      }
    } catch {
      setSellError('An error occurred during sale');
    }
  };

  if (shopLoading) {
    return (
      <Modal open={true} onClose={onClose} title="Loading Shop..." size="md">
        <div className="p-8 text-center text-ink-muted">Loading shop details...</div>
      </Modal>
    );
  }

  if (!currentShop) {
    return (
      <Modal open={true} onClose={onClose} title="Shop Not Found" size="sm">
        <div className="p-4 text-center text-danger-ink">Shop could not be found or loaded.</div>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        open={true}
        onClose={onClose}
        title={currentShop.name}
        icon={Store}
        size="xl"
        fitViewport
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 text-xs">
              <Coins className="w-4 h-4 text-brand-ink" />
              <span className="text-ink-secondary">Your Funds:</span>
              <span className="font-mono font-semibold text-ink">
                {currencyLoading ? '...' : formatCurrency(currencySummary)}
              </span>
            </div>
            <Button variant="secondary" onClick={onClose}>
              Close Shop
            </Button>
          </div>
        }
      >
        <div className="flex flex-col h-full space-y-4">
          {/* Header Description & Type Badge */}
          <div className="flex items-center justify-between bg-surface/50 p-2.5 rounded-lg border border-ink-muted/15">
            <div className="text-xs text-ink-secondary">
              {currentShop.description || 'Welcome to our humble establishment.'}
            </div>
            <span className="text-xs px-2 py-0.5 rounded font-semibold bg-brand/10 text-brand-ink">
              {currentShop.type}
            </span>
          </div>

          {/* Nav Tabs */}
          <div className="flex border-b border-ink-muted/20 gap-2">
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'browse'
                  ? 'border-brand text-brand-ink font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
              onClick={() => setActiveTab('browse')}
            >
              <Store className="w-4 h-4" />
              Browse
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'cart'
                  ? 'border-brand text-brand-ink font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
              onClick={() => setActiveTab('cart')}
            >
              <ShoppingCart className="w-4 h-4" />
              Cart ({cart.size})
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'sell'
                  ? 'border-brand text-brand-ink font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
              onClick={() => setActiveTab('sell')}
            >
              <ArrowRightLeft className="w-4 h-4" />
              Sell Items
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-brand text-brand-ink font-semibold'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
              onClick={() => setActiveTab('history')}
            >
              <History className="w-4 h-4" />
              History ({transactions.length})
            </button>
          </div>

          {/* Tab 1: Browse */}
          {activeTab === 'browse' && (
            <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
              {/* Filter Column */}
              <div className="w-full md:w-56 shrink-0 space-y-3 bg-surface/30 p-3 rounded-lg border border-ink-muted/15 h-fit">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-ink-muted" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search goods..."
                    className="pl-8 text-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-ink-secondary block mb-1">
                    Category
                  </label>
                  <Select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="text-xs"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-ink-secondary block mb-1">
                    Max Price (GP)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={priceRange[1]}
                    onChange={(e) => setPriceRange([priceRange[0], parseFloat(e.target.value) || 10000])}
                    className="text-xs"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={showOnlyAffordable}
                    onChange={(e) => setShowOnlyAffordable(e.target.checked)}
                    className="rounded text-brand-ink"
                  />
                  Affordable Only
                </label>
              </div>

              {/* Items Grid */}
              <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                {filteredItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-ink-muted border border-dashed border-ink-muted/20 rounded-lg">
                    No items match the current filters.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredItems.map((item) => {
                      const price = (item.priceOverride || item.itemData?.price || { gp: 0 }) as Currency;
                      const displayPrice = multiplyPrice(price, currentShop.buyModifier || 1);
                      const inStock = item.stock === -1 || item.currentStock > 0;
                      const inCart = cart.get(item.id);
                      const maxQty = item.stock === -1 ? 999 : item.currentStock;
                      const availableQty = maxQty - (inCart?.quantity || 0);

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-lg border transition-all flex flex-col justify-between ${
                            inCart
                              ? 'border-brand bg-brand/5 shadow-xs'
                              : 'border-ink-muted/20 bg-surface/40 hover:bg-surface/80'
                          } ${!inStock ? 'opacity-50' : ''}`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-1 mb-1">
                              <span className="font-semibold text-sm text-ink truncate">
                                {item.itemName}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                                  inStock ? 'bg-success/10 text-success-ink' : 'bg-danger/10 text-danger-ink'
                                }`}
                              >
                                {item.stock === -1 ? '∞' : `${item.currentStock}`}
                              </span>
                            </div>

                            <div className="text-[11px] text-ink-secondary mb-2">
                              {item.category || 'General'}
                            </div>

                            {item.itemData?.description && (
                              <p className="text-xs text-ink-muted line-clamp-2 mb-3">
                                {item.itemData.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-ink-muted/10 mt-2">
                            <span className="font-mono text-xs font-semibold text-ink">
                              {formatCurrency(displayPrice)}
                            </span>

                            {inCart ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromCart(item.id)}
                                  className="w-6 h-6 flex items-center justify-center rounded bg-surface border border-ink-muted/20 hover:bg-surface-hover"
                                >
                                  <Minus className="w-3 h-3 text-ink" />
                                </button>
                                <span className="font-mono text-xs font-semibold text-ink w-4 text-center">
                                  {inCart.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAddToCart(item)}
                                  disabled={availableQty <= 0}
                                  className="w-6 h-6 flex items-center justify-center rounded bg-surface border border-ink-muted/20 hover:bg-surface-hover disabled:opacity-40"
                                >
                                  <Plus className="w-3 h-3 text-ink" />
                                </button>
                              </div>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={ShoppingCart}
                                disabled={!inStock}
                                onClick={() => handleAddToCart(item)}
                              >
                                Buy
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Cart */}
          {activeTab === 'cart' && (
            <div className="flex flex-col flex-1 min-h-0 space-y-4">
              {cart.size === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-ink-muted border border-dashed border-ink-muted/20 rounded-lg">
                  <ShoppingCart className="w-12 h-12 mb-2 opacity-30" />
                  <p className="text-sm">Your shopping cart is empty.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    icon={ArrowLeft}
                    onClick={() => setActiveTab('browse')}
                  >
                    Back to browsing
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto border border-ink-muted/20 rounded-lg">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-surface/80 border-b border-ink-muted/20 text-ink-secondary sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3">Item</th>
                          <th className="py-2.5 px-3 text-right">Unit Price</th>
                          <th className="py-2.5 px-3 text-center">Quantity</th>
                          <th className="py-2.5 px-3 text-right">Subtotal</th>
                          <th className="py-2.5 px-3 text-center">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-muted/10">
                        {Array.from(cart.values()).map(({ item, quantity }) => {
                          const price = (item.priceOverride || item.itemData?.price || { gp: 0 }) as Currency;
                          const unitPrice = multiplyPrice(price, currentShop.buyModifier || 1);
                          const total = multiplyPrice(unitPrice, quantity);
                          const maxQty = item.stock === -1 ? 999 : item.currentStock;

                          return (
                            <tr key={item.id} className="hover:bg-surface/50">
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-ink">{item.itemName}</div>
                                <div className="text-[11px] text-ink-secondary">{item.category}</div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                {formatCurrency(unitPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateCartQuantity(item.id, quantity - 1)}
                                    className="p-1 rounded hover:bg-surface-hover"
                                  >
                                    <Minus className="w-3 h-3 text-ink-secondary" />
                                  </button>
                                  <span className="font-mono font-semibold w-6 text-center">{quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateCartQuantity(item.id, quantity + 1)}
                                    disabled={quantity >= maxQty}
                                    className="p-1 rounded hover:bg-surface-hover disabled:opacity-30"
                                  >
                                    <Plus className="w-3 h-3 text-ink-secondary" />
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-ink">
                                {formatCurrency(total)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setItemToRemoveFromCart(item.id)}
                                  className="text-danger-ink hover:opacity-80 p-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {buyError && (
                    <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger-ink flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{buyError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 bg-surface/60 border border-ink-muted/20 rounded-lg">
                    <div>
                      <span className="text-xs text-ink-secondary mr-2">Cart Total:</span>
                      <span className="font-mono text-base font-bold text-ink">
                        {formatCurrency(cartTotal)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setActiveTab('browse')}>
                        Continue Shopping
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Check}
                        disabled={!canAffordCart}
                        onClick={handleBuy}
                      >
                        Complete Purchase
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 3: Sell Items */}
          {activeTab === 'sell' && (
            <div className="flex flex-col flex-1 min-h-0 space-y-4">
              <div className="flex items-center justify-between text-xs text-ink-secondary">
                <span>Select items from your inventory to sell to {currentShop.name}.</span>
                <span className="font-semibold text-brand-ink">
                  Payout: {Math.round((currentShop.sellModifier || 0.5) * 100)}% of base value
                </span>
              </div>

              {/* Sell Basket */}
              {sellItemsList.size > 0 && (
                <div className="border border-ink-muted/20 rounded-lg overflow-y-auto max-h-48">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface/80 border-b border-ink-muted/20 text-ink-secondary sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Item to Sell</th>
                        <th className="py-2 px-3 text-right">Offer Price</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                        <th className="py-2 px-3 text-center">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-muted/10">
                      {Array.from(sellItemsList.values()).map(({ item, quantity }) => {
                        const price = (item.price || item.value || { gp: 0 }) as Currency;
                        const unitOffer = multiplyPrice(price, currentShop.sellModifier || 0.5);
                        const offerTotal = multiplyPrice(unitOffer, quantity);

                        return (
                          <tr key={item.id} className="hover:bg-surface/50">
                            <td className="py-2 px-3 font-semibold text-ink">{item.name}</td>
                            <td className="py-2 px-3 text-right font-mono">{formatCurrency(unitOffer)}</td>
                            <td className="py-2 px-3 text-center font-mono font-semibold">{quantity}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-success-ink">
                              {formatCurrency(offerTotal)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => setItemToRemoveFromSell(item.id)}
                                className="text-danger-ink hover:opacity-80 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Inventory Roster to Sell From */}
              <div className="flex-1 overflow-y-auto border border-ink-muted/20 rounded-lg p-3">
                <h5 className="text-xs font-semibold text-ink mb-2">Available in Inventory:</h5>
                {!inventory || inventory.length === 0 ? (
                  <p className="text-xs text-ink-muted italic">Your inventory is empty.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {inventory.map((invItem) => {
                      const price = (invItem.price || invItem.value || { gp: 0 }) as Currency;
                      const offer = multiplyPrice(price, currentShop.sellModifier || 0.5);
                      const inSell = sellItemsList.get(invItem.id);

                      return (
                        <div
                          key={invItem.id}
                          className="p-2.5 rounded border border-ink-muted/15 bg-surface/30 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-medium text-xs text-ink truncate">{invItem.name}</div>
                            <div className="text-[10px] text-ink-muted font-mono">
                              Offer: {formatCurrency(offer)} (owned: {invItem.quantity || 1})
                            </div>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Plus}
                            onClick={() => handleAddToSell(invItem)}
                            disabled={(inSell?.quantity || 0) >= (invItem.quantity || 1)}
                          >
                            Add
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {sellError && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger-ink">
                  {sellError}
                </div>
              )}

              {sellItemsList.size > 0 && (
                <div className="flex items-center justify-between p-3 bg-surface/60 border border-ink-muted/20 rounded-lg">
                  <div>
                    <span className="text-xs text-ink-secondary mr-2">Total Payout:</span>
                    <span className="font-mono text-base font-bold text-success-ink">
                      {formatCurrency(sellTotal)}
                    </span>
                  </div>
                  <Button variant="primary" size="sm" icon={Coins} onClick={handleSell}>
                    Confirm Sale
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: History */}
          {activeTab === 'history' && (
            <div className="flex-1 overflow-y-auto border border-ink-muted/20 rounded-lg">
              {loadingTransactions ? (
                <div className="p-8 text-center text-xs text-ink-muted">Loading history...</div>
              ) : transactions.length === 0 ? (
                <div className="p-8 text-center text-xs text-ink-muted">No transactions recorded yet.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface/80 border-b border-ink-muted/20 text-ink-secondary sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Items</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3 text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-muted/10">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-surface/50">
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              tx.type === 'BUY'
                                ? 'bg-brand/10 text-brand-ink'
                                : 'bg-success/10 text-success-ink'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-ink-secondary">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-ink">
                          {(tx.items as Array<{ itemName: string; qty: number }>).map((i, idx) => (
                            <span key={idx} className="mr-2 inline-block">
                              {i.itemName} ×{i.qty}
                            </span>
                          ))}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-ink">
                          {formatCurrency(tx.currency as Currency)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setShowReceipt(tx)}
                            className="text-brand-ink hover:underline inline-flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Printable Receipt Modal */}
      {showReceipt && (
        <Modal
          open={true}
          onClose={() => setShowReceipt(null)}
          title="Transaction Receipt"
          icon={FileText}
          size="sm"
          footer={
            <div className="flex justify-between w-full">
              <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
                Print
              </Button>
              <Button variant="primary" onClick={() => setShowReceipt(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="font-mono text-xs space-y-3 p-2 bg-surface/30 rounded border border-ink-muted/15">
            <div className="text-center pb-2 border-b border-dashed border-ink-muted/30">
              <div className="font-bold text-sm text-ink">{currentShop.name}</div>
              <div className="text-ink-secondary">
                {showReceipt.type === 'BUY' ? 'Purchase Order' : 'Sell Voucher'}
              </div>
              <div className="text-[10px] text-ink-muted">
                {new Date(showReceipt.createdAt).toLocaleString()}
              </div>
            </div>

            <div className="space-y-1.5 py-1 border-b border-dashed border-ink-muted/30">
              {(showReceipt.items as Array<{ itemName: string; qty: number; totalPrice: Currency }>).map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>
                    {it.itemName} ×{it.qty}
                  </span>
                  <span>{formatCurrency(it.totalPrice)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between font-bold text-sm pt-1">
              <span>TOTAL</span>
              <span>{formatCurrency(showReceipt.currency as Currency)}</span>
            </div>
          </div>
        </Modal>
      )}

      {/* Remove Item from Cart Confirmation */}
      {itemToRemoveFromCart && (
        <ConfirmDialog
          open={true}
          title="Remove from Cart"
          message="Remove this item from your cart?"
          confirmLabel="Remove"
          onConfirm={() => {
            handleRemoveFromCart(itemToRemoveFromCart);
            setItemToRemoveFromCart(null);
          }}
          onCancel={() => setItemToRemoveFromCart(null)}
        />
      )}

      {/* Remove Item from Sell Confirmation */}
      {itemToRemoveFromSell && (
        <ConfirmDialog
          open={true}
          title="Remove from Sale"
          message="Remove this item from the sale offer?"
          confirmLabel="Remove"
          onConfirm={() => {
            handleRemoveFromSell(itemToRemoveFromSell);
            setItemToRemoveFromSell(null);
          }}
          onCancel={() => setItemToRemoveFromSell(null)}
        />
      )}
    </>
  );
};

export default ShopInterface;
