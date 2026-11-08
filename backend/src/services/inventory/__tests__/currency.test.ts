/**
 * Tests for Currency Service
 */

import { GameSystem } from '@prisma/client';
import { 
  formatCurrency,
  convertFromLowest,
  getConversionRates,
  mergeCustom,
} from '../currency';

describe('Currency Service', () => {
  describe('formatCurrency', () => {
    it('should format D&D 5e currency correctly', () => {
      const amount = { cp: 7, sp: 3, ep: 0, gp: 42, pp: 1, nuyen: 0, cash: 0 };
      const result = formatCurrency(amount, GameSystem.DND_5E);
      
      expect(result.display).toContain('1 pp');
      expect(result.display).toContain('42 gp');
      expect(result.display).toContain('3 sp');
      expect(result.display).toContain('7 cp');
    });

    it('should format Pathfinder 2e currency (no EP)', () => {
      const amount = { cp: 7, sp: 3, ep: 5, gp: 42, pp: 1, nuyen: 0, cash: 0 };
      const result = formatCurrency(amount, GameSystem.PATHFINDER_2E);
      
      // PF2e doesn't use EP, so it should still show but the conversion is different
      expect(result.display).toContain('1 pp');
      expect(result.display).toContain('42 gp');
    });

    it('should format Shadowrun nuyen', () => {
      const amount = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 5000, cash: 0 };
      const result = formatCurrency(amount, GameSystem.SHADOWRUN_6E);
      
      expect(result.display).toContain('¥5,000');
    });

    it('should format CoC cash', () => {
      const amount = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 1234.56 };
      const result = formatCurrency(amount, GameSystem.CALL_OF_CTHULHU_7E);
      
      expect(result.display).toContain('$1,234.56');
    });

    it('should handle empty currency', () => {
      const amount = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
      const result = formatCurrency(amount, GameSystem.DND_5E);
      
      expect(result.display).toBe('—');
    });

    it('should only show non-zero denominations', () => {
      const amount = { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0, nuyen: 0, cash: 0 };
      const result = formatCurrency(amount, GameSystem.DND_5E);
      
      expect(result.display).toBe('10 gp');
      expect(result.display).not.toContain('cp');
      expect(result.display).not.toContain('sp');
    });
  });

  describe('convertFromLowest', () => {
    it('should convert copper pieces to D&D 5e denominations', () => {
      const rates = getConversionRates(GameSystem.DND_5E);
      const result = convertFromLowest(123456, rates, GameSystem.DND_5E);
      
      // 123456 cp = 123 pp, 4 gp, 1 ep, 0 sp, 6 cp
      expect(result.pp).toBe(123);
      expect(result.gp).toBe(4);
      expect(result.ep).toBe(1);
      expect(result.sp).toBe(0);
      expect(result.cp).toBe(6);
    });

    it('should convert for Pathfinder 2e', () => {
      const rates = getConversionRates(GameSystem.PATHFINDER_2E);
      const result = convertFromLowest(12345, rates, GameSystem.PATHFINDER_2E);
      
      // 12345 cp = 12 pp, 3 gp, 4 sp, 5 cp
      expect(result.pp).toBe(12);
      expect(result.gp).toBe(3);
      expect(result.sp).toBe(4);
      expect(result.cp).toBe(5);
    });

    it('should handle Shadowrun nuyen', () => {
      const rates = getConversionRates(GameSystem.SHADOWRUN_6E);
      const result = convertFromLowest(5000, rates, GameSystem.SHADOWRUN_6E);
      
      expect(result.nuyen).toBe(5000);
    });
  });

  describe('Conversion Rates', () => {
    it('should return correct D&D 5e conversion rates', () => {
      const rates = getConversionRates(GameSystem.DND_5E) as { PP: number; GP: number; EP: number; SP: number; CP: number };
      
      expect(rates.PP).toBe(1000);
      expect(rates.GP).toBe(100);
      expect(rates.EP).toBe(50);
      expect(rates.SP).toBe(10);
      expect(rates.CP).toBe(1);
    });

    it('should return correct Pathfinder 2e conversion rates', () => {
      const rates = getConversionRates(GameSystem.PATHFINDER_2E) as { PP: number; GP: number; SP: number; CP: number };
      
      expect(rates.PP).toBe(1000);
      expect(rates.GP).toBe(100);
      expect(rates.SP).toBe(10);
      expect(rates.CP).toBe(1);
    });
  });

  describe('mergeCustom', () => {
    it('should merge custom currency objects', () => {
      const a = { 'custom1': 10, 'custom2': 20 };
      const b = { 'custom2': 5, 'custom3': 30 };
      const result = mergeCustom(a, b);
      
      expect(result.custom1).toBe(10);
      expect(result.custom2).toBe(25);
      expect(result.custom3).toBe(30);
    });

    it('should handle undefined inputs', () => {
      const result = mergeCustom(undefined, { 'custom1': 10 });
      expect(result.custom1).toBe(10);
      
      const result2 = mergeCustom({ 'custom1': 10 }, undefined);
      expect(result2.custom1).toBe(10);
    });
  });
});
