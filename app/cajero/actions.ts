'use server';

import { revalidatePath } from 'next/cache';
import { requireCashier } from '../../lib/supabase/server';
import { localDate } from '../../lib/data';

export type ChickenCustomization = { piece: 'Pechuga' | 'Ala' | 'Pierna' | 'Contra'; preparation: 'Brasa' | 'Broaster'; accompaniments: ('Arroz' | 'Fideo' | 'Papa')[] };
export type CashierProduct = { id: string; name: string; category: string; price: number; salePrice: number | null; onSale: boolean; photoPath: string; sortOrder: number; snack: boolean; stock: number | null; requiresChoices: boolean; pieceType: 'leg_thigh' | 'breast_wing' | 'all' };
export type CashierOrder = { id: string; ticket: string; customer: string; total: number; payment: string; payments: { method: string; amount: number }[]; status: string; date: string; items: string; lines: { productId: string; name: string; quantity: number; subtotal: number; customizations: ChickenCustomization[] }[] };
export type CashierSnapshot = {
  profileName: string; branchId: string; branchName: string; businessName: string;
  products: CashierProduct[]; shift: { id: string; opening: number; openedAt: string; notes: string } | null;
  todayTotal: number; todayTickets: number; expectedCash: number; recentOrders: CashierOrder[];
};

function customizationLabel(choice: ChickenCustomization) {
  return `${choice.piece} ${choice.preparation}${choice.accompaniments.length ? ` · ${choice.accompaniments.join(', ')}` : ' · Sin acompañamientos'}`;
}

function message(error: { message?: string; code?: string } | null, fallback: string) {
  if (error?.code === '42501') return 'No tienes permiso para esta operación. Confirma que ejecutaste database/11_cajero.sql en Supabase.';
  if (error?.code === 'PGRST202' || error?.code === '42883') return 'Faltan funciones de caja o pedidos. Ejecuta database/11_cajero.sql, database/12_cajero_pedidos.sql, database/13_cajero_pagos_mixtos.sql y database/14_personalizacion_pollo.sql en Supabase.';
  if (error?.code === 'PGRST204' || error?.code === '42703') return 'Falta la columna de personalización del pedido. Ejecuta database/14_personalizacion_pollo.sql en Supabase.';
  return error?.message || fallback;
}

