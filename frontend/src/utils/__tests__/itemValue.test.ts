import { describe, expect, it } from 'vitest';
import { itemValueInGold } from '../itemValue';

describe('itemValueInGold', () => {
  it('converts each stored denomination to gold pieces', () => {
    expect(itemValueInGold({ amount: 5, currency: 'CP' })).toBeCloseTo(0.05);
    expect(itemValueInGold({ amount: 5, currency: 'SP' })).toBeCloseTo(0.5);
    expect(itemValueInGold({ amount: 3, currency: 'SP' })).toBe(0.3);
    expect(itemValueInGold({ amount: 5, currency: 'EP' })).toBe(2.5);
    expect(itemValueInGold({ amount: 5, currency: 'GP' })).toBe(5);
    expect(itemValueInGold({ amount: 5, currency: 'PP' })).toBe(50);
  });

  it('treats legacy numbers and a missing denomination as gold', () => {
    expect(itemValueInGold(4)).toBe(4);
    expect(itemValueInGold({ amount: 4 })).toBe(4);
    expect(itemValueInGold(undefined)).toBeUndefined();
  });
});
