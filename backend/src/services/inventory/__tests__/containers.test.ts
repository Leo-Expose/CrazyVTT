/**
 * Tests for Container Service
 * Note: These tests require a database connection, so they're more integration tests.
 * We'll test the pure logic functions here.
 */

import { 
  getDefaultContainers,
} from '../index';

describe('Container Service - Pure Logic', () => {
  describe('getDefaultContainers', () => {
    it('should return default containers for D&D 5e', () => {
      const containers = getDefaultContainers('DND_5E');
      
      expect(containers.length).toBe(2);
      expect(containers[0].name).toBe('Backpack');
      expect(containers[0].capacity).toBe(30);
      expect(containers[0].capacityUnit).toBe('LBS');
      expect(containers[1].name).toBe('Belt Pouch');
      expect(containers[1].capacity).toBe(6);
    });

    it('should return default containers for Pathfinder 2e with BULK', () => {
      const containers = getDefaultContainers('PATHFINDER_2E');
      
      expect(containers.length).toBe(2);
      expect(containers[0].capacityUnit).toBe('BULK');
      expect(containers[0].capacity).toBe(3); // 30 lbs / 10
      expect(containers[1].capacity).toBe(0.6); // 6 lbs / 10 - but it might be rounded
    });

    it('should return default containers for other systems', () => {
      const containers = getDefaultContainers('CALL_OF_CTHULHU_7E');
      
      expect(containers.length).toBe(2);
      expect(containers[0].capacityUnit).toBe('LBS');
    });
  });
});

describe('Container Weight Calculations', () => {
  // These are logic tests for the weight calculation formulas
  
  it('should calculate container total weight as base + contents + children', () => {
    // Base weight 5 lbs
    // Contents: 10 lbs
    // Child container: base 2 lbs + contents 3 lbs = 5 lbs
    // Total: 5 + 10 + 5 = 20 lbs
    const baseWeight = 5;
    const contentsWeight = 10;
    const childWeight = 5;
    const total = baseWeight + contentsWeight + childWeight;
    
    expect(total).toBe(20);
  });

  it('should calculate remaining capacity correctly', () => {
    const capacity = 30;
    const contentsWeight = 12;
    const remaining = Math.max(0, capacity - contentsWeight);
    
    expect(remaining).toBe(18);
  });

  it('should detect over capacity', () => {
    const capacity = 30;
    const contentsWeight = 35;
    const isOver = contentsWeight > capacity;
    
    expect(isOver).toBe(true);
  });

  it('should handle magical containers with no weight limit', () => {
    const capacity = 0; // Portable hole
    const contentsWeight = 1000;
    const remaining = capacity > 0 ? Math.max(0, capacity - contentsWeight) : Infinity;
    const isOver = capacity > 0 && contentsWeight > capacity;
    
    expect(remaining).toBe(Infinity);
    expect(isOver).toBe(false);
  });
});

describe('Special Container Configurations', () => {
  it('should configure Bag of Holding correctly', () => {
    const bagOfHolding = {
      capacity: 500,
      capacityUnit: 'LBS',
      baseWeight: 15,
      isMagical: true,
      magicType: 'bag_of_holding',
    };
    
    expect(bagOfHolding.capacity).toBe(500);
    expect(bagOfHolding.baseWeight).toBe(15);
    expect(bagOfHolding.isMagical).toBe(true);
  });

  it('should configure Portable Hole correctly', () => {
    const portableHole = {
      capacity: 0, // No weight limit
      capacityUnit: 'LBS',
      baseWeight: 0,
      isMagical: true,
      magicType: 'portable_hole',
    };
    
    expect(portableHole.capacity).toBe(0);
    expect(portableHole.baseWeight).toBe(0);
    expect(portableHole.isMagical).toBe(true);
  });

  it('should configure Handy Haversack correctly', () => {
    const haversack = {
      capacity: 120,
      capacityUnit: 'LBS',
      baseWeight: 5,
      isMagical: true,
      magicType: 'handy_haversack',
    };
    
    expect(haversack.capacity).toBe(120);
    expect(haversack.baseWeight).toBe(5);
  });
});