import React, { useState, useMemo } from 'react';
import { Sparkles, Plus, Search, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { SRD_SPELLS, type CompendiumSpell } from '@/data/compendium/spells';

export interface CompendiumSpellPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSpell: (spell: CompendiumSpell) => void;
  onAddCantrip: (cantripName: string) => void;
}

export const CompendiumSpellPickerModal: React.FC<CompendiumSpellPickerModalProps> = ({
  isOpen,
  onClose,
  onAddSpell,
  onAddCantrip,
}) => {
  if (!isOpen) return null;

  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'cantrip' | '1' | '2' | '3' | '4' | '5'>('all');

  const filteredSpells = useMemo(() => {
    return SRD_SPELLS.filter((spell) => {
      const matchSearch =
        spell.name.toLowerCase().includes(search.toLowerCase()) ||
        spell.school.toLowerCase().includes(search.toLowerCase()) ||
        spell.description.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (levelFilter === 'cantrip') return spell.level === 0;
      if (levelFilter !== 'all') return spell.level === parseInt(levelFilter, 10);
      return true;
    });
  }, [search, levelFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-surface text-ink border border-edge rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4 animate-scale-in flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-edge pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-brand" />
            <div>
              <h3 className="font-bold text-base">SRD Spell &amp; Cantrip Compendium</h3>
              <p className="text-xs text-ink-muted">1-click add official SRD cantrips and leveled spells to your sheet.</p>
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

        {/* Search and Level Filters */}
        <div className="space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search spells, damage types, schools..."
              className="w-full pl-9 pr-3 py-2 bg-surface-light border border-edge rounded-xl text-xs select-text focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto text-xs font-medium pb-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'cantrip', label: 'Cantrips (Lv 0)' },
              { id: '1', label: '1st Level' },
              { id: '2', label: '2nd Level' },
              { id: '3', label: '3rd Level' },
              { id: '4', label: '4th Level' },
              { id: '5', label: '5th Level' },
            ].map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                onClick={() => setLevelFilter(lvl.id as any)}
                className={`px-3 py-1 rounded-lg capitalize whitespace-nowrap transition-colors ${
                  levelFilter === lvl.id ? 'bg-brand text-white shadow-xs' : 'bg-surface-light text-ink-secondary hover:text-ink'
                }`}
              >
                {lvl.label}
              </button>
            ))}
          </div>
        </div>

        {/* List of spells */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filteredSpells.length === 0 ? (
            <p className="p-6 text-center text-xs text-ink-muted">No spells match &ldquo;{search}&rdquo;</p>
          ) : (
            filteredSpells.map((spell) => (
              <div
                key={spell.id}
                className="p-3 bg-surface-light border border-edge rounded-xl flex items-center justify-between gap-3 text-xs hover:border-brand/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm text-ink">{spell.name}</span>
                    <span className="px-1.5 py-0.2 rounded bg-ink/10 text-[10px] text-ink-muted font-medium">
                      {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} &bull; {spell.school}
                    </span>
                    {spell.damageDice && (
                      <span className="px-1.5 py-0.2 rounded bg-brand/15 text-[10px] text-brand font-medium">
                        {spell.damageDice} {spell.damageType}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-muted line-clamp-2">{spell.description}</p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-secondary font-mono">
                    <span>{spell.castingTime}</span>
                    <span>{spell.rangeFeet} ft</span>
                    <span>{spell.duration}</span>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => {
                    if (spell.level === 0) {
                      onAddCantrip(spell.name);
                    } else {
                      onAddSpell(spell);
                    }
                    onClose();
                  }}
                  className="shrink-0 text-xs py-1 px-3"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add {spell.level === 0 ? 'Cantrip' : 'Spell'}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
