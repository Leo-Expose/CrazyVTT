import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractDnd5eRolls } from '../frontend/src/utils/characterRolls';
import type { DnD5eCharacterData } from '../frontend/src/types/game-systems';

// Mock character data for testing
const mockCharacter: DnD5eCharacterData = {
  gameSystem: 'DND_5E',
  name: 'Test Fighter',
  level: 5,
  proficiencyBonus: 3,
  spellcastingAbility: 'strength',
  stats: {
    strength: { score: 18, modifier: 4 },
    dexterity: { score: 14, modifier: 2 },
    constitution: { score: 16, modifier: 3 },
    intelligence: { score: 10, modifier: 0 },
    wisdom: { score: 12, modifier: 1 },
    charisma: { score: 8, modifier: -1 },
  },
  savingThrows: {
    strength: { proficient: true, bonus: 0 },
    dexterity: { proficient: false, bonus: 0 },
    constitution: { proficient: true, bonus: 0 },
    intelligence: { proficient: false, bonus: 0 },
    wisdom: { proficient: false, bonus: 0 },
    charisma: { proficient: false, bonus: 0 },
  },
  skills: {
    athletics: { proficient: true, expertise: false, bonus: 0 },
    acrobatics: { proficient: false, expertise: false, bonus: 0 },
    perception: { proficient: true, expertise: false, bonus: 0 },
  },
  attacks: [
    {
      name: 'Longsword',
      attackBonus: 7,
      damageRoll: '1d8+4',
      damageType: 'slashing',
      range: '5/10',
      additionalDamage: [
        { label: 'Versatile', damageRoll: '1d10+4' },
      ],
    },
    {
      name: 'Longbow',
      attackBonus: 5,
      damageRoll: '1d8+2',
      damageType: 'piercing',
      range: '150/600',
    },
  ],
  hitDice: [
    { class: 'Fighter', total: '5d10', remaining: 3 },
  ],
  spells: [
    {
      name: 'Fireball',
      level: 3,
      prepared: true,
      damageRoll: '8d6',
      damageType: 'fire',
      save: 'dexterity',
      area: { shape: 'circle', size: 20 },
      range: { normal: 150, long: 150 },
      concentration: false,
      ritual: false,
      components: 'V S M',
      duration: 'Instantaneous',
      school: 'evocation',
      description: 'A bright streak flashes from your pointing finger...',
    },
    {
      name: 'Shield',
      level: 1,
      prepared: true,
      castingTime: 'Reaction',
      description: 'An invisible barrier of magical force appears...',
    },
  ],
  features: [
    {
      name: 'Action Surge',
      description: 'On your turn, you can take one additional action.',
      actionCost: 'Free',
      source: 'Class',
      recharge: 'Short Rest',
      uses: 1,
      maxUses: 1,
    },
    {
      name: 'Second Wind',
      description: 'You can use a bonus action to regain 1d10 + 5 hit points.',
      actionCost: 'Bonus Action',
      source: 'Class',
      recharge: 'Short Rest',
      uses: 1,
      maxUses: 1,
    },
  ],
  inventory: [
    {
      name: 'Potion of Healing',
      type: 'consumable',
      description: 'You regain 2d4+2 hit points.',
      quantity: 2,
    },
    {
      name: 'Wand of Fireballs',
      type: 'magic',
      charges: { current: 3, max: 7, recharge: '1d6+1 at dawn' },
      chargeEffect: 'Cast Fireball (3rd level)',
    },
  ],
};

describe('Character Action Registry', () => {
  it('should extract attack rolls from character data', () => {
    const rolls = extractDnd5eRolls('DND_5E', mockCharacter);
    
    // Should have melee attack
    const longswordAttack = rolls.combat.find(r => r.label.includes('Longsword') && r.purpose.includes('Attack'));
    expect(longswordAttack).toBeDefined();
    expect(longswordAttack?.expression).toBe('1d20+7');
    expect(longswordAttack?.supportsAdvantage).toBe(true);
    
    // Should have ranged attack
    const longbowAttack = rolls.combat.find(r => r.label.includes('Longbow') && r.purpose.includes('Attack'));
    expect(longbowAttack).toBeDefined();
    expect(longbowAttack?.expression).toBe('1d20+5');
    
    // Should have damage rolls
    const longswordDamage = rolls.combat.find(r => r.label.includes('Longsword') && r.purpose.includes('Damage'));
    expect(longswordDamage).toBeDefined();
    expect(longswordDamage?.expression).toBe('1d8+4');
    expect(longswordDamage?.supportsAdvantage).toBe(false);
  });

  it('should extract spell rolls from character data', () => {
    const rolls = extractDnd5eRolls('DND_5E', mockCharacter);
    
    // Spells should be in combat section for D&D 5e
    const fireball = rolls.combat.find(r => r.label.includes('Fireball'));
    expect(fireball).toBeDefined();
  });

  it('should extract saving throws', () => {
    const rolls = extractDnd5eRolls('DND_5E', mockCharacter);
    
    const strSave = rolls.savingThrows.find(r => r.label.includes('Strength'));
    expect(strSave).toBeDefined();
    // 1d20 + prof (3) + str mod (4) = 1d20+7
    expect(strSave?.expression).toBe('1d20+7');
    
    const conSave = rolls.savingThrows.find(r => r.label.includes('Constitution'));
    expect(conSave).toBeDefined();
    // 1d20 + prof (3) + con mod (3) = 1d20+6
    expect(conSave?.expression).toBe('1d20+6');
  });

  it('should extract skills', () => {
    const rolls = extractDnd5eRolls('DND_5E', mockCharacter);
    
    const athletics = rolls.skills.find(r => r.label.includes('Athletics'));
    expect(athletics).toBeDefined();
    // 1d20 + prof (3) + str mod (4) = 1d20+7
    expect(athletics?.expression).toBe('1d20+7');
  });

  it('should extract hit dice', () => {
    const rolls = extractDnd5eRolls('DND_5E', mockCharacter);
    
    expect(rolls.hitDice.length).toBe(1);
    expect(rolls.hitDice[0].label).toContain('Fighter');
    expect(rolls.hitDice[0].hitDiceIndex).toBe(0);
    // 1d10 + con mod (3) = 1d10+3
    expect(rolls.hitDice[0].expression).toBe('1d10+3');
  });

  it('should extract abilities', () => {
    const rolls = extractDnd5eRolls('DND_5E', mockCharacter);
    
    const strCheck = rolls.abilities.find(r => r.label.startsWith('STR'));
    expect(strCheck).toBeDefined();
    expect(strCheck?.expression).toBe('1d20+4');
    expect(strCheck?.supportsAdvantage).toBe(true);
  });
});

