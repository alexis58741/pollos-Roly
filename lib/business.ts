import type { Data, Purchase, Shift } from './data';

export function paymentTotal(orders: Data['orders'], method: string) {
  return orders.reduce((sum, order) => sum + (order.payments || [{ method: order.payment, amount: order.total }]).filter(p => p.method === method).reduce((total, p) => total + p.amount, 0), 0);
}

export function registerPurchase(data: Data, purchase: Purchase): Data {
  const stock = data.stock.find(s => s.id === purchase.stock && s.branch === purchase.branch);
  if (!stock || !data.suppliers.some(s => s.id === purchase.supplier && s.active)) throw new Error('Selecciona un proveedor activo y un insumo de la misma sucursal.');
  if (!Number.isFinite(purchase.quantity) || purchase.quantity <= 0 || !Number.isFinite(purchase.unitCost) || purchase.unitCost <= 0) throw new Error('Cantidad y costo deben ser mayores a cero.');
  if (data.purchases.some(p => p.id === purchase.id)) throw new Error('Esta compra ya fue registrada.');
  return { ...data, purchases: [purchase, ...data.purchases], stock: data.stock.map(s => s.id === stock.id ? { ...s, quantity: Math.round((s.quantity + purchase.quantity) * 100) / 100 } : s) };
}
export function cancelPurchase(data: Data, id: string): Data {
  const p = data.purchases.find(p => p.id === id);
  if (!p || p.status !== 'Registrada') throw new Error('La compra ya está anulada o no existe.');
  const stock = data.stock.find(s => s.id === p.stock);
  if (!stock || stock.quantity < p.quantity) throw new Error('No se puede anular: el stock actual es menor a la cantidad comprada.');
  return { ...data, purchases: data.purchases.map(item => item.id === id ? { ...item, status: 'Anulada' } : item), stock: data.stock.map(s => s.id === p.stock ? { ...s, quantity: Math.round((s.quantity - p.quantity) * 100) / 100 } : s) };
}
export function cashSummary(data: Data, shift: Shift) {
  const end = new Date(shift.closedAt || new Date().toISOString());
  const sales = data.orders.filter(o => (o.shift ? o.shift === shift.id : o.branch === shift.branch && new Date(o.date) >= new Date(shift.openedAt) && new Date(o.date) <= end) && o.status !== 'Cancelado');
  const cashSales = paymentTotal(sales, 'Efectivo');
  const movements = data.cashMovements.filter(m => m.shift === shift.id);
  const income = movements.filter(m => m.type === 'Ingreso').reduce((s, m) => s + m.amount, 0);
  const expenses = movements.filter(m => m.type === 'Egreso').reduce((s, m) => s + m.amount, 0);
  const expected = shift.closedAt && shift.expected != null ? shift.expected : Math.round((shift.opening + cashSales + income - expenses) * 100) / 100;
  return { cashSales, income, expenses, expected, difference: shift.counted === null ? null : Math.round((shift.counted - expected) * 100) / 100 };
}
export function csvDownload(name: string, headers: string[], rows: (string | number)[][]) {
  // Prefix spreadsheet formula characters; quoting alone does not neutralize CSV formulas.
  const cell = (v: string | number) => `"${(typeof v === 'string' && /^[=+@\-\t\r]/.test(v) ? "'" + v : String(v)).replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob(['\uFEFF' + [headers, ...rows].map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
