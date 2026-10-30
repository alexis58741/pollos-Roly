import type { Data } from '../data';
export type DbRow = Record<string, unknown>;
export type Tables = Record<string, DbRow[]>;
const s = (r: DbRow, k: string) => String(r[k] ?? '');
const n = (r: DbRow, k: string) => Number(r[k] ?? 0);
const b = (r: DbRow, k: string) => r[k] === true;

export function mapDatabase(t: Tables, userId: string): Data {
  const me = t.perfiles.find(p => p.id === userId);
  if (!me) throw new Error('No se encontró tu perfil de administrador.');
  const setting = t.configuracion[0];
  if (!setting) throw new Error('Falta la configuración inicial. Comprueba el script 01_pollos_roly.sql.');
  const categoryName = (id: unknown) => s(t.categorias.find(c => c.id === id) || {}, 'nombre');
  return {
    currentUserId: userId, categories: t.categorias.filter(c => b(c, 'activa')).map(c => s(c, 'nombre')),
    categoryRecords: t.categorias.map(c => ({ id: s(c, 'id'), name: s(c, 'nombre'), active: b(c, 'activa') })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    profile: { name: s(me, 'nombre').trim() || 'Administrador', surname: s(me, 'apellido'), email: s(me, 'correo_contacto'), phone: s(me, 'telefono') },
    settings: { name: s(setting, 'nombre'), phone: s(setting, 'telefono'), address: s(setting, 'direccion'), message: s(setting, 'mensaje_ticket') },
    branches: t.sucursales.map(r => ({ id: s(r, 'id'), name: s(r, 'nombre'), address: s(r, 'direccion'), phone: s(r, 'telefono'), active: b(r, 'activa') })),
    products: t.productos.map(r => ({ id: s(r, 'id'), name: s(r, 'nombre'), category: categoryName(r.categoria_id), price: n(r, 'precio'), active: b(r, 'activo'), description: s(r, 'descripcion'), salePrice: r.precio_oferta == null ? null : n(r, 'precio_oferta'), onSale: b(r, 'en_oferta'), photoPath: s(r, 'foto_path'), sortOrder: r.orden == null ? 1 : n(r, 'orden'), requiresChoices: b(r, 'requiere_seleccion'), pieceType: (s(r, 'tipo_presas') || 'all') as 'leg_thigh' | 'breast_wing' | 'all' })).sort((a,b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es')),
    stock: t.insumos.map(r => ({ id: s(r, 'id'), name: s(r, 'nombre'), branch: s(r, 'sucursal_id'), quantity: n(r, 'cantidad'), minimum: n(r, 'minimo'), unit: s(r, 'unidad') })),
    employees: t.personal_operativo.map(r => ({ id: s(r, 'id'), name: s(r, 'nombre'), branch: s(r, 'sucursal_id'), role: s(r, 'rol'), phone: s(r, 'telefono'), active: b(r, 'activo') })),
    suppliers: t.proveedores.map(r => ({ id: s(r, 'id'), name: s(r, 'nombre'), contact: s(r, 'contacto'), phone: s(r, 'telefono'), nit: s(r, 'nit'), active: b(r, 'activo') })),
    purchases: t.compras.map(r => ({ id: s(r, 'id'), supplier: s(r, 'proveedor_id'), stock: s(r, 'insumo_id'), branch: s(r, 'sucursal_id'), quantity: n(r, 'cantidad'), unitCost: n(r, 'costo_unitario'), date: s(r, 'fecha'), notes: s(r, 'observaciones'), status: s(r, 'estado') as 'Registrada' | 'Anulada', document: s(r, 'documento_id'), receipt: s(r, 'comprobante') })).sort((a,b) => b.date.localeCompare(a.date)),
    snackStocks: t.stock_snacks.map(r => ({ id: s(r, 'id'), product: s(r, 'producto_id'), branch: s(r, 'sucursal_id'), quantity: n(r, 'cantidad'), minimum: n(r, 'minimo') })),
    notices: t.comunicados.map(r => ({ id: s(r, 'id'), title: s(r, 'titulo'), body: s(r, 'mensaje'), branch: s(r, 'sucursal_id') || 'all', priority: s(r, 'prioridad'), active: b(r, 'publicado'), date: s(r, 'fecha') })),
    users: t.perfiles.map(r => ({ id: s(r, 'id'), name: [s(r, 'nombre'), s(r, 'apellido')].filter(Boolean).join(' '), email: s(r, 'correo_contacto'), branch: s(r, 'sucursal_id'), role: s(r, 'rol'), active: b(r, 'activo') })),
    staffPayments: t.pagos_personal.map(r => ({ id: s(r, 'id'), employee: s(r, 'personal_id'), employeeName: s(r, 'nombre_empleado') || s(t.personal_operativo.find(person => person.id === r.personal_id) || {}, 'nombre'), branch: s(r, 'sucursal_id'), amount: n(r, 'monto'), concept: s(r, 'concepto'), observations: s(r, 'observaciones'), paymentType: s(r, 'tipo_pago') || 'Pago Mensual', period: s(r, 'periodo').slice(0, 7), date: s(r, 'fecha'), method: s(r, 'metodo'), status: s(r, 'estado') })),
    finances: t.movimientos_financieros.map(r => ({ id: s(r, 'id'), type: s(r, 'tipo'), amount: n(r, 'monto'), category: s(r, 'categoria'), description: s(r, 'descripcion'), branch: s(r, 'sucursal_id'), date: s(r, 'fecha'), method: s(r, 'metodo') })),
    shifts: t.turnos_caja.map(r => ({ id: s(r, 'id'), branch: s(r, 'sucursal_id'), cashier: s(r, 'cajero_id'), opening: n(r, 'fondo_inicial'), openedAt: s(r, 'apertura'), closedAt: r.cierre ? s(r, 'cierre') : null, counted: r.efectivo_contado == null ? null : n(r, 'efectivo_contado'), expected: r.efectivo_esperado == null ? null : n(r, 'efectivo_esperado'), notes: s(r, 'observaciones') })),
    cashMovements: t.movimientos_caja.map(r => ({ id: s(r, 'id'), shift: s(r, 'turno_id'), type: s(r, 'tipo'), amount: n(r, 'monto'), concept: s(r, 'concepto'), date: s(r, 'created_at') })),
    orders: t.pedidos.map(r => {
      const payments = t.pagos_pedido.filter(p => p.pedido_id === r.id).map(p => ({ method: s(p, 'metodo'), amount: n(p, 'monto') }));
      return { id: s(r, 'id'), ticket: `R-${s(r, 'numero').padStart(4, '0')}`, shift: s(r, 'turno_id'), customer: s(r, 'cliente'), branch: s(r, 'sucursal_id'), total: n(r, 'total'), payments, payment: payments.length > 1 ? 'Mixto' : payments[0]?.method || 'Sin pago', status: s(r, 'estado'), date: s(r, 'created_at'), items: t.detalle_pedido.filter(d => d.pedido_id === r.id).map(d => `${n(d, 'cantidad')} × ${s(d, 'nombre_producto')}`).join(' · ') };
    }).sort((a, b) => b.date.localeCompare(a.date)),
  };
}
