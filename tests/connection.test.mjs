import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapDatabase } from '../lib/supabase/mapping.ts';
import { planMutation } from '../lib/supabase/operations.ts';
import { initialData } from '../lib/data.ts';
import { cashSummary, paymentTotal } from '../lib/business.ts';
import { effectivePrice, isChickenCategory, photoExtension, productDetails } from '../lib/products.ts';

function tables() {
  return Object.fromEntries(['sucursales','perfiles','personal_operativo','categorias','productos','insumos','proveedores','compras','stock_snacks','comunicados','pagos_personal','movimientos_financieros','turnos_caja','movimientos_caja','pedidos','detalle_pedido','pagos_pedido','configuracion'].map(k => [k, []]));
}

test('Pollos conserva las presas al cambiar precios y valida las ofertas', () => {
  const p = { price: 16, category: 'Pollos', onSale: true, salePrice: 14, pieceType: 'leg_thigh', requiresChoices: true, sortOrder: 2 };
  assert.equal(effectivePrice(p), 14);
  assert.equal(effectivePrice({ ...p, onSale: false }), 16);
  assert.equal(productDetails({ ...p, price: 19 }).tipo_presas, 'leg_thigh');
  assert.equal(productDetails(p).requiere_seleccion, true);
  assert.equal(productDetails({ ...p, category: 'Bebidas' }).requiere_seleccion, false);
  assert.equal(isChickenCategory(' Pollo '), true);
  for (const invalid of [{ salePrice: 16 }, { salePrice: 0 }, { price: NaN }, { sortOrder: 1.5 }, { pieceType: 'cualquiera' }]) assert.throws(() => productDetails({ ...p, ...invalid }));
  assert.equal(photoExtension(new Uint8Array([255,216,255,0]), 'image/jpeg'), 'jpg');
  assert.throws(() => photoExtension(new TextEncoder().encode('<svg>'), 'image/png'));
});

