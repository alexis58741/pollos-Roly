'use server';

import { createClient } from '../../lib/supabase/server';

export type BeverageAlert = { id: string; productId: string; branchId: string; freezer: number; warehouse: number; minimum: number };

async function access() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error('Inicia sesión nuevamente.');
  const { data: profile, error: profileError } = await db.from('perfiles').select('rol,activo,sucursal_id').eq('id', user.id).single();
  if (profileError || !profile?.activo || !['Administrador', 'Cajero'].includes(profile.rol)) throw new Error('No tienes acceso al stock de bebidas.');
  if (profile.rol === 'Cajero' && !profile.sucursal_id) throw new Error('Tu cuenta no tiene sucursal asignada.');
  return { db, profile };
}

export async function loadBeverageAlerts(): Promise<{ alerts?: BeverageAlert[]; error?: string }> {
  try {
    const { db, profile } = await access();
    let query = db.from('stock_bebidas').select('id,producto_id,sucursal_id,cantidad_freezer,cantidad_almacen,minimo');
    if (profile.rol === 'Cajero') query = query.eq('sucursal_id', profile.sucursal_id);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { alerts: (data || []).map(row => ({ id: row.id, productId: row.producto_id, branchId: row.sucursal_id, freezer: Number(row.cantidad_freezer), warehouse: Number(row.cantidad_almacen), minimum: Number(row.minimo) })).filter(row => row.freezer <= row.minimum) };
  } catch (error) { return { error: error instanceof Error ? error.message : 'No se pudo consultar el stock de bebidas.' }; }
}

export async function transferBeverageStock(id: string, quantity: number): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Selecciona una cantidad válida.');
    const { db } = await access();
    const { error } = await db.rpc('reponer_freezer_bebida', { p_stock: id, p_cantidad: quantity });
    if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883' ? 'Ejecuta database/22_reposicion_bebidas.sql en Supabase.' : error.message);
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'No se pudo trasladar la bebida.' }; }
}
