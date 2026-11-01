import type { Data } from './data';
import { localDate } from './data.ts';

export function matchesPeriod(value: string | undefined, from: string, to: string) {
  if (from && to && from > to) return false;
  if (!value) return true;
  const day = value.length > 10 ? localDate(new Date(value)) : value;
  return (!from || day >= from) && (!to || day <= to);
}
export function inventoryAlerts(data: Data, branch = 'all') {
  const inScope = (id: string) => (branch === 'all' || branch === id) && data.branches.some(b => b.id === id && b.active);
  return [
    ...data.stock.filter(i => inScope(i.branch) && i.quantity <= i.minimum),
    ...data.snackStocks.filter(s => inScope(s.branch) && s.quantity <= s.minimum && data.products.some(p => p.id === s.product && p.active)).map(s => ({ ...s, name: data.products.find(p => p.id === s.product)?.name || 'Snack', unit: 'unidades' })),
    ...data.beverageStocks.filter(s => inScope(s.branch) && s.freezer + s.warehouse <= s.minimum && data.products.some(p => p.id === s.product && p.active)).map(s => ({ id: s.id, branch: s.branch, quantity: s.freezer + s.warehouse, minimum: s.minimum, name: data.products.find(p => p.id === s.product)?.name || 'Bebida', unit: 'unidades' })),
  ];
}
export function matchingBranches(data: Data, branch: string, query: string) {
  return data.branches.filter(b => (branch === 'all' || b.id === branch) && b.name.toLowerCase().includes(query.toLowerCase()));
}