export async function loadCashierData(): Promise<{ data?: CashierSnapshot; error?: string }> {
  try {
    const { db, user, profile } = await requireCashier();
    const [branchResult, settingResult, categoryResult, productResult, shiftResult] = await Promise.all([
      db.from('sucursales').select('id,nombre,activa').eq('id', profile.sucursal_id).maybeSingle(),
      db.from('configuracion').select('nombre').eq('id', 1).maybeSingle(),
      db.from('categorias').select('id,nombre,activa').eq('activa', true),
      db.from('productos').select('id,nombre,categoria_id,precio,precio_oferta,en_oferta,foto_path,orden,activo,requiere_seleccion,tipo_presas').eq('activo', true).order('orden').order('nombre'),
      db.from('turnos_caja').select('id,fondo_inicial,apertura,observaciones').eq('sucursal_id', profile.sucursal_id).is('cierre', null).maybeSingle(),
    ]);
    for (const result of [branchResult, settingResult, categoryResult, productResult, shiftResult]) if (result.error) throw new Error(message(result.error, 'No se pudieron cargar los datos del cajero.'));
    if (!profile.sucursal_id) throw new Error('Tu usuario cajero no tiene una sucursal asignada. Pide al administrador que la asigne desde Usuarios del Sistema.');
    if (!branchResult.data) throw new Error('No se pudo consultar tu sucursal. Ejecuta database/11_cajero.sql en Supabase y confirma que tu usuario tenga asignada esa sucursal.');
    if (!branchResult.data.activa) throw new Error('La sucursal asignada está inactiva. Pide al administrador que la active.');
    const categories = new Map((categoryResult.data || []).map(c => [String(c.id), String(c.nombre)]));
    const { data: snackRows, error: snackError } = await db.from('stock_snacks').select('producto_id,cantidad').eq('sucursal_id', profile.sucursal_id);
    if (snackError) throw new Error(message(snackError, 'No se pudo consultar el stock de snacks.'));
    const snacks = new Map((snackRows || []).map(s => [String(s.producto_id), Number(s.cantidad)]));
    const products: CashierProduct[] = (productResult.data || []).flatMap(p => {
      const category = categories.get(String(p.categoria_id));
      if (!category) return [];
      const snack = category.trim().toLowerCase() === 'snacks';
      return [{ id: String(p.id), name: String(p.nombre), category, price: Number(p.precio), salePrice: p.precio_oferta == null ? null : Number(p.precio_oferta), onSale: p.en_oferta === true, photoPath: String(p.foto_path || ''), sortOrder: Number(p.orden || 1), snack, stock: snack ? snacks.get(String(p.id)) ?? 0 : null, requiresChoices: p.requiere_seleccion === true, pieceType: (p.tipo_presas || 'all') as CashierProduct['pieceType'] }];
    });

    const dayStart = `${localDate()}T00:00:00-04:00`;
    let orderQuery = db.from('pedidos').select('id,numero,cliente,total,estado,created_at,turno_id').eq('sucursal_id', profile.sucursal_id).order('created_at', { ascending: false });
    if (shiftResult.data) orderQuery = orderQuery.eq('turno_id', shiftResult.data.id);
    else orderQuery = orderQuery.gte('created_at', dayStart);
    const orderRows: { id: string; numero: number; cliente: string; total: number; estado: string; created_at: string; turno_id: string }[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data: page, error: ordersError } = await orderQuery.range(offset, offset + 499);
      if (ordersError) throw new Error(message(ordersError, 'No se pudieron consultar las ventas del turno.'));
      orderRows.push(...(page || []));
      if (!page || page.length < 500) break;
    }
    const orderIds = (orderRows || []).map(o => String(o.id));
    const [detailResult, paymentResult, movementResult] = await Promise.all([
      orderIds.length ? db.from('detalle_pedido').select('pedido_id,producto_id,nombre_producto,cantidad,subtotal,personalizacion').in('pedido_id', orderIds) : Promise.resolve({ data: [], error: null }),
      orderIds.length ? db.from('pagos_pedido').select('pedido_id,metodo,monto').in('pedido_id', orderIds) : Promise.resolve({ data: [], error: null }),
      shiftResult.data ? db.from('movimientos_caja').select('tipo,monto').eq('turno_id', shiftResult.data.id) : Promise.resolve({ data: [], error: null }),
    ]);
    if (detailResult.error || paymentResult.error || movementResult.error) throw new Error(message(detailResult.error || paymentResult.error || movementResult.error, 'No se pudo cargar el resumen de caja.'));
    const details = new Map<string, { productId: string; name: string; quantity: number; subtotal: number; customizations: ChickenCustomization[] }[]>();
    for (const item of detailResult.data || []) details.set(String(item.pedido_id), [...(details.get(String(item.pedido_id)) || []), { productId: String(item.producto_id), name: String(item.nombre_producto), quantity: Number(item.cantidad), subtotal: Number(item.subtotal), customizations: Array.isArray(item.personalizacion) ? item.personalizacion as ChickenCustomization[] : [] }]);
    const payments = new Map<string, { method: string; amount: number }[]>();
    for (const payment of paymentResult.data || []) payments.set(String(payment.pedido_id), [...(payments.get(String(payment.pedido_id)) || []), { method: String(payment.metodo), amount: Number(payment.monto) }]);
    const orders = orderRows || [];
    const cashSales = orders.filter(o => o.estado !== 'Cancelado' && (!shiftResult.data || o.turno_id === shiftResult.data.id)).reduce((sum, o) => sum + (payments.get(String(o.id)) || []).filter(p => p.method === 'Efectivo').reduce((sub, p) => sub + p.amount, 0), 0);
    const movementBalance = (movementResult.data || []).reduce((sum, m) => sum + (m.tipo === 'Ingreso' ? Number(m.monto) : -Number(m.monto)), 0);
    const recentOrders: CashierOrder[] = orders.map(o => {
      const orderPayments = payments.get(String(o.id)) || [];
      const uniqueMethods = [...new Set(orderPayments.map(p => p.method))];
      const lines = details.get(String(o.id)) || [];
      return { id: String(o.id), ticket: `R-${String(o.numero).padStart(4, '0')}`, customer: String(o.cliente), total: Number(o.total), payment: uniqueMethods.length > 1 ? 'Mixto' : uniqueMethods[0] || '—', payments: orderPayments, status: String(o.estado), date: String(o.created_at), items: lines.map(line => `${line.quantity} × ${line.name}${line.customizations.length ? ` (${line.customizations.map(customizationLabel).join('; ')})` : ''}`).join(' · '), lines };
    });
    return { data: {
      profileName: [profile.nombre, profile.apellido].filter(Boolean).join(' ').trim() || user.email || 'Cajero',
      branchId: String(branchResult.data.id), branchName: String(branchResult.data.nombre), businessName: String(settingResult.data?.nombre || 'Pollos Roly'),
      products, shift: shiftResult.data ? { id: String(shiftResult.data.id), opening: Number(shiftResult.data.fondo_inicial), openedAt: String(shiftResult.data.apertura), notes: String(shiftResult.data.observaciones || '') } : null,
      todayTotal: orders.filter(o => o.estado !== 'Cancelado').reduce((sum, o) => sum + Number(o.total), 0), todayTickets: orders.filter(o => o.estado !== 'Cancelado').length,
      expectedCash: Number(shiftResult.data?.fondo_inicial || 0) + cashSales + movementBalance,
      recentOrders,
    } };
  } catch (error) { return { error: error instanceof Error ? error.message : 'No se pudo cargar el espacio del cajero.' }; }
}

