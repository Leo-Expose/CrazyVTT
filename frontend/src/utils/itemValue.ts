export function itemValueInGold(value: number | { amount: number; currency?: 'CP' | 'SP' | 'EP' | 'GP' | 'PP' } | undefined): number | undefined {
  if (typeof value !== 'object') return value;
  const coinsPerGold = { CP: 100, SP: 10, EP: 2, GP: 1, PP: 0.1 };
  return value.amount / coinsPerGold[value.currency ?? 'GP'];
}
