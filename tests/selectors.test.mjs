import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../lib/data.ts';
import { inventoryAlerts, matchesPeriod, matchingBranches } from '../lib/admin-selectors.ts';

test('fechas de ventas usan el día boliviano a ambos lados de medianoche UTC', () => {
  assert.equal(matchesPeriod('2026-10-29T02:00:00Z','2026-10-28','2026-10-28'), true);
  assert.equal(matchesPeriod('2026-10-28T02:00:00Z','2026-10-28','2026-10-28'), false);
  assert.equal(matchesPeriod('2026-10-28','2026-10-28','2026-10-28'), true);
});
test('un rango invertido no incluye registros ni fechas vacías', () => {
  assert.equal(matchesPeriod('2026-10-28','2026-10-29','2026-10-28'), false);
  assert.equal(matchesPeriod(undefined,'2026-10-29','2026-10-28'), false);
});
test('las alertas excluyen sucursales inactivas y snacks pausados', () => {
  const data = initialData();
  data.snackStocks = [{ id:'ss1', product:'p7', branch:'b1', quantity:0, minimum:5 }];
  assert.equal(inventoryAlerts(data).length, 3);
  data.products.find(p => p.id === 'p7').active = false;
  assert.equal(inventoryAlerts(data).length, 2);
  data.branches[0].active = false;
  assert.equal(inventoryAlerts(data).length, 0);
});
test('las alertas respetan la sucursal seleccionada', () => {
  const data = initialData();
  data.branches.push({id:'b2',name:'Otra',active:true,address:'',phone:''});
  data.stock.push({id:'s2',branch:'b2',name:'Papa',quantity:0,minimum:1,unit:'kg'});
  assert.equal(inventoryAlerts(data,'b1').length, 2);
  assert.equal(inventoryAlerts(data,'b2').length, 1);
});
test('la lista de sucursales combina selección y búsqueda', () => {
  const data = initialData();
  data.branches.push({id:'b2',name:'Norte',active:true,address:'',phone:''});
  assert.equal(matchingBranches(data,'b1','').length, 1);
  assert.equal(matchingBranches(data,'b1','Norte').length, 0);
  assert.equal(matchingBranches(data,'all','norte')[0].id, 'b2');
});
