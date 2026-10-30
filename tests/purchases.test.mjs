import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPurchases, purchaseLineTotal, purchaseTotal, validatePurchaseDraft } from '../lib/purchases.ts';

const id = '30000000-0000-0000-0000-000000000001';
const branch = '30000000-0000-0000-0000-000000000002';
const draft = () => ({ id,branch,supplier:'',receipt:'001-492',date:'2026-10-28',notes:'',items:[{stock:null,name:'Tomates',unit:'kg',quantity:3.5,unitCost:2.25},{stock:null,name:'Escoba',unit:'unidades',quantity:2,unitCost:8}] });
test('compra con proveedor opcional y varios insumos valida antes de enviar', () => {
  const value = validatePurchaseDraft(draft());
  assert.equal(value.supplier,''); assert.equal(value.items.length,2);
  for (const bad of [{items:[]},{branch:''},{date:'2026-02-30'},{receipt:'a'.repeat(121)}]) assert.throws(() => validatePurchaseDraft({...draft(),...bad}));
  for (const bad of [{quantity:0},{unitCost:NaN},{unitCost:1.001},{unit:'cajas'},{stock:branch.slice(0,5)},{name:' '}]) {
    const value = draft(); value.items[0] = {...value.items[0],...bad}; assert.throws(() => validatePurchaseDraft(value));
  }
});
test('subtotales redondean por línea igual a PostgreSQL y total suma centavos', () => {
  assert.equal(purchaseLineTotal(3.5,2.25),7.88);
  assert.equal(purchaseLineTotal(.01,100.5),1.01);
  assert.equal(purchaseTotal(draft().items),23.88);
  assert.equal(purchaseTotal([]),0);
});
test('historial agrupa documentos sin mezclar compras antiguas ni contar totales dos veces', () => {
  const lines = [{id:'a',document:'doc',quantity:3.5,unitCost:2.25},{id:'b',document:'doc',quantity:2,unitCost:8},{id:'legacy',quantity:1,unitCost:3}];
  const groups = groupPurchases(lines);
  assert.equal(groups.length,2); assert.equal(groups[0].items.length,2);
  assert.equal(groups[0].total,23.88); assert.equal(groups[1].total,3);
  assert.equal(purchaseTotal(lines),26.88);
});
