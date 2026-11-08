// ============================================
// Currency Utilities (Phase 7)
// ============================================

export type Currency = {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  nuyen: number;
  cash: number;
  custom?: Record<string, number>;
  exchangeRates?: Record<string, number>;
};

export type CurrencyInput = Partial<Currency>;
type NumericCurrencyKey = 'cp' | 'sp' | 'ep' | 'gp' | 'pp' | 'nuyen' | 'cash';
const NUMERIC_CURRENCY_KEYS: NumericCurrencyKey[] = ['cp', 'sp', 'ep', 'gp', 'pp', 'nuyen', 'cash'];

/**
 * Convert currency to copper pieces (CP) for comparison
 * Standard D&D 5e: 1 PP = 10 GP = 50 EP = 100 SP = 1000 CP
 */
export const currencyToCopper = (currency: Currency): number => {
  let total = currency.cp || 0;
  total += (currency.sp || 0) * 10;
  total += (currency.ep || 0) * 50;
  total += (currency.gp || 0) * 100;
  total += (currency.pp || 0) * 1000;
  total += (currency.nuyen || 0) * 100; // Shadowrun: 1 nuyen ≈ 1 GP
  total += (currency.cash || 0) * 100; // CoC: $1 ≈ 1 GP (rough)
  
  if (currency.custom) {
    Object.values(currency.custom).forEach(value => {
      total += value * 100; // Assume custom currencies are GP-equivalent
    });
  }
  
  return total;
};

/**
 * Convert copper pieces back to currency breakdown
 */
export const copperToCurrency = (copper: number): Currency => {
  const result: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
  
  result.pp = Math.floor(copper / 1000);
  copper %= 1000;
  
  result.gp = Math.floor(copper / 100);
  copper %= 100;
  
  result.ep = Math.floor(copper / 50);
  copper %= 50;
  
  result.sp = Math.floor(copper / 10);
  copper %= 10;
  
  result.cp = copper;
  
  return result;
};

/**
 * Format currency for display
 */
export const formatCurrency = (currency: Currency, options?: { compact?: boolean; showZero?: boolean }): string => {
  const { compact = false, showZero = false } = options || {};
  const parts: string[] = [];
  
  const denominations = [
    { key: 'pp', label: 'PP', value: currency.pp },
    { key: 'gp', label: 'GP', value: currency.gp },
    { key: 'ep', label: 'EP', value: currency.ep },
    { key: 'sp', label: 'SP', value: currency.sp },
    { key: 'cp', label: 'CP', value: currency.cp },
    { key: 'nuyen', label: '¥', value: currency.nuyen },
    { key: 'cash', label: '$', value: currency.cash },
  ];
  
  for (const { key, label, value } of denominations) {
    if (value > 0 || (showZero && key === 'cp')) {
      if (compact) {
        parts.push(`${value}${label}`);
      } else {
        parts.push(`${value.toLocaleString()} ${label}`);
      }
    }
  }
  
  if (currency.custom) {
    Object.entries(currency.custom).forEach(([key, value]) => {
      if (value > 0) {
        parts.push(`${value} ${key}`);
      }
    });
  }
  
  if (parts.length === 0) {
    return showZero ? '0 CP' : '—';
  }
  
  return parts.join(compact ? ' ' : ', ');
};

/**
 * Parse currency string (e.g., "5 GP 3 SP" or "500 CP")
 */
export const parseCurrency = (str: string): Currency => {
  const result: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
  
  // Match patterns like "5 GP", "3 SP", "100 CP", "1 PP", "10 EP", "50 ¥", "$20"
  const patterns = [
    { regex: /(\d+(?:\.\d+)?)\s*PP/gi, key: 'pp', mult: 1 },
    { regex: /(\d+(?:\.\d+)?)\s*GP/gi, key: 'gp', mult: 1 },
    { regex: /(\d+(?:\.\d+)?)\s*EP/gi, key: 'ep', mult: 1 },
    { regex: /(\d+(?:\.\d+)?)\s*SP/gi, key: 'sp', mult: 1 },
    { regex: /(\d+(?:\.\d+)?)\s*CP/gi, key: 'cp', mult: 1 },
    { regex: /(\d+(?:\.\d+)?)\s*¥/gi, key: 'nuyen', mult: 1 },
    { regex: /\$(\d+(?:\.\d+)?)/gi, key: 'cash', mult: 1 },
  ];
  
  for (const { regex, key, mult } of patterns) {
    let match;
    while ((match = regex.exec(str)) !== null) {
      result[key as NumericCurrencyKey] += parseFloat(match[1]) * mult;
    }
  }
  
  return result;
};

