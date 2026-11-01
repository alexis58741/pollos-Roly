'use server';
import { requireAdmin } from '../../lib/supabase/server';
import { DbRow, mapDatabase, Tables } from '../../lib/supabase/mapping';
import type { Mutation } from '../../lib/supabase/operations';
import type { Data } from '../../lib/data';
import { MAX_PHOTO_SIZE, photoExtension, productDetails } from '../../lib/products';
import { validatePurchaseDraft } from '../../lib/purchases';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const tables = ['sucursales','perfiles','personal_operativo','categorias','productos','insumos','proveedores','compras','stock_snacks','stock_bebidas','comunicados','pagos_personal','movimientos_financieros','turnos_caja','movimientos_caja','pedidos','detalle_pedido','pagos_pedido','configuracion'];
type Client = Awaited<ReturnType<typeof requireAdmin>>['db'];
async function readData(db: Client, userId: string) {
  const entries = await Promise.all(tables.map(async table => {
    const rows: DbRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from(table).select('*').order('id').range(offset, offset + 999);
      if (error) throw new Error(`No se pudo cargar ${table}. ${friendly(error)}`);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return [table, rows] as const;
  }));
  return mapDatabase(Object.fromEntries(entries) as Tables, userId);
}
function friendly(error: { message?: string; code?: string }) {
  if (error.code === '23505') return 'Ya existe un registro con esos datos. Actualiza la pantalla antes de volver a guardar.';
  if (error.code === '42501') return 'No tienes permiso para esta operación. Comprueba tu perfil de administrador.';
  if (error.code === '42P01' || error.code === 'PGRST205') return 'Falta instalar el inventario de bebidas. Ejecuta database/15_inventario_bebidas.sql en Supabase y actualiza los datos.';
  if (error.code === '23503') return 'El registro relacionado ya no existe. Actualiza la pantalla.';
  if (error.code === '42703' || error.code === 'PGRST204') return 'Falta actualizar los productos. Ejecuta database/03_productos_pollos.sql en el SQL Editor de Supabase y actualiza los datos.';
  return error.message || 'No se pudo conectar con la base de datos.';
}
export async function loadAdminData(): Promise<{ data?: Data; error?: string }> {
  try { const { db, user } = await requireAdmin(); return { data: await readData(db, user.id) }; }
  catch (error) { return { error: error instanceof Error ? error.message : 'No se pudieron cargar los datos.' }; }
}

export type AttendanceRecord = { id: string; employeeId: string; name: string; role: string; branch: string; timestamp: string; exitTimestamp: string | null };

export async function loadAttendanceRecords(date: string): Promise<{ records?: AttendanceRecord[]; error?: string }> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error('Selecciona una fecha válida.');
    const { db } = await requireAdmin();
    const { data: entries, error } = await db.from('asistencias').select('id,empleado_id,registrada_en,salida_en').eq('fecha', date).order('registrada_en', { ascending: false });
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') throw new Error('Falta configurar la asistencia. Ejecuta database/06_asistencia.sql y database/07_asistencia_biometrica.sql en Supabase.');
      if (error.code === '42703' || error.code === 'PGRST204') throw new Error('Falta el campo de hora de salida. Ejecuta database/08_salida_asistencia.sql en Supabase.');
      throw new Error(error.code === '42501' ? 'Supabase no permite consultar las asistencias desde el administrador. Revisa las políticas del script 06.' : error.message);
    }
    if (!entries?.length) return { records: [] };
    const ids = [...new Set(entries.map(entry => entry.empleado_id))];
    const { data: profiles, error: profilesError } = await db.from('perfiles').select('id,nombre,apellido,rol,sucursal_id').in('id', ids);
    if (profilesError) throw new Error(profilesError.message);
    const byId = new Map((profiles || []).map(profile => [profile.id, profile]));
    return { records: entries.map(entry => {
      const profile = byId.get(entry.empleado_id);
      return {
        id: entry.id,
        employeeId: entry.empleado_id,
        name: profile ? [profile.nombre, profile.apellido].filter(Boolean).join(' ').trim() || 'Sin nombre' : 'Usuario sin perfil',
        role: profile?.rol || '—',
        branch: profile?.sucursal_id || '',
        timestamp: entry.registrada_en,
        exitTimestamp: entry.salida_en || null,
      };
    }) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudieron cargar las asistencias.' };
  }
}