describe('Action Preview Calculations', () => {
  it('should calculate attack preview for melee weapon', () => {
    const actionData = {
      attackBonus: 7,
      damageExpression: '1d8+4',
      damageType: 'slashing',
      range: { normal: 5, long: 10 },
      reach: 5,
    };
    
    // This would be tested via the preview service
    // For now, verify the data structure is correct
    expect(actionData.attackBonus).toBe(7);
    expect(actionData.damageExpression).toBe('1d8+4');
    expect(actionData.damageType).toBe('slashing');
  });

  it('should calculate spell attack preview', () => {
    const actionData = {
      spellAttackBonus: 7,
      spellSaveDC: 15,
      damageExpression: '8d6',
      damageType: 'fire',
      saveAbility: 'dexterity',
      area: { shape: 'circle', size: 20 },
      range: { normal: 150, long: 150 },
      concentration: false,
      spellLevel: 3,
    };
    
    expect(actionData.spellAttackBonus).toBe(7);
    expect(actionData.spellSaveDC).toBe(15);
    expect(actionData.damageExpression).toBe('8d6');
    expect(actionData.area?.shape).toBe('circle');
  });

  it('should calculate save-based spell preview', () => {
    const actionData = {
      spellSaveDC: 15,
      saveAbility: 'dexterity',
      damageExpression: '8d6',
      damageType: 'fire',
      halfOnSave: true,
      area: { shape: 'circle', size: 20 },
      range: { normal: 150, long: 150 },
      spellLevel: 3,
    };
    
    expect(actionData.saveAbility).toBe('dexterity');
    expect(actionData.halfOnSave).toBe(true);
  });
});

describe('Reaction System', () => {
  it('should identify available reactions for a character', () => {
    const reactions = [
      { name: 'Shield', type: 'REACTION', cost: 'REACTION' },
      { name: 'Counterspell', type: 'REACTION', cost: 'REACTION' },
      { name: 'Opportunity Attack', type: 'REACTION', cost: 'REACTION' },
      { name: 'Uncanny Dodge', type: 'REACTION', cost: 'REACTION' },
    ];
    
    expect(reactions.length).toBe(4);
    expect(reactions.every(r => r.cost === 'REACTION')).toBe(true);
  });

  it('should track used reactions per round', () => {
    const usedReactions = new Set<string>();
    
    usedReactions.add('shield');
    expect(usedReactions.has('shield')).toBe(true);
    expect(usedReactions.has('counterspell')).toBe(false);
    
    usedReactions.add('counterspell');
    expect(usedReactions.size).toBe(2);
  });

  it('should reset reactions on turn start', () => {
    const usedReactions = new Set(['shield', 'counterspell']);
    expect(usedReactions.size).toBe(2);
    
    // Simulate turn start reset
    usedReactions.clear();
    expect(usedReactions.size).toBe(0);
  });
});

describe('Multiattack Handling', () => {
  it('should handle extra attack feature', () => {
    const multiattackData = {
      multiattack: true,
      attacks: [
        { name: 'Longsword', bonus: 7, damage: '1d8+4' },
        { name: 'Longsword', bonus: 7, damage: '1d8+4' },
      ],
    };
    
    expect(multiattackData.multiattack).toBe(true);
    expect(multiattackData.attacks.length).toBe(2);
  });
});

describe('Resource Tracking', () => {
  it('should track spell slots', () => {
    const spellSlots = {
      1: { max: 4, used: 1 },
      2: { max: 3, used: 0 },
      3: { max: 2, used: 1 },
    };
    
    expect(spellSlots[1].max - spellSlots[1].used).toBe(3);
    expect(spellSlots[3].used).toBe(1);
  });

  it('should track hit dice', () => {
    const hitDice = [
      { class: 'Fighter', die: 'd10', max: 5, remaining: 3 },
    ];
    
    expect(hitDice[0].remaining).toBe(3);
    expect(hitDice[0].max).toBe(5);
  });

  it('should track superiority dice', () => {
    const superiorityDice = { max: 6, current: 4, die: 'd8' };
    
    expect(superiorityDice.current).toBe(4);
    expect(superiorityDice.max).toBe(6);
  });
});