async function reload() {
  revalidatePath('/cajero');
  return loadCashierData();
}

export async function openCashierShift(input: { opening: number; notes: string }) {
  try {
    const { db, profile } = await requireCashier();
    const opening = Number(input.opening);
    if (!Number.isFinite(opening) || opening < 0 || Math.round(opening * 100) !== opening * 100) return { ok: false as const, error: 'Escribe un fondo inicial válido.' };
    const { error } = await db.rpc('abrir_turno', { p_sucursal: profile.sucursal_id, p_fondo: opening, p_observaciones: String(input.notes || '').slice(0, 1000) });
    if (error) return { ok: false as const, error: message(error, 'No se pudo abrir la caja.') };
    return { ok: true as const, result: await reload() };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'No se pudo abrir la caja.' }; }
}

export async function registerCashierSale(input: { shiftId: string; customer: string; items: { productId: string; quantity: number; customizations?: ChickenCustomization[] }[]; payments: { method: string; amount: number }[] }) {
  try {
    const { db, profile } = await requireCashier();
    if (!/^[0-9a-f-]{36}$/i.test(input.shiftId) || !Array.isArray(input.items) || !input.items.length || input.items.length > 100) return { ok: false as const, error: 'Revisa el pedido antes de registrarlo.' };
    const payments = input.payments.map(payment => ({ metodo: payment.method, monto: Number(payment.amount.toFixed(2)) }));
    if (!payments.length || payments.length > 3 || payments.some(payment => !['Efectivo', 'QR', 'Tarjeta'].includes(payment.metodo) || !Number.isFinite(payment.monto) || payment.monto <= 0) || new Set(payments.map(payment => payment.metodo)).size !== payments.length) return { ok: false as const, error: 'Revisa los métodos y montos del pago.' };
    const items = input.items.map(item => ({ producto_id: item.productId, cantidad: Number(item.quantity), personalizacion: item.customizations || [] }));
    if (items.some(item => !/^[0-9a-f-]{36}$/i.test(item.producto_id) || !Number.isInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > 100000)) return { ok: false as const, error: 'Hay una cantidad de producto inválida.' };
    const { data: prices, error: priceError } = await db.from('productos').select('id,precio,precio_oferta,en_oferta, categoria:categorias!inner(activa)').in('id', items.map(i => i.producto_id)).eq('activo', true).eq('categoria.activa', true);
    if (priceError || !prices || prices.length !== items.length) return { ok: false as const, error: message(priceError, 'No se pudo validar el total del pedido.') };
    const total = items.reduce((sum, item) => {
      const row = prices.find(p => p.id === item.producto_id);
      if (!row) return sum;
      const price = row.en_oferta === true && row.precio_oferta != null ? Number(row.precio_oferta) : Number(row.precio);
      return sum + price * item.cantidad;
    }, 0);
    if (Math.round(payments.reduce((sum, payment) => sum + payment.monto, 0) * 100) !== Math.round(total * 100)) return { ok: false as const, error: 'La suma de los métodos de pago debe ser igual al total del pedido.' };
    const result = await db.rpc('registrar_pedido', { p_turno: input.shiftId, p_cliente: String(input.customer || '').trim().slice(0, 160), p_items: items, p_pagos: payments });
    if (result.error) return { ok: false as const, error: message(result.error, 'No se pudo registrar la venta.') };
    return { ok: true as const, orderId: String(result.data), result: await reload() };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'No se pudo registrar la venta.' }; }
}