export async function createSystemUser(input: { name: string; surname: string; phone: string; email: string; password: string; role: string; branch: string }): Promise<{ ok: boolean; data?: Data; error?: string; message?: string }> {
  try {
    const { db, user } = await requireAdmin();
    const clean = (value: unknown, max: number, label: string, required = false) => {
      if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`Revisa ${label}.`);
      return value.trim();
    };
    const name = clean(input.name, 100, 'el nombre', true);
    const surname = clean(input.surname, 100, 'el apellido', true);
    const phone = clean(input.phone, 30, 'el teléfono');
    const email = clean(input.email, 254, 'el correo', true).toLowerCase();
    const password = clean(input.password, 128, 'la contraseña', true);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo válido.');
    if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    if (!['Administrador','Supervisor','Cajero','Cocinero','Mesero','Repartidor','Limpieza'].includes(input.role)) throw new Error('Selecciona un rol permitido.');
    const branch = clean(input.branch, 36, 'la sucursal');
    if (branch && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branch)) throw new Error('Selecciona una sucursal válida.');
    if (branch) {
      const { data: branchRow, error } = await db.from('sucursales').select('id').eq('id', branch).eq('activa', true).maybeSingle();
      if (error || !branchRow) throw new Error('La sucursal está inactiva o no existe.');
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Falta la URL o la clave pública de Supabase.');
    // Cliente aislado y sin persistencia: el alta no reemplaza la sesión del administrador.
    const auth = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: created, error: authError } = await auth.auth.signUp({ email, password, options: { data: { nombre: name } } });
    if (authError) {
      if (authError.message.toLowerCase().includes('already registered')) throw new Error('Ese correo ya tiene una cuenta.');
      throw new Error(authError.message);
    }
    if (!created.user) throw new Error('Supabase no confirmó la creación de la cuenta.');
    const { error: profileError } = await db.from('perfiles').update({ nombre: name, apellido: surname, telefono: phone, correo_contacto: email, rol: input.role, sucursal_id: branch || null, activo: true }).eq('id', created.user.id).select('id').single();
    if (profileError) throw new Error(`La cuenta se creó en Auth, pero no se pudo guardar el rol. Actualiza usuarios y edita el perfil. ${friendly(profileError)}`);
    return { ok: true, data: await readData(db, user.id), message: created.user.identities?.length === 0 ? 'Cuenta creada.' : 'Usuario creado. Si Supabase solicita confirmar el correo, recibirá un enlace para activar su acceso.' };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'No se pudo crear el usuario.' }; }
}

