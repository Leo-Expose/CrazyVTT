import React, { useState, useMemo } from 'react';
import { Package, Plus, Search, Sparkles, X, Shield, Sword } from 'lucide-react';
import Button from '@/components/ui/Button';
import { SRD_WEAPONS } from '@/data/compendium/weapons';
import { SRD_MAGIC_ITEMS } from '@/data/compendium/magicItems';
import { SRD_ADVENTURING_GEAR } from '@/data/compendium/adventuringGear';
import { DND5E_ARMORS } from '@/data/dnd5e/armorLogistics';

export interface CompendiumItemOption {
  name: string;
  category: string;
  weight: number;
  value?: number;
  notes?: string;
  equippable?: boolean;
  requiresAttunement?: boolean;
}

export interface CompendiumItemPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (item: CompendiumItemOption) => void;
}

export const CompendiumItemPickerModal: React.FC<CompendiumItemPickerModalProps> = ({
  isOpen,
  onClose,
  onAddItem,
}) => {
  if (!isOpen) return null;

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'weapons' | 'armor' | 'magic' | 'gear'>('all');

  const allItems: CompendiumItemOption[] = useMemo(() => {
    const list: CompendiumItemOption[] = [];

    // Weapons
    for (const w of SRD_WEAPONS) {
      list.push({
        name: w.name,
        category: 'Weapon',
        weight: w.weight,
        value: w.costGP,
        notes: `${w.damageDice} ${w.damageType}. ${w.properties.join(', ')} [2024 Mastery: ${w.mastery2024}]`,
        equippable: true,
      });
    }

    // Armor
    for (const a of Object.values(DND5E_ARMORS)) {
      list.push({
        name: a.name,
        category: 'Armor',
        weight: a.category === 'Heavy' ? 45 : a.category === 'Medium' ? 20 : a.category === 'Shield' ? 6 : 10,
        value: a.category === 'Heavy' ? 75 : 25,
        notes: `${a.category} armor. Base AC ${a.baseAC}${a.addDex ? ' + Dex' : ''}${a.maxDex !== undefined ? ` (max +${a.maxDex})` : ''}`,
        equippable: true,
      });
    }

    // Magic Items
    for (const m of SRD_MAGIC_ITEMS) {
      list.push({
        name: m.name,
        category: 'Magic Item',
        weight: m.weight,
        value: m.rarity === 'Legendary' ? 50000 : m.rarity === 'Very Rare' ? 10000 : m.rarity === 'Rare' ? 2000 : 250,
        notes: `${m.rarity} ${m.type}. ${m.description}`,
        equippable: m.type === 'Armor' || m.type === 'Weapon' || m.type === 'Ring' || m.type === 'Wondrous Item',
        requiresAttunement: m.requiresAttunement,
      });
    }

    // Gear & Kits
    for (const g of SRD_ADVENTURING_GEAR) {
      list.push({
        name: g.name,
        category: 'Gear',
        weight: g.weight,
        value: g.costGP,
        notes: g.description,
      });
    }

    return list;
  }, []);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.notes?.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (activeCategory === 'weapons') return item.category === 'Weapon';
      if (activeCategory === 'armor') return item.category === 'Armor';
      if (activeCategory === 'magic') return item.category === 'Magic Item';
      if (activeCategory === 'gear') return item.category === 'Gear';
      return true;
    });
  }, [allItems, search, activeCategory]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-surface text-ink border border-edge rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4 animate-scale-in flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-edge pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Package className="w-6 h-6 text-brand" />
            <div>
              <h3 className="font-bold text-base">SRD Compendium Equipment &amp; Items</h3>
              <p className="text-xs text-ink-muted">Add standard SRD weapons, armor, magic items, and gear to inventory.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-light"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Categories */}
        <div className="space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search weapons, armor, potions, items..."
              className="w-full pl-9 pr-3 py-2 bg-surface-light border border-edge rounded-xl text-xs select-text focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto text-xs font-medium pb-1">
            {(['all', 'weapons', 'armor', 'magic', 'gear'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded-lg capitalize transition-colors ${
                  activeCategory === cat ? 'bg-brand text-white shadow-xs' : 'bg-surface-light text-ink-secondary hover:text-ink'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* List of items */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filteredItems.length === 0 ? (
            <p className="p-6 text-center text-xs text-ink-muted">No items match &ldquo;{search}&rdquo;</p>
          ) : (
            filteredItems.map((item, i) => (
              <div
                key={i}
                className="p-3 bg-surface-light border border-edge rounded-xl flex items-center justify-between gap-3 text-xs hover:border-brand/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm text-ink">{item.name}</span>
                    <span className="px-1.5 py-0.2 rounded bg-ink/10 text-[10px] text-ink-muted font-medium">
                      {item.category}
                    </span>
                    {item.requiresAttunement && (
                      <span className="px-1.5 py-0.2 rounded bg-brand/15 text-[10px] text-brand font-medium">
                        Attunement
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-muted line-clamp-2">{item.notes}</p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-secondary font-mono">
                    <span>{item.weight} lb</span>
                    {item.value !== undefined && <span>{item.value} gp</span>}
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => {
                    onAddItem(item);
                    onClose();
                  }}
                  className="shrink-0 text-xs py-1 px-3"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
