import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialData, hydrateData } from '../lib/data.ts';
import { cancelPurchase, cashSummary, registerPurchase } from '../lib/business.ts';

test('actualiza datos anteriores sin borrar productos ni inventario', () => {
  const old = { products: [{ id: 'real', name: 'Mi producto' }], stock: [], employees: [], branches: [], orders: [], settings: { name: 'Roly' } };
  const migrated = hydrateData(JSON.stringify(old));
  assert.equal(migrated.products[0].name, 'Mi producto');
  assert.deepEqual(migrated.purchases, []);
  assert.equal(migrated.profile.name, 'Administrador');
});
test('compra y anulación conservan inventario sin doble aplicación', () => {
  const data = initialData();
  data.suppliers.push({ id: 's1', name: 'Proveedor', contact: '', phone: '', nit: '', active: true });
  const p = { id: 'c1', supplier: 's1', branch: 'b1', stock: 'i2', quantity: 5, unitCost: 10, date: '2026-10-27', notes: '', status: 'Registrada' };
  const next = registerPurchase(data, p);
  assert.equal(next.stock.find(s => s.id === 'i2').quantity, 13);
  assert.equal(data.stock.find(s => s.id === 'i2').quantity, 8);
  assert.throws(() => registerPurchase(next, p), /ya fue registrada/);
  const reversed = cancelPurchase(next, 'c1');
  assert.equal(reversed.stock.find(s => s.id === 'i2').quantity, 8);
  assert.throws(() => cancelPurchase(reversed, 'c1'), /ya está anulada/);
  next.stock.find(s => s.id === 'i2').quantity = 2;
  assert.throws(() => cancelPurchase(next, 'c1'), /stock actual/);
  assert.throws(() => registerPurchase(data, { ...p, branch: 'otra' }), /misma sucursal/);
});
test('arqueo excluye QR, cancelaciones, otras sucursales y ventas fuera del turno', () => {
  const data = initialData();
  data.orders = [
    { id: '1', branch: 'b1', payment: 'Efectivo', status: 'Entregado', total: 30, date: '2026-10-27T15:00:00Z' },
    { id: '2', branch: 'b1', payment: 'QR', status: 'Entregado', total: 100, date: '2026-10-27T15:00:00Z' },
    { id: '3', branch: 'b2', payment: 'Efectivo', status: 'Entregado', total: 100, date: '2026-10-27T15:00:00Z' },
    { id: '4', branch: 'b1', payment: 'Efectivo', status: 'Cancelado', total: 100, date: '2026-10-27T15:00:00Z' },
    { id: '5', branch: 'b1', payment: 'Efectivo', status: 'Entregado', total: 100, date: '2026-10-27T09:00:00Z' },
  ];
  data.cashMovements = [{ id: 'm1', shift: 't1', type: 'Egreso', amount: 10 }, { id: 'm2', shift: 't2', type: 'Ingreso', amount: 100 }];
  const summary = cashSummary(data, { id: 't1', branch: 'b1', opening: 50, openedAt: '2026-10-27T14:00:00Z', closedAt: '2026-10-27T16:00:00Z', counted: 69 });
  assert.equal(summary.expected, 70);
  assert.equal(summary.difference, -1);
});