export async function saveAdminMutation(op: Mutation, photoForm?: FormData): Promise<{ ok: boolean; data?: Data; error?: string; warning?: string }> {
  let committed = false;
  try {
    const { db, user } = await requireAdmin();
    if (!op || !op.record || typeof op.create !== 'boolean') throw new Error('Operación inválida.');
    const r = op.record;
    const str = (key: string, optional = false) => {
      if (typeof r[key] !== 'string' || String(r[key]).length > 2000 || (!optional && !String(r[key]).trim())) throw new Error(`Revisa el campo ${key}.`);
      return String(r[key]).trim();
    };
    const uuid = (key: string, optional = false) => { if (optional && (r[key] === '' || r[key] === null || r[key] === undefined)) return null; const value = str(key); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error(`Selecciona un valor válido para ${key}.`); return value; };
    const num = (key: string, zero = false, integer = false) => { const value = r[key]; if (typeof value !== 'number' || !Number.isFinite(value) || value < (zero ? 0 : .01) || value > 10000000 || (integer && !Number.isInteger(value)) || Math.abs(value * 100 - Math.round(value * 100)) > .000001) throw new Error(`Revisa el monto o cantidad: ${key}.`); return value; };
    const bool = (key: string) => { if (typeof r[key] !== 'boolean') throw new Error(`Revisa ${key}.`); return r[key] as boolean; };
    const choice = (key: string, allowed: string[]) => { const value = str(key); if (!allowed.includes(value)) throw new Error(`Valor no permitido en ${key}.`); return value; };
    const date = (key: string) => { const value = str(key); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new Error('La fecha no es válida.'); return value; };
    const run = async (name: string, args: Record<string, unknown>) => { const { error } = await db.rpc(name, args); if (error) throw new Error(friendly(error)); };
    const write = async (table: string, values: DbRow) => {
      const id = uuid('id');
      const query = op.create ? db.from(table).insert({ id, ...values }) : db.from(table).update(values).eq('id', id);
      const { error } = await query.select('id').single();
      if (error) throw new Error(friendly(error));
    };
    switch (op.collection) {
      case 'categories': {
        const name = str('name'); const active = bool('active');
        if (name.length > 80) throw new Error('El nombre de la categoría debe tener hasta 80 caracteres.');
        if (!op.create) {
          const id = uuid('id');
          const existing = await db.from('categorias').select('nombre').eq('id', id).single();
          if (existing.error) throw new Error(friendly(existing.error));
          if (!active) {
            const linked = await db.from('productos').select('id').eq('categoria_id', id).limit(1);
            if (linked.error) throw new Error(friendly(linked.error));
            if (linked.data.length) throw new Error('Esta categoría tiene productos. Cámbialos de categoría antes de archivarla.');
          }
          if (['snacks', 'bebidas'].includes(existing.data.nombre.trim().toLowerCase()) && name.trim().toLowerCase() !== existing.data.nombre.trim().toLowerCase()) {
            const table = existing.data.nombre.trim().toLowerCase() === 'snacks' ? 'stock_snacks' : 'stock_bebidas';
            const stock = await db.from(table).select('id,productos!inner(categoria_id)').eq('productos.categoria_id', id).limit(1);
            if (stock.error) throw new Error(friendly(stock.error));
            if (stock.data.length) throw new Error('Esta categoría controla existencias. Conserva su nombre mientras tenga inventario asociado.');
          }
        }
        await write('categorias', { nombre: name, activa: active }); break;
      }
      case 'branches': await write('sucursales', { nombre: str('name'), direccion: str('address', true), telefono: str('phone', true), activa: bool('active') }); break;
      case 'products': {
        const id = uuid('id');
        const details = productDetails(r);
        const productName = str('name'); const active = bool('active');
        if (productName.length > 100) throw new Error('El nombre del producto admite hasta 100 caracteres.');
        // Comprobar la migración antes de crear categorías o subir fotografías.
        const existing = await db.from('productos').select('id,foto_path,categoria_id').eq('id', id).maybeSingle();
        if (existing.error) throw new Error(friendly(existing.error));
        if (!op.create && !existing.data) throw new Error('El producto ya no existe. Actualiza los datos.');
        const oldPhoto = existing.data?.foto_path || '';
        if (r.photoPath && r.photoPath !== oldPhoto) throw new Error('La fotografía debe cargarse desde el formulario.');
        let photoPath = r.photoPath ? oldPhoto : '';
        const photo = photoForm?.get('photo');
        let bytes: Uint8Array | undefined; let extension = '';
        if (photo instanceof File && photo.size > 0) {
          if (photo.size > MAX_PHOTO_SIZE) throw new Error('La fotografía debe pesar como máximo 5 MB.');
          bytes = new Uint8Array(await photo.arrayBuffer());
          extension = photoExtension(bytes, photo.type);
        }
        const name = str('category');
        const { data: categories, error } = await db.from('categorias').select('id,nombre,activa');
        if (error) throw new Error(friendly(error));
        let category = categories.find(c => c.nombre.trim().toLowerCase() === name.toLowerCase());
        if (category && !category.activa) throw new Error('La categoría está archivada. Reactívala en el apartado Categorías antes de usarla.');
        if (!category) {
          const inserted = await db.from('categorias').insert({ nombre: name }).select('id,nombre,activa').single();
          if (inserted.error) {
            const retry = await db.from('categorias').select('id,nombre,activa');
            category = retry.data?.find(c => c.nombre.trim().toLowerCase() === name.toLowerCase());
            if (!category) throw new Error(friendly(inserted.error));
          } else category = inserted.data;
        }
        if (!category.activa) throw new Error('La categoría está archivada. Reactívala antes de usarla.');
        if (!op.create && existing.data?.categoria_id !== category.id) {
          const beverageStock = await db.from('stock_bebidas').select('id').eq('producto_id', id).limit(1);
          if (beverageStock.error) throw new Error(friendly(beverageStock.error));
          if (beverageStock.data.length && category.nombre.trim().toLowerCase() !== 'bebidas') throw new Error('Este producto tiene inventario de bebidas. No lo cambies de categoría mientras tenga stock asociado.');
        }
        if (bytes) {
          photoPath = `${id}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await db.storage.from('productos').upload(photoPath, bytes, { contentType: (photo as File).type, upsert: false });
          if (uploadError) throw new Error(`No se pudo subir la fotografía. ${uploadError.message}. Comprueba que ejecutaste 03_productos_pollos.sql.`);
        }
        await write('productos', { nombre: productName, categoria_id: category.id, activo: active, ...details, foto_path: photoPath });
        // Solo retirar la anterior después de confirmar el guardado del producto.
        // Si el resultado de una escritura es incierto, conservar el archivo evita romper una foto guardada.
        if (oldPhoto && oldPhoto !== photoPath) await db.storage.from('productos').remove([oldPhoto]).catch(() => {});
        break;
      }
      case 'stock': await write('insumos', { nombre: str('name'), sucursal_id: uuid('branch'), cantidad: num('quantity', true), minimo: num('minimum', true), unidad: choice('unit', ['unidades','kg','litros','paquetes']) }); break;
      case 'employees': await write('personal_operativo', { nombre: str('name'), rol: choice('role', ['Administrador','Supervisor','Cajero','Cocinero','Mesero','Repartidor','Limpieza']), sucursal_id: uuid('branch'), telefono: str('phone', true), activo: bool('active') }); break;
      case 'suppliers': await write('proveedores', { nombre: str('name'), contacto: str('contact', true), telefono: str('phone', true), nit: str('nit', true), activo: bool('active') }); break;
      case 'snackStocks': await write('stock_snacks', { producto_id: uuid('product'), sucursal_id: uuid('branch'), cantidad: num('quantity', true, true), minimo: num('minimum', true, true) }); break;
      case 'beverageStocks': {
        const productId = uuid('product'); const branchId = uuid('branch');
        const freezer = num('freezer', true, true); const warehouse = num('warehouse', true, true); const minimum = num('minimum', true, true);
        const { data: product, error: productError } = await db.from('productos').select('id,categorias!inner(nombre)').eq('id', productId).maybeSingle();
        if (productError || !product || String((product.categorias as { nombre?: string } | null)?.nombre || '').trim().toLowerCase() !== 'bebidas') throw new Error('Selecciona un producto de la categoría Bebidas.');
        const { data: branchRow, error: branchError } = await db.from('sucursales').select('id').eq('id', branchId).eq('activa', true).maybeSingle();
        if (branchError || !branchRow) throw new Error('Selecciona una sucursal activa.');
        const { error } = await db.from('stock_bebidas').upsert({ producto_id: productId, sucursal_id: branchId, cantidad_freezer: freezer, cantidad_almacen: warehouse, minimo: minimum }, { onConflict: 'producto_id,sucursal_id' });
        if (error) throw new Error(friendly(error));
        break;
      }
      case 'notices': await write('comunicados', { titulo: str('title'), mensaje: str('body'), sucursal_id: r.branch === 'all' ? null : uuid('branch'), prioridad: choice('priority', ['Normal','Importante','Urgente']), publicado: bool('active'), fecha: date('date') }); break;
      case 'users': {
        if (op.create) throw new Error('Crea la cuenta en Supabase → Authentication → Users. Después actualiza esta pantalla para asignarle sucursal y permisos.');
        const id = uuid('id'); const role = choice('role', ['Administrador','Supervisor','Cajero','Cocinero','Mesero','Repartidor','Limpieza']); const active = bool('active');
        if (id === user.id && (role !== 'Administrador' || !active)) throw new Error('No puedes quitarte el acceso de administrador desde tu propia sesión.');
        const { error } = await db.from('perfiles').update({ nombre: str('name'), apellido: '', correo_contacto: str('email'), sucursal_id: uuid('branch', true), rol: role, activo: active }).eq('id', id).select('id').single();
        if (error) throw new Error(friendly(error)); break;
      }
      case 'staffPayments': {
        const schemaCheck = await db.from('pagos_personal').select('nombre_empleado,tipo_pago,observaciones').limit(0);
        if (schemaCheck.error && (schemaCheck.error.code === '42703' || schemaCheck.error.code === 'PGRST204')) throw new Error('Falta actualizar Pagos al Personal. Ejecuta database/10_pago_personal_formulario.sql en Supabase.');
        if (schemaCheck.error) throw new Error(friendly(schemaCheck.error));
        const employeeId = uuid('employee', true);
        const paymentDate = date('date');
        let employeeName = str('employeeName', true);
        let branchId = uuid('branch');
        if (employeeId) {
          const { data: employee, error } = await db.from('personal_operativo').select('nombre,sucursal_id,activo').eq('id', employeeId).maybeSingle();
          if (error || !employee || (op.create && !employee.activo)) throw new Error('Selecciona un empleado activo o escribe su nombre manualmente.');
          employeeName ||= employee.nombre;
          branchId = employee.sucursal_id;
        } else if (!employeeName) throw new Error('Escribe el nombre del empleado.');
        if (employeeName.length > 160) throw new Error('El nombre del empleado admite hasta 160 caracteres.');
        await write('pagos_personal', {
          personal_id: employeeId,
          nombre_empleado: employeeName,
          sucursal_id: branchId,
          tipo_pago: choice('paymentType', ['Pago Diario','Pago Semanal','Pago Quincenal','Pago Mensual','Horas Extra','Bono','Otro']),
          monto: num('amount'),
          concepto: str('concept'),
          observaciones: str('observations', true),
          periodo: `${paymentDate.slice(0, 7)}-01`,
          fecha: paymentDate,
          metodo: choice('method', ['Efectivo','QR','Tarjeta']),
          estado: choice('status', ['Pendiente','Pagado']),
        }); break;
      }
      case 'finances': if (!op.create) throw new Error('Los movimientos contabilizados se corrigen con una contrapartida.'); else { await write('movimientos_financieros', { tipo: choice('type', ['Ingreso','Egreso']), sucursal_id: uuid('branch'), monto: num('amount'), categoria: str('category'), descripcion: str('description'), fecha: date('date'), metodo: choice('method', ['Efectivo','QR','Tarjeta']) }); break; }
      case 'purchases': if (op.create) await run('registrar_compra', { p_proveedor: uuid('supplier'), p_insumo: uuid('stock'), p_cantidad: num('quantity'), p_costo: num('unitCost'), p_fecha: date('date'), p_observaciones: str('notes', true) }); else { if (r.status !== 'Anulada') throw new Error('Una compra registrada solo puede anularse.'); await run('anular_compra', { p_compra: uuid('id') }); } break;
      case 'purchaseDocuments': {
        if (!op.create) throw new Error('Una compra registrada solo puede anularse.');
        const draft = validatePurchaseDraft(r);
        const { error } = await db.rpc('registrar_compra_multiple', { p_documento: draft.id, p_sucursal: draft.branch, p_proveedor: draft.supplier || null, p_comprobante: draft.receipt, p_fecha: draft.date, p_observaciones: draft.notes, p_items: draft.items.map(i => ({ insumo_id: i.stock, nombre: i.name, unidad: i.unit, cantidad: i.quantity, costo_unitario: i.unitCost })) });
        if (error?.code === 'PGRST202' || error?.code === '42883') throw new Error('Falta actualizar Compras. Ejecuta database/04_compras_multiples.sql en el SQL Editor de Supabase y actualiza los datos.');
        if (error) throw new Error(friendly(error));
        break;
      }
      case 'shifts': if (op.create) await run('abrir_turno', { p_sucursal: uuid('branch'), p_fondo: num('opening', true), p_observaciones: str('notes', true) }); else await run('cerrar_turno', { p_turno: uuid('id'), p_contado: num('counted', true), p_observaciones: str('notes', true) }); break;
      case 'cashMovements': if (!op.create) throw new Error('Un movimiento de caja no puede editarse.'); else { await run('registrar_movimiento_caja', { p_turno: uuid('shift'), p_tipo: choice('type', ['Ingreso','Egreso']), p_monto: num('amount'), p_concepto: str('concept') }); break; }
      case 'orders': if (op.create) throw new Error('Los pedidos se registrarán desde el punto de venta.'); else { await run('cambiar_estado_pedido', { p_pedido: uuid('id'), p_estado: choice('status', ['En preparación','Listo para entregar','Entregado','Cancelado']) }); break; }
      case 'profile': await run('actualizar_mi_perfil', { p_nombre: str('name'), p_apellido: str('surname', true), p_telefono: str('phone', true), p_correo_contacto: str('email', true) }); break;
      case 'settings': { const { error } = await db.from('configuracion').update({ nombre: str('name'), telefono: str('phone', true), direccion: str('address', true), mensaje_ticket: str('message', true) }).eq('id', 1).select('id').single(); if (error) throw new Error(friendly(error)); break; }
      default: throw new Error('Operación no permitida.');
    }
    committed = true;
    try { return { ok: true, data: await readData(db, user.id) }; }
    catch { return { ok: true, warning: 'Guardado en Supabase. No se pudo refrescar la pantalla; pulsa Actualizar datos. No repitas el registro.' }; }
  } catch (error) { return { ok: committed, error: error instanceof Error ? error.message : 'No se pudo guardar en Supabase.' }; }
}