test('el adaptador recupera fotografía, oferta, descripción y orden guardados', () => {
  const t = tables();
  t.perfiles = [{ id: 'admin', nombre: 'Alexis' }]; t.configuracion = [{ id: 1 }];
  t.categorias = [{ id: 'c', nombre: 'Pollos', activa: true }];
  t.productos = [{ id: 'a', nombre: 'Segundo', categoria_id: 'c', precio: '20', orden: 2 }, { id: 'b', nombre: 'Primero', categoria_id: 'c', precio: '16', precio_oferta: '14', en_oferta: true, descripcion: 'Pierna o contra', orden: 1, foto_path: 'b/foto.jpg', requiere_seleccion: true, tipo_presas: 'leg_thigh' }];
  const [first] = mapDatabase(t, 'admin').products;
  assert.equal(first.id, 'b'); assert.equal(first.salePrice, 14); assert.equal(first.photoPath, 'b/foto.jpg');
  assert.equal(first.description, 'Pierna o contra'); assert.equal(first.requiresChoices, true); assert.equal(first.pieceType, 'leg_thigh');
});
test('mapea una base real vacía sin inyectar datos demo', () => {
  const t = tables();
  t.perfiles = [{ id: 'admin', nombre: 'Alexis', rol: 'Administrador', activo: true }];
  t.configuracion = [{ id: 1, nombre: 'Pollos Roly' }];
  t.categorias = [{ id: 'snack', nombre: 'Snacks', activa: true }];
  const data = mapDatabase(t, 'admin');
  assert.equal(data.profile.name, 'Alexis');
  assert.equal(data.currentUserId, 'admin');
  assert.deepEqual(data.categories, ['Snacks']);
  assert.deepEqual(data.products, []);
  assert.deepEqual(data.orders, []);
  assert.deepEqual(data.branches, []);
});
test('pagos mixtos suman cada importe y el arqueo usa el turno real', () => {
  const t = tables();
  t.perfiles = [{ id: 'admin', nombre: 'Alexis' }];
  t.configuracion = [{ id: 1, nombre: 'Roly' }];
  t.pedidos = [{ id: 'pedido', numero: 12, sucursal_id: 'b1', turno_id: 'turno', cliente: 'Cliente', estado: 'Entregado', total: '40.00', created_at: '2026-10-28T02:00:00Z' }];
  t.pagos_pedido = [{ pedido_id: 'pedido', metodo: 'Efectivo', monto: '25.00' }, { pedido_id: 'pedido', metodo: 'QR', monto: '15.00' }];
  t.detalle_pedido = [{ pedido_id: 'pedido', nombre_producto: 'Hamburguesa', cantidad: 2 }];
  const data = mapDatabase(t, 'admin');
  assert.equal(data.orders[0].ticket, 'R-0012');
  assert.equal(data.orders[0].payment, 'Mixto');
  assert.equal(data.orders[0].items, '2 × Hamburguesa');
  assert.equal(paymentTotal(data.orders, 'Efectivo'), 25);
  assert.equal(paymentTotal(data.orders, 'QR'), 15);
  assert.equal(cashSummary(data, { id: 'turno', branch: 'b1', opening: 100, openedAt: '2026-10-27T00:00:00Z', closedAt: null, counted: null }).expected, 125);
  assert.equal(cashSummary(data, { id: 'otro-turno', branch: 'b1', opening: 10, openedAt: '2026-10-27T00:00:00Z', closedAt: null, counted: null }).expected, 10);
});
test('cierres usan la fotografía guardada en Supabase', () => {
  const data = initialData();
  const result = cashSummary(data, { id: 'cerrado', branch: 'b1', opening: 10, openedAt: '2026-10-27T00:00:00Z', closedAt: '2026-10-27T23:59:59Z', expected: 75, counted: 74 });
  assert.equal(result.expected, 75);
  assert.equal(result.difference, -1);
});
test('compra se envía como una operación, sin escribir stock dos veces', () => {
  const before = initialData();
  const after = structuredClone(before);
  after.purchases.push({ id: 'purchase', supplier: 's1', stock: 'i1', quantity: 5, unitCost: 10, branch: 'b1', status: 'Registrada' });
  after.stock[0].quantity += 5;
  const op = planMutation(before, after);
  assert.equal(op.collection, 'purchases');
  assert.equal(op.create, true);
  assert.equal(op.record.quantity, 5);
});
test('planifica ediciones y rechaza borrados o cambios múltiples', () => {
  const before = initialData();
  const edited = structuredClone(before);
  edited.products[0].price = 100;
  assert.equal(planMutation(before, edited).create, false);
  edited.products[1].price = 200;
  assert.throws(() => planMutation(before, edited), /un registro a la vez/);
  const removed = structuredClone(before);
  removed.products.pop();
  assert.throws(() => planMutation(before, removed), /borrados/);
});

test('crea una categoría independiente sin crear productos', () => {
  const before = initialData();
  const after = structuredClone(before);
  after.categoryRecords = [{ id: 'category-id', name: 'Postres', active: true }];
  const op = planMutation(before, after);
  assert.equal(op.collection, 'categories');
  assert.equal(op.create, true);
  assert.equal(op.record.name, 'Postres');
  assert.deepEqual(after.products, before.products);
});
test('archiva categorías conservando su identidad e historial', () => {
  const before = initialData();
  before.categoryRecords = [{ id: 'category-id', name: 'Postres', active: true }];
  const after = structuredClone(before);
  after.categoryRecords[0].active = false;
  const op = planMutation(before, after);
  assert.equal(op.create, false);
  assert.equal(op.record.id, 'category-id');
  assert.equal(op.record.active, false);
  after.categoryRecords = [];
  assert.throws(() => planMutation(before, after), /Archívala/);
});
test('el adaptador conserva categorías archivadas para poder reactivarlas', () => {
  const t = tables();
  t.perfiles = [{id:'admin', nombre:'Administrador'}];
  t.configuracion = [{id:1,nombre:'Roly'}];
  t.categorias = [{id:'a',nombre:'Pollos',activa:true},{id:'b',nombre:'Postres',activa:false}];
  const data = mapDatabase(t,'admin');
  assert.deepEqual(data.categories,['Pollos']);
  assert.equal(data.categoryRecords.length,2);
  assert.equal(data.categoryRecords.find(c=>c.id==='b').active,false);
});
