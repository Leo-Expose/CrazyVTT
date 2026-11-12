import React, { useState } from 'react';
import { BookOpen, Plus, Trash2, Check, Download, Upload, AlertCircle } from 'lucide-react';
import { RulesetPackSchema, type RulesetPack, RulesetRegistry } from '@/data/rulesets';
import Button from '@/components/ui/Button';

export interface CustomRulesetEditorProps {
  initialPack?: RulesetPack;
  onSave?: (pack: RulesetPack) => void;
  onCancel?: () => void;
}

export const CustomRulesetEditor: React.FC<CustomRulesetEditorProps> = ({
  initialPack,
  onSave,
  onCancel,
}) => {
  const [pack, setPack] = useState<RulesetPack>(
    initialPack || {
      id: `custom-${Date.now()}`,
      version: '1.0.0',
      name: 'My Custom Ruleset',
      description: 'Homebrew campaign ruleset module',
      system: 'CUSTOM',
      attribution: {
        source: 'Homebrew',
        publisher: 'Table DM',
        license: 'Custom',
      },
      measurements: {
        gridType: 'square',
        gridDistance: 5,
        gridUnit: 'ft',
        diagonalRule: 'dnd5e_standard',
        defaultMovement: 30,
      },
      fields: [],
      conditions: [],
      actions: [],
      races: [],
      classes: [],
      automation: {
        deathSavesEnabled: true,
        deathSaveSuccessThreshold: 3,
        deathSaveFailureThreshold: 3,
        criticalHitRule: 'double_dice',
        encumbranceRule: 'standard_5e',
        shortRestRecoveryFormula: 'hit_dice',
        longRestFullHeal: true,
      },
    },
  );

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'meta' | 'measurements' | 'actions' | 'conditions' | 'automation'>('meta');

  // Condition draft state
  const [newCondName, setNewCondName] = useState('');
  const [newCondDesc, setNewCondDesc] = useState('');

  // Action draft state
  const [newActionName, setNewActionName] = useState('');
  const [newActionDesc, setNewActionDesc] = useState('');
  const [newActionType, setNewActionType] = useState<RulesetPack['actions'][0]['actionType']>('ATTACK_MELEE');
  const [newActionCost, setNewActionCost] = useState<RulesetPack['actions'][0]['cost']>('ACTION');

  const handleSave = () => {
    const validated = RulesetPackSchema.safeParse(pack);
    if (!validated.success) {
      setError(validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '));
      return;
    }
    RulesetRegistry.registerCustomPack(validated.data);
    setError(null);
    onSave?.(validated.data);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pack.id || 'ruleset-pack'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const result = RulesetPackSchema.safeParse(parsed);
        if (result.success) {
          setPack(result.data);
          setError(null);
        } else {
          setError('Invalid ruleset pack JSON schema.');
        }
      } catch {
        setError('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-surface text-ink p-6 rounded-2xl border border-edge shadow-xl max-w-3xl w-full mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-brand" />
          <div>
            <h2 className="text-lg font-bold">Custom Ruleset Editor</h2>
            <p className="text-xs text-ink-muted">Modular ruleset pack builder (PRD §9.1-9.3)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-edge bg-surface-light hover:bg-surface-elevated">
            <Upload className="w-3.5 h-3.5" />
            Import JSON
            <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          </label>
          <Button variant="secondary" onClick={handleExportJson} className="text-xs py-1.5 px-3">
            <Download className="w-3.5 h-3.5 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger-ink">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-edge pb-2 text-xs font-medium">
        {(['meta', 'measurements', 'actions', 'conditions', 'automation'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg capitalize transition-colors ${
              activeTab === tab ? 'bg-brand/15 text-brand font-semibold' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab: Meta */}
      {activeTab === 'meta' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Pack Identifier (ID)</label>
              <input
                type="text"
                value={pack.id}
                onChange={(e) => setPack({ ...pack, id: e.target.value })}
                className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Version</label>
              <input
                type="text"
                value={pack.version}
                onChange={(e) => setPack({ ...pack, version: e.target.value })}
                className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Pack Name</label>
            <input
              type="text"
              value={pack.name}
              onChange={(e) => setPack({ ...pack, name: e.target.value })}
              className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Description</label>
            <textarea
              value={pack.description}
              onChange={(e) => setPack({ ...pack, description: e.target.value })}
              rows={2}
              className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="pt-2 border-t border-edge">
            <h4 className="text-xs font-semibold text-ink-muted mb-2">Attribution / Source Metadata</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-ink-muted mb-1">Source</label>
                <input
                  type="text"
                  value={pack.attribution.source}
                  onChange={(e) => setPack({ ...pack, attribution: { ...pack.attribution, source: e.target.value } })}
                  className="w-full bg-surface-light border border-edge rounded px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-muted mb-1">Publisher</label>
                <input
                  type="text"
                  value={pack.attribution.publisher}
                  onChange={(e) => setPack({ ...pack, attribution: { ...pack.attribution, publisher: e.target.value } })}
                  className="w-full bg-surface-light border border-edge rounded px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-muted mb-1">License</label>
                <input
                  type="text"
                  value={pack.attribution.license}
                  onChange={(e) => setPack({ ...pack, attribution: { ...pack.attribution, license: e.target.value } })}
                  className="w-full bg-surface-light border border-edge rounded px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Measurements */}
      {activeTab === 'measurements' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Grid Type</label>
              <select
                value={pack.measurements.gridType}
                onChange={(e) => setPack({ ...pack, measurements: { ...pack.measurements, gridType: e.target.value as any } })}
                className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm"
              >
                <option value="square">Square</option>
                <option value="hex_pointy">Hexagonal (Pointy Top)</option>
                <option value="hex_flat">Hexagonal (Flat Top)</option>
                <option value="gridless">Gridless</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Diagonal Movement Rule</label>
              <select
                value={pack.measurements.diagonalRule}
                onChange={(e) => setPack({ ...pack, measurements: { ...pack.measurements, diagonalRule: e.target.value as any } })}
                className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm"
              >
                <option value="dnd5e_standard">5e Standard (1:1 / 5 ft)</option>
                <option value="dnd5e_alternating">5/10/5 Alternating</option>
                <option value="euclidean">Euclidean (Exact Distance)</option>
                <option value="manhattan">Manhattan</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Distance per Square</label>
              <input
                type="number"
                value={pack.measurements.gridDistance}
                onChange={(e) => setPack({ ...pack, measurements: { ...pack.measurements, gridDistance: parseFloat(e.target.value) || 5 } })}
                className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Unit of Measure</label>
              <input
                type="text"
                value={pack.measurements.gridUnit}
                onChange={(e) => setPack({ ...pack, measurements: { ...pack.measurements, gridUnit: e.target.value } })}
                className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Default Movement Speed</label>
              <input
                type="number"
                value={pack.measurements.defaultMovement}
                onChange={(e) => setPack({ ...pack, measurements: { ...pack.measurements, defaultMovement: parseFloat(e.target.value) || 30 } })}
                className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Actions */}
      {activeTab === 'actions' && (
        <div className="space-y-4">
          <div className="p-3 bg-surface-light rounded-xl border border-edge space-y-3">
            <h4 className="text-xs font-semibold">Add Action / Ability</h4>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Action Name (e.g. Cleave)"
                value={newActionName}
                onChange={(e) => setNewActionName(e.target.value)}
                className="bg-surface border border-edge rounded px-2.5 py-1.5 text-xs"
              />
              <div className="flex gap-2">
                <select
                  value={newActionType}
                  onChange={(e) => setNewActionType(e.target.value as any)}
                  className="bg-surface border border-edge rounded px-2 py-1.5 text-xs flex-1"
                >
                  <option value="ATTACK_MELEE">Melee Attack</option>
                  <option value="ATTACK_RANGED">Ranged Attack</option>
                  <option value="SPELL_ATTACK">Spell Attack</option>
                  <option value="SPELL_SAVE">Save Spell</option>
                  <option value="SPELL_AOE">AoE Spell</option>
                  <option value="FEATURE">Feature</option>
                  <option value="ITEM_USE">Item Use</option>
                  <option value="REACTION">Reaction</option>
                  <option value="MOVEMENT">Movement</option>
                  <option value="OTHER">Other</option>
                </select>
                <select
                  value={newActionCost}
                  onChange={(e) => setNewActionCost(e.target.value as any)}
                  className="bg-surface border border-edge rounded px-2 py-1.5 text-xs"
                >
                  <option value="ACTION">Action</option>
                  <option value="BONUS_ACTION">Bonus</option>
                  <option value="REACTION">Reaction</option>
                  <option value="FREE">Free</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Description of the action"
                value={newActionDesc}
                onChange={(e) => setNewActionDesc(e.target.value)}
                className="bg-surface border border-edge rounded px-2.5 py-1.5 text-xs flex-1"
              />
              <Button
                onClick={() => {
                  if (!newActionName.trim()) return;
                  setPack({
                    ...pack,
                    actions: [
                      ...pack.actions,
                      {
                        id: newActionName.toLowerCase().replace(/\s+/g, '_'),
                        name: newActionName,
                        actionType: newActionType,
                        cost: newActionCost,
                        description: newActionDesc,
                      },
                    ],
                  });
                  setNewActionName('');
                  setNewActionDesc('');
                }}
                className="text-xs py-1 px-3"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {pack.actions.map((act, i) => (
              <div key={act.id || i} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-light border border-edge text-xs">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {act.name}
                    <span className="px-1.5 py-0.2 bg-brand/15 text-brand rounded text-[10px]">{act.cost}</span>
                  </div>
                  <p className="text-ink-muted text-[11px] mt-0.5">{act.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPack({ ...pack, actions: pack.actions.filter((_, idx) => idx !== i) })}
                  className="text-danger hover:text-danger-ink p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Conditions */}
      {activeTab === 'conditions' && (
        <div className="space-y-4">
          <div className="p-3 bg-surface-light rounded-xl border border-edge space-y-3">
            <h4 className="text-xs font-semibold">Add Custom Condition</h4>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Condition Name (e.g. Silenced)"
                value={newCondName}
                onChange={(e) => setNewCondName(e.target.value)}
                className="bg-surface border border-edge rounded px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                placeholder="Description / Effects"
                value={newCondDesc}
                onChange={(e) => setNewCondDesc(e.target.value)}
                className="bg-surface border border-edge rounded px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (!newCondName.trim()) return;
                  setPack({
                    ...pack,
                    conditions: [
                      ...pack.conditions,
                      {
                        id: newCondName.toLowerCase().replace(/\s+/g, '_'),
                        name: newCondName,
                        description: newCondDesc,
                        effects: [],
                        preventsActions: false,
                        preventsReactions: false,
                        grantsAdvantageOnAttacksAgainst: false,
                        disadvantageOnAttacks: false,
                        speedMultiplier: 1,
                      },
                    ],
                  });
                  setNewCondName('');
                  setNewCondDesc('');
                }}
                className="text-xs py-1 px-3"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Condition
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {pack.conditions.map((cond, i) => (
              <div key={cond.id || i} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-light border border-edge text-xs">
                <div>
                  <div className="font-semibold">{cond.name}</div>
                  <p className="text-ink-muted text-[11px] mt-0.5">{cond.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPack({ ...pack, conditions: pack.conditions.filter((_, idx) => idx !== i) })}
                  className="text-danger hover:text-danger-ink p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Automation */}
      {activeTab === 'automation' && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={pack.automation.deathSavesEnabled}
              onChange={(e) => setPack({ ...pack, automation: { ...pack.automation, deathSavesEnabled: e.target.checked } })}
              className="rounded"
            />
            <span className="font-medium">Enable Death Saving Throws at 0 HP</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={pack.automation.longRestFullHeal}
              onChange={(e) => setPack({ ...pack, automation: { ...pack.automation, longRestFullHeal: e.target.checked } })}
              className="rounded"
            />
            <span className="font-medium">Long Rest restores 100% Hit Points</span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Critical Hit Rule</label>
              <select
                value={pack.automation.criticalHitRule}
                onChange={(e) => setPack({ ...pack, automation: { ...pack.automation, criticalHitRule: e.target.value as any } })}
                className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm"
              >
                <option value="double_dice">Double all damage dice</option>
                <option value="max_plus_roll">Max damage + roll dice</option>
                <option value="double_total">Double total damage</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Encumbrance Rule</label>
              <select
                value={pack.automation.encumbranceRule}
                onChange={(e) => setPack({ ...pack, automation: { ...pack.automation, encumbranceRule: e.target.value as any } })}
                className="w-full bg-surface-light border border-edge rounded-lg px-3 py-2 text-sm"
              >
                <option value="standard_5e">Standard (15x Strength)</option>
                <option value="variant_5e">Variant (5x / 10x / 15x)</option>
                <option value="none">Disabled / Free Inventory</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Footer controls */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-edge">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="text-xs py-2 px-4">
            Cancel
          </Button>
        )}
        <Button onClick={handleSave} className="text-xs py-2 px-4">
          <Check className="w-4 h-4 mr-1.5" />
          Save Ruleset Pack
        </Button>
      </div>
    </div>
  );
};