/**
 * Add two currencies together
 */
export const addCurrency = (a: Currency, b: Currency): Currency => {
  const result: Currency = { 
    cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 
  };
  
  NUMERIC_CURRENCY_KEYS.forEach(key => {
    result[key] = (a[key] || 0) + (b[key] || 0);
  });
  
  // Handle custom currencies
  if (a.custom || b.custom) {
    result.custom = {};
    const allKeys = new Set([...Object.keys(a.custom || {}), ...Object.keys(b.custom || {})]);
    allKeys.forEach(key => {
      result.custom![key] = (a.custom?.[key] || 0) + (b.custom?.[key] || 0);
    });
  }
  
  return result;
};

/**
 * Subtract currency b from a (a - b)
 */
export const subtractCurrency = (a: Currency, b: Currency): Currency => {
  const result: Currency = { 
    cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 
  };
  
  NUMERIC_CURRENCY_KEYS.forEach(key => {
    result[key] = (a[key] || 0) - (b[key] || 0);
  });
  
  // Handle custom currencies
  if (a.custom || b.custom) {
    result.custom = {};
    const allKeys = new Set([...Object.keys(a.custom || {}), ...Object.keys(b.custom || {})]);
    allKeys.forEach(key => {
      result.custom![key] = (a.custom?.[key] || 0) - (b.custom?.[key] || 0);
    });
  }
  
  // Normalize negative values (borrow from higher denominations)
  return normalizeCurrency(result);
};

/**
 * Compare two currencies: returns 1 if a > b, -1 if a < b, 0 if equal
 */
export const compareCurrency = (a: Currency, b: Currency): number => {
  const aCopper = currencyToCopper(a);
  const bCopper = currencyToCopper(b);
  
  if (aCopper > bCopper) return 1;
  if (aCopper < bCopper) return -1;
  return 0;
};

/**
 * Check if currency a can afford currency b
 */
export const canAfford = (available: Currency, cost: Currency): boolean => {
  return compareCurrency(available, cost) >= 0;
};

/**
 * Multiply currency by a factor
 */
export const multiplyCurrency = (currency: Currency, factor: number): Currency => {
  const result: Currency = { 
    cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 
  };
  
  NUMERIC_CURRENCY_KEYS.forEach(key => {
    result[key] = Math.round((currency[key] || 0) * factor);
  });
  
  if (currency.custom) {
    result.custom = {};
    Object.entries(currency.custom).forEach(([key, value]) => {
      result.custom![key] = Math.round(value * factor);
    });
  }
  
  return normalizeCurrency(result);
};

/**
 * Normalize currency (convert excess lower denominations to higher)
 */
export const normalizeCurrency = (currency: Currency): Currency => {
  const result = { ...currency };
  
  // Convert CP to SP
  if (result.cp >= 10) {
    result.sp = (result.sp || 0) + Math.floor(result.cp / 10);
    result.cp = result.cp % 10;
  }
  
  // Convert SP to EP
  if (result.sp >= 5) {
    result.ep = (result.ep || 0) + Math.floor(result.sp / 5);
    result.sp = result.sp % 5;
  }
  
  // Convert EP to GP
  if (result.ep >= 2) {
    result.gp = (result.gp || 0) + Math.floor(result.ep / 2);
    result.ep = result.ep % 2;
  }
  
  // Convert GP to PP
  if (result.gp >= 10) {
    result.pp = (result.pp || 0) + Math.floor(result.gp / 10);
    result.gp = result.gp % 10;
  }
  
  return result;
};

/**
 * Get the highest non-zero denomination
 */
export const getHighestDenomination = (currency: Currency): string => {
  if (currency.pp > 0) return 'PP';
  if (currency.gp > 0) return 'GP';
  if (currency.ep > 0) return 'EP';
  if (currency.sp > 0) return 'SP';
  if (currency.cp > 0) return 'CP';
  if (currency.nuyen > 0) return '¥';
  if (currency.cash > 0) return '$';
  return 'CP';
};

/**
 * Create a currency object with only the specified amount in a denomination
 */
export const createCurrency = (amount: number, denomination: 'CP' | 'SP' | 'EP' | 'GP' | 'PP' | 'NUYEN' | 'CASH'): Currency => {
  const result: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, nuyen: 0, cash: 0 };
  result[denomination.toLowerCase() as NumericCurrencyKey] = amount;
  return normalizeCurrency(result);
};
