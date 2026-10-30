import type { Purchase } from './data';

export type PurchaseItem = { stock: string | null; name: string; unit: string; quantity: number; unitCost: number };
export type PurchaseDraft = { id: string; branch: string; supplier: string; receipt: string; date: string; notes: string; items: PurchaseItem[] };
export const purchaseUnits = ['unidades', 'kg', 'litros', 'paquetes'];
export const normalizedStockName = (name: string) => name.trim().toLocaleLowerCase('es');
const validUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function purchaseLineTotal(quantity: number, unitCost: number) {
  // Cantidad y costo admiten dos decimales. Redondeo por línea igual al numeric de PostgreSQL.
  const cents = (BigInt(Math.round(quantity * 100)) * BigInt(Math.round(unitCost * 100)) + BigInt(50)) / BigInt(100);
  return Number(cents) / 100;
}
export function purchaseTotal(items: { quantity: number; unitCost: number }[]) { return items.reduce((sum, item) => sum + Math.round(purchaseLineTotal(item.quantity, item.unitCost) * 100), 0) / 100; }
export function validatePurchaseDraft(r: Record<string, unknown>): PurchaseDraft {
  if (!validUuid(r.id) || !validUuid(r.branch)) throw new Error('Selecciona una sucursal válida.');
  if (r.supplier !== '' && !validUuid(r.supplier)) throw new Error('Selecciona un proveedor válido o Sin proveedor / Varios.');
  if (typeof r.receipt !== 'string' || r.receipt.length > 120) throw new Error('El comprobante admite hasta 120 caracteres.');
  if (typeof r.notes !== 'string' || r.notes.length > 2000) throw new Error('Las observaciones admiten hasta 2000 caracteres.');
  if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0,10) !== r.date) throw new Error('Selecciona una fecha válida.');
  if (!Array.isArray(r.items) || r.items.length < 1 || r.items.length > 100) throw new Error('Agrega entre 1 y 100 insumos a la compra.');
  const items: PurchaseItem[] = r.items.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Revisa los insumos de la compra.');
    const v = item as Record<string, unknown>;
    if (v.stock !== null && !validUuid(v.stock)) throw new Error('Selecciona un insumo válido.');
    if (typeof v.name !== 'string' || !v.name.trim() || v.name.trim().length > 100) throw new Error('El nombre del insumo debe tener entre 1 y 100 caracteres.');
    if (typeof v.unit !== 'string' || !purchaseUnits.includes(v.unit)) throw new Error('Selecciona una unidad válida.');
    for (const key of ['quantity','unitCost']) {
      const value = v[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1000000 || Math.abs(value * 100 - Math.round(value * 100)) > .000001) throw new Error('Cantidad y precio unitario deben ser mayores a cero, con hasta dos decimales.');
    }
    return { stock: v.stock as string | null, name: v.name.trim(), unit: v.unit, quantity: v.quantity as number, unitCost: v.unitCost as number };
  });
  return { id: r.id, branch: r.branch, supplier: r.supplier as string, receipt: r.receipt.trim(), date: r.date, notes: r.notes.trim(), items };
}
export function groupPurchases(purchases: Purchase[]) {
  const groups = new Map<string, { id: string; first: Purchase; items: Purchase[]; total: number }>();
  for (const purchase of purchases) {
    const id = purchase.document || purchase.id;
    const group = groups.get(id) || { id, first: purchase, items: [], total: 0 };
    group.items.push(purchase); groups.set(id, group);
  }
  return [...groups.values()].map(g => ({ ...g, total: purchaseTotal(g.items) }));
}