export async function updateCashierOrder(input: { orderId: string; customer: string; items: { productId: string; quantity: number; customizations?: ChickenCustomization[] }[]; payments: { method: string; amount: number }[] }) {
  try {
    const { db } = await requireCashier();
    if (!/^[0-9a-f-]{36}$/i.test(input.orderId) || !Array.isArray(input.items) || !input.items.length || input.items.length > 100) return { ok: false as const, error: 'Revisa el pedido antes de guardarlo.' };
    const payments = input.payments.map(payment => ({ metodo: payment.method, monto: Number(payment.amount.toFixed(2)) }));
    if (!payments.length || payments.length > 3 || payments.some(payment => !['Efectivo', 'QR', 'Tarjeta'].includes(payment.metodo) || !Number.isFinite(payment.monto) || payment.monto <= 0) || new Set(payments.map(payment => payment.metodo)).size !== payments.length) return { ok: false as const, error: 'Revisa los métodos y montos del pago.' };
    const items = input.items.map(item => ({ producto_id: item.productId, cantidad: Number(item.quantity), personalizacion: item.customizations || [] }));
    if (items.some(item => !/^[0-9a-f-]{36}$/i.test(item.producto_id) || !Number.isInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > 100000)) return { ok: false as const, error: 'Hay una cantidad de producto inválida.' };
    const { error } = await db.rpc('actualizar_pedido_cajero_mixto', { p_pedido: input.orderId, p_cliente: String(input.customer || '').trim().slice(0, 160), p_items: items, p_pagos: payments });
    if (error) return { ok: false as const, error: message(error, 'No se pudo actualizar el pedido.') };
    return { ok: true as const, orderId: input.orderId, result: await reload() };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'No se pudo actualizar el pedido.' }; }
}

export async function cancelCashierOrder(orderId: string) {
  try {
    const { db } = await requireCashier();
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return { ok: false as const, error: 'Pedido inválido.' };
    const { error } = await db.rpc('anular_pedido_cajero', { p_pedido: orderId });
    if (error) return { ok: false as const, error: message(error, 'No se pudo anular el pedido.') };
    return { ok: true as const, result: await reload() };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'No se pudo anular el pedido.' }; }
}

export async function registerCashierMovement(input: { shiftId: string; type: string; amount: number; concept: string }) {
  try {
    const { db } = await requireCashier();
    const amount = Number(input.amount);
    if (!/^[0-9a-f-]{36}$/i.test(input.shiftId) || !['Ingreso', 'Egreso'].includes(input.type) || !Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100 || !input.concept.trim()) return { ok: false as const, error: 'Completa el tipo, un monto válido y el concepto.' };
    const { error } = await db.rpc('registrar_movimiento_caja', { p_turno: input.shiftId, p_tipo: input.type, p_monto: amount, p_concepto: input.concept.trim().slice(0, 200) });
    if (error) return { ok: false as const, error: message(error, 'No se pudo registrar el movimiento.') };
    return { ok: true as const, result: await reload() };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'No se pudo registrar el movimiento.' }; }
}

export async function closeCashierShift(input: { shiftId: string; counted: number; notes: string }) {
  try {
    const { db } = await requireCashier();
    const counted = Number(input.counted);
    if (!/^[0-9a-f-]{36}$/i.test(input.shiftId) || !Number.isFinite(counted) || counted < 0 || Math.round(counted * 100) !== counted * 100) return { ok: false as const, error: 'Escribe el efectivo contado correctamente.' };
    const { error } = await db.rpc('cerrar_turno', { p_turno: input.shiftId, p_contado: counted, p_observaciones: String(input.notes || '').slice(0, 1000) });
    if (error) return { ok: false as const, error: message(error, 'No se pudo cerrar la caja.') };
    return { ok: true as const, result: await reload() };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'No se pudo cerrar la caja.' }; }
}
