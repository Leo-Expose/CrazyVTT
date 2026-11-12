/**
 * Race & Class Selection Components
 * Dropdown selectors for D&D 5e races and classes with automatic rule application
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { DND5E_RACES, DND5E_CLASSES, getRaceById, getClassById, getSubclassById, applyRaceToSheet, applyClassToSheet, applyClassLevelFeatures } from '@/data/dnd5e';
import type { DnD5eCharacterData } from '@/types/game-systems';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface RaceSelectProps {
  value: string;
  onChange: (raceId: string) => void;
  className?: string;
  disabled?: boolean;
  error?: React.ReactNode;
}

interface ClassSelectProps {
  value: string;
  onChange: (classId: string) => void;
  className?: string;
  disabled?: boolean;
  error?: React.ReactNode;
}

interface SubclassSelectProps {
  classId: string;
  value: string;
  onChange: (subclassId: string) => void;
  className?: string;
  disabled?: boolean;
}

interface RaceClassManagerProps {
  formData: DnD5eCharacterData;
  updateField: (path: string, value: unknown) => void;
  clearErrorsAt: (path: string) => void;
  fieldError: (key: string) => React.ReactNode;
}

// ============================================
// RACE SELECT COMPONENT
// ============================================

export function RaceSelect({ value, onChange, className, disabled, error }: RaceSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const allRaces = useMemo(() => DND5E_RACES.flatMap(race => [
    race,
    ...(race.subraces || []).map(sub => ({ ...sub, parentRace: race.name }))
  ]), []);

  const selectedRace = allRaces.find(r => r.id === value || r.name.toLowerCase() === value?.toLowerCase());

  const filteredRaces = useMemo(() => {
    if (!searchQuery.trim()) return DND5E_RACES;
    const q = searchQuery.toLowerCase().trim();
    return DND5E_RACES.map(race => {
      const matchRace = race.name.toLowerCase().includes(q);
      const matchingSubraces = (race.subraces || []).filter(sub => sub.name.toLowerCase().includes(q));
      if (matchRace) return race;
      if (matchingSubraces.length > 0) return { ...race, subraces: matchingSubraces };
      return null;
    }).filter(Boolean) as typeof DND5E_RACES;
  }, [searchQuery]);

  const handleSelect = (raceId: string) => {
    onChange(raceId);
    setIsOpen(false);
    setSearchQuery('');
  };

  // Close dropdown on outside click without blocking background scrolling
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-invalid={!!error}
        className={cn(
          'w-full px-3 py-2 border rounded-lg text-left focus:outline-hidden focus:ring-2 focus:ring-brand',
          disabled ? 'bg-ink/5 cursor-not-allowed opacity-50' : 'bg-white border-ink/20 hover:border-brand/30',
          error && 'border-danger focus:ring-danger'
        )}
      >
        <div className="flex items-center justify-between">
          <span className={selectedRace ? 'text-ink' : 'text-ink-muted'}>
            {selectedRace?.name || 'Select Race'}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-ink-muted transition-transform', isOpen && 'rotate-180')} />
        </div>
      </button>

      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-hidden bg-white border border-ink/20 rounded-lg shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="p-2 border-b border-ink/10 bg-surface-light">
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search races..."
              className="w-full px-3 py-1.5 border border-ink/20 rounded focus:outline-hidden focus:ring-2 focus:ring-brand text-sm"
            />
          </div>
          <div className="flex-1 overflow-y-auto max-h-60 p-1 overscroll-contain">
            {filteredRaces.length === 0 ? (
              <p className="p-3 text-xs text-ink-muted text-center">No races match &ldquo;{searchQuery}&rdquo;</p>
            ) : (
              filteredRaces.map(race => (
                <React.Fragment key={race.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(race.id);
                    }}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm rounded transition-colors',
                      value === race.id || value?.toLowerCase() === race.name.toLowerCase() ? 'bg-brand/10 text-brand font-medium' : 'text-ink hover:bg-ink/5'
                    )}
                  >
                    <div className="font-medium">{race.name}</div>
                    <div className="text-xs text-ink-muted">
                      {race.abilityScoreIncrease && Object.entries(race.abilityScoreIncrease).map(([k, v]) => `+${v} ${k}`).join(', ')}
                    </div>
                  </button>
                  {race.subraces && race.subraces.map(subrace => (
                    <button
                      key={subrace.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(subrace.id);
                      }}
                      className={cn(
                        'w-full px-3 py-2 pl-8 text-left text-sm rounded transition-colors',
                        value === subrace.id || value?.toLowerCase() === subrace.name.toLowerCase() ? 'bg-brand/10 text-brand font-medium' : 'text-ink hover:bg-ink/5'
                      )}
                    >
                      <div className="font-medium">{subrace.name}</div>
                      <div className="text-xs text-ink-muted">
                        {subrace.abilityScoreIncrease && Object.entries(subrace.abilityScoreIncrease).map(([k, v]) => `+${v} ${k}`).join(', ')}
                      </div>
                    </button>
                  ))}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      )}
      {error && <div className="mt-1 text-xs text-danger-ink" role="alert">{error}</div>}
    </div>
  );
}

// ============================================
// CLASS SELECT COMPONENT
// ============================================

export function ClassSelect({ value, onChange, className, disabled, error }: ClassSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = (classId: string) => {
    onChange(classId);
    setIsOpen(false);
    setSearchQuery('');
  };

  const filteredClasses = useMemo(() => {
    if (!searchQuery.trim()) return DND5E_CLASSES;
    const q = searchQuery.toLowerCase().trim();
    return DND5E_CLASSES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.primaryAbility.some(p => p.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  // Close dropdown on outside click without blocking background scrolling
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-invalid={!!error}
        className={cn(
          'w-full px-3 py-2 border rounded-lg text-left focus:outline-hidden focus:ring-2 focus:ring-brand',
          disabled ? 'bg-ink/5 cursor-not-allowed opacity-50' : 'bg-white border-ink/20 hover:border-brand/30',
          error && 'border-danger focus:ring-danger'
        )}
      >
        <div className="flex items-center justify-between">
          <span className={value ? 'text-ink' : 'text-ink-muted'}>
            {DND5E_CLASSES.find(c => c.id === value || c.name.toLowerCase() === value?.toLowerCase())?.name || (value ? (value.charAt(0).toUpperCase() + value.slice(1)) : 'Select Class')}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-ink-muted transition-transform', isOpen && 'rotate-180')} />
        </div>
      </button>

      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-hidden bg-white border border-ink/20 rounded-lg shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="p-2 border-b border-ink/10 bg-surface-light">
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search classes..."
              className="w-full px-3 py-1.5 border border-ink/20 rounded focus:outline-hidden focus:ring-2 focus:ring-brand text-sm"
            />
          </div>
          <div className="flex-1 overflow-y-auto max-h-60 p-1 overscroll-contain">
            {filteredClasses.length === 0 ? (
              <p className="p-3 text-xs text-ink-muted text-center">No classes match &ldquo;{searchQuery}&rdquo;</p>
            ) : (
              filteredClasses.map(cls => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(cls.id);
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm rounded transition-colors',
                    value === cls.id || value?.toLowerCase() === cls.name.toLowerCase() ? 'bg-brand/10 text-brand font-medium' : 'text-ink hover:bg-ink/5'
                  )}
                >
                  <div className="font-medium">{cls.name}</div>
                  <div className="text-xs text-ink-muted">
                    HD: {cls.hitDie} • Primary: {cls.primaryAbility.join(', ')} • {cls.armorProficiencies.join(', ')}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {error && <div className="mt-1 text-xs text-danger-ink" role="alert">{error}</div>}
    </div>
  );
}

// ============================================
// SUBCLASS SELECT COMPONENT
// ============================================

export function SubclassSelect({ classId, value, onChange, className, disabled }: SubclassSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const classData = getClassById(classId);
  const subclasses = classData?.subclasses || [];

  if (subclasses.length === 0) {
    return (
      <div className={cn('text-sm text-ink-muted italic', className)}>
        No subclasses available for this class
      </div>
    );
  }

  const handleSelect = (subclassId: string) => {
    onChange(subclassId);
    setIsOpen(false);
  };

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'w-full px-3 py-2 border rounded-lg text-left focus:outline-hidden focus:ring-2 focus:ring-brand',
          disabled ? 'bg-ink/5 cursor-not-allowed opacity-50' : 'bg-white border-ink/20 hover:border-brand/30'
        )}
      >
        <div className="flex items-center justify-between">
          <span className={value ? 'text-ink' : 'text-ink-muted'}>
            {subclasses.find(s => s.id === value)?.name || 'Select Subclass'}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-ink-muted transition-transform', isOpen && 'rotate-180')} />
        </div>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-20 mt-1 max-h-48 overflow-auto bg-white border border-ink/20 rounded-lg shadow-lg w-full">
            {subclasses.map(subclass => (
              <button
                key={subclass.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(subclass.id);
                }}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm rounded transition-colors',
                  value === subclass.id ? 'bg-brand/10 text-brand font-medium' : 'text-ink hover:bg-ink/5'
                )}
              >
                <div className="font-medium">{subclass.name}</div>
                <div className="text-xs text-ink-muted">{subclass.description}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// RACE & CLASS MANAGER (Main Integration Component)
// ============================================

export function RaceClassManager({ formData, updateField, clearErrorsAt, fieldError }: RaceClassManagerProps) {
  const [applying, setApplying] = useState(false);
  const [showRaceDetails, setShowRaceDetails] = useState<string | null>(null);
  const [showClassDetails, setShowClassDetails] = useState<string | null>(null);

  const race = formData.race;
  const classId = formData.class;
  const subclass = formData.subclass;

  const classData = classId ? getClassById(classId) : null;
  const subclassData = (classId && subclass) ? getSubclassById(classId, subclass) : null;
  const raceData = race ? getRaceById(race) : null;

  // Apply race when it changes
  const handleRaceChange = useCallback(async (raceId: string) => {
    clearErrorsAt('race');
    const raceObj = getRaceById(raceId);
    // Store human-readable properly-capitalized name (e.g., "Dragonborn", "High Elf", "Fairy")
    const storedRaceName = raceObj ? raceObj.name : (raceId.charAt(0).toUpperCase() + raceId.slice(1));
    updateField('race', storedRaceName);
    updateField('subrace', ''); // Clear subrace when race changes

    if (!raceId) return;

    setApplying(true);
    try {
      const raceData = raceObj;
      if (raceData) {
        // Apply race effects
        const updates = applyRaceToSheet(formData as DnD5eCharacterData, raceData);
        
        // Update form fields
        for (const [key, value] of Object.entries(updates)) {
          updateField(key, value);
        }
      }
    } finally {
      setApplying(false);
    }
  }, [formData, updateField, clearErrorsAt]);

  // Apply class when it changes
  const handleClassChange = useCallback(async (classId: string) => {
    clearErrorsAt('class');
    const classObj = getClassById(classId);
    // Store human-readable properly-capitalized name (e.g., "Wizard", "Fighter", "Barbarian")
    const storedClassName = classObj ? classObj.name : (classId.charAt(0).toUpperCase() + classId.slice(1));
    updateField('class', storedClassName);
    updateField('subclass', ''); // Clear subclass when class changes

    if (!classId) return;

    setApplying(true);
    try {
      const classData = classObj;
      if (classData) {
        // Apply class level 1 features
        const updates = applyClassToSheet(formData as DnD5eCharacterData, classData);
        
        // Update form fields
        for (const [key, value] of Object.entries(updates)) {
          updateField(key, value);
        }

        // Set default hit points if not set
        if (classData.hitDie && (!formData.hp || formData.hp.maximum === 0)) {
          const hitDieMap: Record<string, number> = { 'd6': 6, 'd8': 8, 'd10': 10, 'd12': 12 };
          const conMod = formData.stats?.constitution?.modifier || 0;
          const maxHP = (hitDieMap[classData.hitDie] || 8) + conMod;
          updateField('hp', { maximum: maxHP, current: maxHP, temporary: 0 });
        }
      }
    } finally {
      setApplying(false);
    }
  }, [formData, updateField, clearErrorsAt]);

  // Apply subclass when it changes
  const handleSubclassChange = useCallback(async (subclassId: string) => {
    clearErrorsAt('subclass');
    const subObj = classId ? getSubclassById(classId, subclassId) : null;
    const storedSubclassName = subObj ? subObj.name : (subclassId.charAt(0).toUpperCase() + subclassId.slice(1));
    updateField('subclass', storedSubclassName);

    if (!classId || !subclassId) return;

    setApplying(true);
    try {
      const classData = getClassById(classId);
      const subclassData = getSubclassById(classId, subclassId);
      
      if (classData && subclassData) {
        // Apply subclass features for level 1 (or the level at which subclass is chosen)
        const subclassLevel = subclassData.level || 3;
        if (subclassLevel <= (formData.level || 1)) {
          const updates = applyClassLevelFeatures(formData as DnD5eCharacterData, classData, subclassLevel, subclassData);
          
          for (const [key, value] of Object.entries(updates)) {
            updateField(key, value);
          }
        }
      }
    } finally {
      setApplying(false);
    }
  }, [formData, updateField, clearErrorsAt]);

  return (
    <div className="space-y-4">
      {/* Race Selector */}
      <div>
        <label className="block text-sm font-semibold text-ink-secondary mb-1 flex items-center gap-2">
          Race
          {raceData && (
            <button
              type="button"
              onClick={() => setShowRaceDetails(raceData.id)}
              className="text-xs text-brand hover:underline"
            >
              Details
            </button>
          )}
        </label>
        <RaceSelect
          value={race || ''}
          onChange={handleRaceChange}
          error={fieldError('race') as string}
          disabled={applying}
        />
        {applying && <div className="mt-2 flex items-center gap-2 text-sm text-brand"><Loader2 className="w-4 h-4 animate-spin" /> Applying racial traits...</div>}
      </div>

      {/* Class Selector */}
      <div>
        <label className="block text-sm font-semibold text-ink-secondary mb-1 flex items-center gap-2">
          Class
          {classData && (
            <button
              type="button"
              onClick={() => setShowClassDetails(classData.id)}
              className="text-xs text-brand hover:underline"
            >
              Details
            </button>
          )}
        </label>
        <ClassSelect
          value={classId || ''}
          onChange={handleClassChange}
          error={fieldError('class') as string}
          disabled={applying}
        />
        {applying && <div className="mt-2 flex items-center gap-2 text-sm text-brand"><Loader2 className="w-4 h-4 animate-spin" /> Applying class features...</div>}
      </div>

      {/* Subclass Selector */}
      {classData && classData.subclasses && classData.subclasses.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-ink-secondary mb-1">
            Subclass <span className="text-xs text-ink-muted">(chosen at level {classData.subclasses[0]?.level || 3})</span>
          </label>
          <SubclassSelect
            classId={classId}
            value={subclass || ''}
            onChange={handleSubclassChange}
            disabled={applying || !classId}
          />
        </div>
      )}

      {/* Applied Features Summary */}
      {(raceData || classData) && (
        <div className="bg-brand/5 border border-brand/20 rounded-lg p-4">
          <h4 className="font-semibold text-brand-ink mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Applied Features
          </h4>
          <div className="grid gap-2 text-sm">
            {raceData && (
              <div className="bg-white/50 rounded p-2">
                <div className="font-medium text-brand-ink">{raceData.name}</div>
                <div className="text-xs text-ink-muted">
                  {raceData.abilityScoreIncrease && Object.entries(raceData.abilityScoreIncrease).map(([k, v]) => <span key={k} className="inline-block mr-2">+{v} {k}</span>)}
                  • Speed: {raceData.speed}ft • Size: {raceData.size}
                </div>
                <div className="text-xs text-ink-muted mt-1">
                  Features: {raceData.features.map(f => f.name).join(', ')}
                </div>
              </div>
            )}
            {classData && (
              <div className="bg-white/50 rounded p-2">
                <div className="font-medium text-brand-ink">{classData.name}</div>
                <div className="text-xs text-ink-muted">
                  HD: {classData.hitDie} • Primary: {classData.primaryAbility.join(', ')}
                </div>
                <div className="text-xs text-ink-muted mt-1">
                  Skills: Choose {classData.skillChoices[0]?.choose} from {classData.skillChoices[0]?.from.join(', ')}
                </div>
                {subclassData && (
                  <div className="text-xs text-brand mt-1">
                    Subclass: {subclassData.name}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Race Details Modal */}
      {showRaceDetails && raceData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="p-4 border-b border-ink/10 flex justify-between items-center">
              <h3 className="font-semibold text-lg">{raceData.name}</h3>
              <button onClick={() => setShowRaceDetails(null)} className="text-ink-muted hover:text-ink">×</button>
            </div>
            <div className="p-4 space-y-4 max-h-[60vh] overflow-auto">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-ink-muted">Speed</span>
                <span className="font-medium">{raceData.speed} ft</span>
                <span className="text-ink-muted">Size</span>
                <span className="font-medium">{raceData.size}</span>
                <span className="text-ink-muted">Ability Increases</span>
                <span className="font-medium">
                  {Object.entries(raceData.abilityScoreIncrease).map(([k, v]) => <span key={k}>+{v} {k}</span>).join(', ')}
                </span>
                <span className="text-ink-muted">Languages</span>
                <span className="font-medium">{raceData.languages.join(', ')}</span>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Features</h4>
                <ul className="space-y-2">
                  {raceData.features.map(f => (
                    <li key={f.name} className="text-sm">
                      <span className="font-medium">{f.name}</span>
                      <p className="text-ink-muted text-xs mt-1">{f.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="p-4 border-t border-ink/10 flex justify-end">
              <button onClick={() => setShowRaceDetails(null)} className="px-4 py-2 bg-brand text-white rounded hover:bg-brand/90">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Class Details Modal */}
      {showClassDetails && classData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="p-4 border-b border-ink/10 flex justify-between items-center">
              <h3 className="font-semibold text-lg">{classData.name}</h3>
              <button onClick={() => setShowClassDetails(null)} className="text-ink-muted hover:text-ink">×</button>
            </div>
            <div className="p-4 space-y-4 max-h-[60vh] overflow-auto">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-ink-muted">Hit Die</span>
                <span className="font-medium">{classData.hitDie}</span>
                <span className="text-ink-muted">Primary Ability</span>
                <span className="font-medium">{classData.primaryAbility.join(', ')}</span>
                <span className="text-ink-muted">Armor</span>
                <span className="font-medium">{classData.armorProficiencies.join(', ')}</span>
                <span className="text-ink-muted">Weapons</span>
                <span className="font-medium">{classData.weaponProficiencies.join(', ')}</span>
              </div>
              {classData.spellcasting && (
                <div>
                  <h4 className="font-semibold mb-2">Spellcasting</h4>
                  <p className="text-sm text-ink-muted">Ability: {classData.spellcasting.ability} • List: {classData.spellcasting.spellList}</p>
                </div>
              )}
              <div>
                <h4 className="font-semibold mb-2">Key Features</h4>
                <ul className="space-y-2 text-sm">
                  {Object.entries(classData.features).slice(0, 3).flatMap(([level, features]) =>
                    features.map(f => (
                      <li key={`${level}-${f.name}`}>
                        <span className="font-medium">Level {level}:</span> {f.name}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
            <div className="p-4 border-t border-ink/10 flex justify-end">
              <button onClick={() => setShowClassDetails(null)} className="px-4 py-2 bg-brand text-white rounded hover:bg-brand/90">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RaceClassManager;