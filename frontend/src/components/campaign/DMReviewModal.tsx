import React, { useState, useEffect } from 'react';
import { Check, XCircle, AlertTriangle, Heart, Target, Minus, Plus, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '@/components/ui/Modal';
import type { ApplyResult } from '@/types';

export interface AttackRollReviewItem {
  expression?: string;
  result?: number;
  vsAC?: number;
  breakdown?: {
    rolls?: { sides?: number; results?: number[] }[];
  };
}

export interface SaveRollReviewItem {
  expression?: string;
  result?: number;
  vsDC?: number;
  success?: boolean;
}

export interface DamageRollReviewItem {
  targetId?: string;
  result?: number;
  applied?: boolean;
}

export interface ConditionReviewItem {
  targetId?: string;
  name: string;
  duration?: string;
  saveEnds?: boolean;
  saveDC?: number;
}

export interface TargetTokenReviewItem {
  id: string;
  name: string;
  hp: { current: number; max: number; temp: number };
}

interface DMReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (modifications?: DMModifications) => void;
  onCancel: () => void;
  resolutionData: {
    resolutionId: string;
    initiatorName: string;
    actionName: string;
    attackRolls?: AttackRollReviewItem[];
    saveRolls?: SaveRollReviewItem[];
    damageRolls?: DamageRollReviewItem[];
    conditions?: ConditionReviewItem[];
    targetTokens: TargetTokenReviewItem[];
  };
  applyResult?: ApplyResult;
}

interface DMModifications {
  damage?: Record<string, number>;
  conditions?: ConditionReviewItem[];
  hp?: Record<string, number>;
}

export default function DMReviewModal({ 
  isOpen, 
  onClose, 
  onApply, 
  onCancel, 
  resolutionData, 
  applyResult: _applyResult,
}: DMReviewModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'damage' | 'conditions' | 'hp'>('overview');
  const [modifications, setModifications] = useState<DMModifications>({});
  const [dmNotes, setDmNotes] = useState('');

  const { attackRolls, saveRolls, damageRolls, conditions, targetTokens } = resolutionData;

  // Initialize modifications from damage rolls
  useEffect(() => {
    if (damageRolls && damageRolls.length > 0) {
      const initialDamage: Record<string, number> = {};
      for (const roll of damageRolls) {
        if (roll.applied !== false && roll.result !== undefined && roll.targetId) {
          initialDamage[roll.targetId] = roll.result;
        }
      }
      setModifications(prev => ({ ...prev, damage: initialDamage }));
    }
  }, [damageRolls]);

  const handleDamageChange = (targetId: string, value: number) => {
    setModifications(prev => ({
      ...prev,
      damage: { ...prev.damage, [targetId]: Math.max(0, value) },
    }));
  };

  const handleHpChange = (targetId: string, value: number, maxHp: number) => {
    setModifications(prev => ({
      ...prev,
      hp: { ...prev.hp, [targetId]: Math.min(maxHp, Math.max(0, value)) },
    }));
  };

  const toggleCondition = (targetId: string, condition: ConditionReviewItem) => {
    setModifications(prev => {
      const curConditions = prev.conditions || [];
      const exists = curConditions.find((c) => c.targetId === targetId && c.name === condition.name);
      
      if (exists) {
        return { ...prev, conditions: curConditions.filter((c) => c !== exists) };
      } else {
        return { ...prev, conditions: [...curConditions, { ...condition, targetId }] };
      }
    });
  };

  const hasCondition = (targetId: string, conditionName: string) => {
    return modifications.conditions?.some((c) => c.targetId === targetId && c.name === conditionName) || false;
  };

  const getTotalDamage = () => {
    return Object.values(modifications.damage || {}).reduce((sum, dmg) => sum + dmg, 0);
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="DM Review"
      size="lg"
      icon={AlertTriangle}
      footer={
        <div className="flex gap-2 w-full">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-md border border-danger/30 bg-danger/10 text-danger-ink font-semibold text-sm hover:bg-danger/20 transition-colors"
          >
            <XCircle className="w-4 h-4 mr-1" />
            Cancel Action
          </button>
          <button
            type="button"
            onClick={() => onApply(modifications)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-success/15 hover:bg-success/25 border border-success/30 text-success-ink font-semibold text-sm shadow-xs transition-colors"
          >
            <Check className="w-4 h-4" />
            Apply {Object.keys(modifications.damage || {}).length > 0 || modifications.conditions?.length ? 'Modified' : 'Auto'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header Info */}
        <div className="bg-ink-muted/5 rounded-lg p-3 border border-ink-muted/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-brand/15 flex items-center justify-center">
              <Target className="w-5 h-5 text-brand-ink" />
            </div>
            <div>
              <p className="font-semibold text-ink">{resolutionData.initiatorName}</p>
              <p className="text-sm text-ink-secondary">{resolutionData.actionName}</p>
            </div>
            <span className="ml-auto px-2 py-1 text-xs font-medium bg-warm-amber/15 text-warm-amber-ink border border-warm-amber/30 rounded">
              DM Review Required
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-ink-muted/10" role="tablist">
          {[
            { id: 'overview', label: 'Overview', icon: <Target className="w-3.5 h-3.5" /> },
            { id: 'damage', label: 'Damage', icon: <Heart className="w-3.5 h-3.5" />, count: getTotalDamage() > 0 ? getTotalDamage() : undefined },
            { id: 'conditions', label: 'Conditions', icon: <AlertTriangle className="w-3.5 h-3.5" />, count: modifications.conditions?.length },
            { id: 'hp', label: 'HP', icon: <Heart className="w-3.5 h-3.5" /> },
          ].map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id as 'overview' | 'damage' | 'conditions' | 'hp')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-brand text-brand-text border-b-2 border-brand'
                  : 'text-ink-secondary hover:text-ink hover:bg-ink-muted/5'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count && tab.count > 0 && (
                <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                  activeTab === tab.id ? 'bg-brand-text/20' : 'bg-ink-muted/20'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <OverviewTab 
                attackRolls={attackRolls} 
                saveRolls={saveRolls} 
                damageRolls={damageRolls} 
                conditions={conditions}
                targetTokens={targetTokens}
                modifications={modifications}
              />
            </motion.div>
          )}
          {activeTab === 'damage' && (
            <motion.div key="damage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <DamageTab 
                damageRolls={damageRolls} 
                targetTokens={targetTokens}
                modifications={modifications.damage}
                onDamageChange={handleDamageChange}
              />
            </motion.div>
          )}
          {activeTab === 'conditions' && (
            <motion.div key="conditions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <ConditionsTab 
                conditions={conditions} 
                targetTokens={targetTokens}
                modifications={modifications.conditions}
                onToggleCondition={toggleCondition}
                hasCondition={hasCondition}
              />
            </motion.div>
          )}
          {activeTab === 'hp' && (
            <motion.div key="hp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <HpTab 
                targetTokens={targetTokens}
                modifications={modifications}
                onHpChange={handleHpChange}
                onDamageChange={handleDamageChange}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* DM Notes */}
        <div className="border-t border-ink-muted/10 pt-3">
          <label className="block text-xs font-medium text-ink-secondary mb-1">DM Notes (logged in resolution)</label>
          <textarea
            value={dmNotes}
            onChange={e => setDmNotes(e.target.value)}
            placeholder="Optional notes about this resolution..."
            rows={3}
            className="input-cozy w-full text-sm resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}

// Overview Tab
interface OverviewTabProps {
  attackRolls?: AttackRollReviewItem[];
  saveRolls?: SaveRollReviewItem[];
  damageRolls?: DamageRollReviewItem[];
  conditions?: ConditionReviewItem[];
  targetTokens: TargetTokenReviewItem[];
  modifications: DMModifications;
}

function OverviewTab({ 
  attackRolls, 
  saveRolls, 
  damageRolls, 
  conditions, 
  targetTokens,
  modifications 
}: OverviewTabProps) {
  const totalDamage = damageRolls?.reduce((sum: number, r) => sum + (r.result || 0), 0) || 0;

  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard label="Total Damage" value={totalDamage} icon={<Heart className="w-4 h-4" />} color="danger" />
        <SummaryCard label="Targets" value={targetTokens.length} icon={<Target className="w-4 h-4" />} color="info" />
        <SummaryCard label="Conditions" value={conditions?.length || 0} icon={<AlertTriangle className="w-4 h-4" />} color="warning" />
      </div>

      {/* Attack Rolls */}
      {attackRolls && attackRolls.length > 0 && (
        <div className="bg-paper/50 rounded-lg p-3 border border-ink-muted/10">
          <h4 className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5">
            <Target className="w-4 h-4 text-danger-ink" />
            Attack Rolls
          </h4>
          <div className="space-y-1 text-sm">
            {attackRolls.map((roll, i: number) => {
              const rollRes = roll.result ?? 0;
              const isCrit = roll.breakdown?.rolls?.some((d) => d.sides === 20 && d.results?.includes(20));
              const isFumble = roll.breakdown?.rolls?.some((d) => d.sides === 20 && d.results?.includes(1));
              return (
                <div key={i} className="flex items-center justify-between font-mono p-2 bg-ink-muted/5 rounded">
                  <span className="text-ink-secondary">{roll.expression}</span>
                  <span className={`font-bold ${rollRes >= (roll.vsAC || 99) ? 'text-success-ink' : rollRes === 1 ? 'text-danger-ink' : rollRes === 20 ? 'text-success-ink' : 'text-ink'}`}>
                    = {rollRes} {roll.vsAC ? `vs AC ${roll.vsAC}` : ''}
                  </span>
                  {isCrit && (
                    <span className="text-success-ink text-xs font-bold">CRIT!</span>
                  )}
                  {isFumble && (
                    <span className="text-danger-ink text-xs font-bold">FUMBLE!</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save Rolls */}
      {saveRolls && saveRolls.length > 0 && (
        <div className="bg-paper/50 rounded-lg p-3 border border-ink-muted/10">
          <h4 className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-spirit-ink" />
            Saving Throws
          </h4>
          <div className="space-y-1 text-sm">
            {saveRolls.map((roll, i: number) => (
              <div key={i} className="flex items-center justify-between font-mono p-2 bg-ink-muted/5 rounded">
                <span className="text-ink-secondary">{roll.expression} vs DC {roll.vsDC}</span>
                <span className={`font-bold ${roll.success ? 'text-success-ink' : 'text-danger-ink'}`}>
                  {roll.success ? 'SUCCESS' : 'FAILED'} ({roll.result})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Targets */}
      <div className="bg-paper/50 rounded-lg p-3 border border-ink-muted/10">
        <h4 className="text-sm font-semibold text-ink mb-2">Targets</h4>
        <div className="space-y-1">
          {targetTokens.map((token) => {
            const dmg = modifications.damage?.[token.id] || 0;
            const newHp = Math.max(0, (token.hp.current + token.hp.temp) - dmg);
            return (
              <div key={token.id} className="flex items-center justify-between p-2 bg-ink-muted/5 rounded">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-ink">{token.name}</span>
                  <span className="text-xs text-ink-muted">HP: {token.hp.current}/{token.hp.max}</span>
                  {token.hp.temp > 0 && <span className="text-xs text-info-ink">+{token.hp.temp} temp</span>}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {dmg > 0 && (
                    <span className="text-danger-ink font-mono">−{dmg}</span>
                  )}
                  <span className={`font-mono ${newHp <= 0 ? 'text-danger-ink' : newHp <= token.hp.max / 2 ? 'text-warning-ink' : 'text-success-ink'}`}>
                    → {newHp} HP
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Damage Tab
interface DamageTabProps {
  damageRolls?: DamageRollReviewItem[];
  targetTokens: TargetTokenReviewItem[];
  modifications?: Record<string, number>;
  onDamageChange: (targetId: string, value: number) => void;
}

function DamageTab({ 
  damageRolls, 
  targetTokens,
  modifications,
  onDamageChange 
}: DamageTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-secondary">
        Adjust damage per target. Set to 0 to negate damage entirely.
      </p>
      
      {targetTokens.map((token) => {
        const currentDamage = modifications?.[token.id] || 0;
        const roll = damageRolls?.find((r) => r.targetId === token.id);
        const originalDamage = roll?.result || 0;
        
        return (
          <div key={token.id} className="bg-paper/50 rounded-lg p-3 border border-ink-muted/10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{token.name}</span>
                <span className="text-xs text-ink-muted">HP: {token.hp.current}/{token.hp.max}</span>
              </div>
              <span className="text-sm text-ink-secondary">Original: {originalDamage}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onDamageChange(token.id, Math.max(0, currentDamage - 1))}
                  className="p-1.5 rounded bg-ink-muted/10 hover:bg-ink-muted/20 text-ink-secondary hover:text-ink"
                  aria-label="Decrease damage"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-mono text-lg text-ink w-16 text-center">{currentDamage}</span>
                <button
                  onClick={() => onDamageChange(token.id, currentDamage + 1)}
                  className="p-1.5 rounded bg-ink-muted/10 hover:bg-ink-muted/20 text-ink-secondary hover:text-ink"
                  aria-label="Increase damage"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex-1 h-2 bg-ink-muted/10 rounded overflow-hidden ml-4">
                <div 
                  className="h-full bg-danger transition-all" 
                  style={{ width: `${Math.min(100, (currentDamage / (token.hp.current + token.hp.temp)) * 100)}%` }}
                />
              </div>
              
              <span className="text-xs text-ink-muted w-20 text-right">
                → {Math.max(0, token.hp.current + token.hp.temp - currentDamage)} HP
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Conditions Tab
interface ConditionsTabProps {
  conditions?: ConditionReviewItem[];
  targetTokens: TargetTokenReviewItem[];
  modifications?: ConditionReviewItem[];
  onToggleCondition: (targetId: string, condition: ConditionReviewItem) => void;
  hasCondition: (targetId: string, conditionName: string) => boolean;
}

function ConditionsTab({ 
  conditions, 
  targetTokens,
  onToggleCondition,
  hasCondition
}: ConditionsTabProps) {
  const allConditions = conditions || [];
  
  if (allConditions.length === 0) {
    return (
      <div className="text-center py-8 text-ink-secondary">
        <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-ink-muted/30" />
        <p>No conditions to apply</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-secondary">
        Toggle conditions to apply. Click a condition to add/remove it from a target.
      </p>
      
      {targetTokens.map((token) => (
        <div key={token.id} className="bg-paper/50 rounded-lg p-3 border border-ink-muted/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-ink">{token.name}</span>
            <span className="text-xs text-ink-muted">HP: {token.hp.current}/{token.hp.max}</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {allConditions.map((condition) => {
              const applied = hasCondition(token.id, condition.name);
              return (
                <button
                  key={`${token.id}-${condition.name}`}
                  onClick={() => onToggleCondition(token.id, condition)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                    applied
                      ? 'bg-warning text-warning-text border border-warning/30'
                      : 'bg-ink-muted/10 text-ink-secondary hover:bg-ink-muted/20 border border-ink-muted/20'
                  }`}
                >
                  {applied && <Check className="w-3.5 h-3.5" />}
                  <span>{condition.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/10">
                    {condition.duration}
                  </span>
                  {condition.saveEnds && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/10">
                      DC {condition.saveDC} ends
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// HP Tab
interface HpTabProps {
  targetTokens: TargetTokenReviewItem[];
  modifications: DMModifications;
  onHpChange: (targetId: string, value: number, maxHp: number) => void;
  onDamageChange?: (targetId: string, value: number) => void;
}

function HpTab({ 
  targetTokens, 
  modifications, 
  onHpChange 
}: HpTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-secondary">
        Directly set target HP. Damage modifications will be calculated automatically.
      </p>
      
      {targetTokens.map((token) => {
        const maxHp = token.hp.max;
        const currentEffectiveHp = token.hp.current + token.hp.temp;
        const customHp = modifications.hp?.[token.id];
        const displayHp = customHp !== undefined ? customHp : currentEffectiveHp;
        const damageDealt = currentEffectiveHp - displayHp;
        
        return (
          <div key={token.id} className="bg-paper/50 rounded-lg p-3 border border-ink-muted/10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{token.name}</span>
                <span className="text-xs text-ink-muted">Max HP: {maxHp}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onHpChange(token.id, Math.max(0, displayHp - 1), maxHp)}
                  className="p-1.5 rounded bg-ink-muted/10 hover:bg-ink-muted/20 text-ink-secondary hover:text-ink"
                  aria-label="Decrease HP"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  value={displayHp}
                  onChange={e => onHpChange(token.id, parseInt(e.target.value) || 0, maxHp)}
                  min={0}
                  max={maxHp}
                  className="input-cozy w-20 text-center font-mono text-lg text-ink"
                />
                <button
                  onClick={() => onHpChange(token.id, Math.min(maxHp, displayHp + 1), maxHp)}
                  className="p-1.5 rounded bg-ink-muted/10 hover:bg-ink-muted/20 text-ink-secondary hover:text-ink"
                  aria-label="Increase HP"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex-1 h-2 bg-ink-muted/10 rounded overflow-hidden ml-4">
                <div 
                  className="h-full transition-all"
                  style={{ 
                    width: `${Math.min(100, (displayHp / maxHp) * 100)}%`,
                    backgroundColor: displayHp <= 0 ? '#ef4444' : displayHp <= maxHp / 4 ? '#f97316' : displayHp <= maxHp / 2 ? '#eab308' : '#22c55e'
                  }}
                />
              </div>
              
              <span className="text-xs text-ink-muted w-24 text-right">
                {damageDealt > 0 ? `−${damageDealt}` : damageDealt < 0 ? `+${-damageDealt}` : 'no change'}
              </span>
            </div>
            
            {damageDealt > 0 && (
              <p className="text-xs text-danger-ink mt-1">Damage will be recorded as ${damageDealt}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: 'danger' | 'info' | 'warning' }) {
  const colors = {
    danger: 'bg-danger/10 text-danger-ink border-danger/20',
    info: 'bg-info/10 text-info-ink border-info/20',
    warning: 'bg-warning/10 text-warning-ink border-warning/20',
  };
  
  return (
    <div className={`rounded-lg p-3 text-center border ${colors[color]}`}>
      <div className="flex items-center justify-center gap-1 mb-1">
        <span className={color === 'danger' ? 'text-danger-ink' : color === 'info' ? 'text-info-ink' : 'text-warning-ink'}>
          {icon}
        </span>
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}
