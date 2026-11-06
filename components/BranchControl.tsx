'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Box, CalendarClock, CheckCircle2, ChevronDown, Clock3, Package, RefreshCw, ShoppingBag, Store, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';
import { loadAttendanceRecords, type AttendanceRecord } from '../app/admin/actions';
import { Data, localDate } from '../lib/data';
import type { Mutation } from '../lib/supabase/operations';

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const time = (value?: string | null) => value ? new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const dateToday = localDate();
type BranchStockItem = { name: string; quantity: number; minimum: number; unit: string; group: string; freezer?: number; warehouse?: number };

export default function BranchControl({ data, saving, mutate }: { data: Data; saving: boolean; mutate: (operation: Mutation, message: string) => Promise<boolean> }) {
  const branches = data.branches;
  const [selectedId, setSelectedId] = useState(() => branches.find(branch => branch.active)?.id || branches[0]?.id || '');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceError, setAttendanceError] = useState('');
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ cash: true, sales: true, attendance: true, stock: true });
  const [cashFormShift, setCashFormShift] = useState('');
  const [cashError, setCashError] = useState('');

  const refreshAttendance = useCallback(async () => {
    setAttendanceLoading(true);
    const result = await loadAttendanceRecords(localDate());
    setAttendance(result.records || []);
    setAttendanceError(result.error || '');
    setAttendanceLoading(false);
  }, []);

  useEffect(() => { void refreshAttendance(); }, [refreshAttendance]);
  useEffect(() => {
    if (!branches.some(branch => branch.id === selectedId)) setSelectedId(branches.find(branch => branch.active)?.id || branches[0]?.id || '');
  }, [branches, selectedId]);

  const branchSummaries = useMemo(() => branches.map(branch => {
    const openShifts = data.shifts.filter(shift => shift.branch === branch.id && !shift.closedAt).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    const todayOrders = data.orders.filter(order => order.branch === branch.id && localDate(new Date(order.date)) === dateToday);
    const validOrders = todayOrders.filter(order => order.status !== 'Cancelado');
    const sales = validOrders.reduce((total, order) => total + order.total, 0);
    const items = data.stock.filter(item => item.branch === branch.id).map(item => ({ name: item.name, quantity: item.quantity, minimum: item.minimum, unit: item.unit }));
    const snackItems = data.snackStocks.filter(item => item.branch === branch.id).map(item => ({ name: data.products.find(product => product.id === item.product)?.name || 'Snack', quantity: item.quantity, minimum: item.minimum, unit: 'unid.' }));
    const drinkItems = data.beverageStocks.filter(item => item.branch === branch.id).map(item => ({ name: data.products.find(product => product.id === item.product)?.name || 'Bebida', quantity: item.freezer, minimum: item.minimum, unit: 'unid. en freezer', freezer: item.freezer, warehouse: item.warehouse }));
    const branchAttendance = attendance.filter(record => record.branch === branch.id);
    const activeStaff = data.users.filter(user => user.branch === branch.id && user.active);
    const movements = data.cashMovements.filter(movement => openShifts.some(shift => shift.id === movement.shift)).sort((a, b) => b.date.localeCompare(a.date));
    const openCash = openShifts.map(shift => {
      const shiftOrders = data.orders.filter(order => order.shift === shift.id && order.status !== 'Cancelado');
      const cashSales = shiftOrders.reduce((sum, order) => sum + (order.payments?.length ? order.payments.filter(payment => payment.method.toLowerCase() === 'efectivo').reduce((subtotal, payment) => subtotal + payment.amount, 0) : order.payment.toLowerCase() === 'efectivo' ? order.total : 0), 0);
      const shiftMovements = movements.filter(movement => movement.shift === shift.id);
      const cashIn = shiftMovements.filter(movement => movement.type.toLowerCase().includes('ingreso')).reduce((sum, movement) => sum + movement.amount, 0);
      const cashOut = shiftMovements.filter(movement => movement.type.toLowerCase().includes('egreso')).reduce((sum, movement) => sum + movement.amount, 0);
      return { shift, expected: shift.expected ?? (shift.opening + cashSales + cashIn - cashOut), cashSales, cashIn, cashOut, orderCount: shiftOrders.length, movements: shiftMovements };
    });
    return { branch, openShifts, todayOrders, validOrders, sales, items, snackItems, drinkItems, branchAttendance, activeStaff, movements, openCash, lowCount: [...items, ...snackItems, ...drinkItems].filter(item => item.quantity <= item.minimum).length };
  }), [branches, data, attendance]);

  const selected = branchSummaries.find(item => item.branch.id === selectedId);
  const toggle = (key: string) => setExpanded(current => ({ ...current, [key]: !current[key] }));
  async function registerCashMovement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const shiftId = String(form.get('shift') || '');
    const type = String(form.get('type') || '');
    const amount = Number(form.get('amount'));
    const concept = String(form.get('concept') || '').trim();
    const shift = selected?.openCash.find(item => item.shift.id === shiftId);
    if (!shift || !['Ingreso', 'Egreso'].includes(type) || !Number.isFinite(amount) || amount <= 0 || !concept) { setCashError('Completa tipo, monto y concepto.'); return; }
    if (type === 'Egreso' && amount > shift.expected) { setCashError('El egreso supera el efectivo esperado de la caja.'); return; }
    setCashError('');
    const ok = await mutate({ collection: 'cashMovements', create: true, record: { id: crypto.randomUUID(), shift: shiftId, type, amount, concept, date: new Date().toISOString() } }, `${type} de caja registrado en ${selected?.branch.name || 'la sucursal'}`);
    if (ok) setCashFormShift('');
    else setCashError('No se pudo registrar el movimiento. Revisa el aviso del administrador.');
  }
  const stockItems: BranchStockItem[] = selected ? [
    ...selected.items.map(item => ({ ...item, group: 'Insumo' })),
    ...selected.snackItems.map(item => ({ ...item, group: 'Snack' })),
    ...selected.drinkItems.map(item => ({ ...item, group: 'Bebida', freezer: item.freezer, warehouse: item.warehouse })),
  ] : [];

  return <section className="branch-control" aria-label="Control y monitoreo de sucursales">
    <div className="branch-control-intro"><div><span className="branch-control-kicker"><Activity size={15} /> MONITOREO DEL NEGOCIO</span><h2>Elige una sucursal para revisar su operación</h2><p>Consulta en un solo lugar el turno de caja, ventas de hoy, asistencia e inventario.</p></div><button type="button" className="button" onClick={() => { void refreshAttendance(); }} disabled={attendanceLoading}><RefreshCw size={15} className={attendanceLoading ? 'branch-spin' : ''} />{attendanceLoading ? 'Actualizando…' : 'Actualizar asistencia'}</button></div>

    {!branches.length ? <div className="panel branch-control-empty"><Store size={28} /><h3>Aún no hay sucursales registradas</h3><p>Registra una sucursal para empezar a monitorear su actividad.</p></div> : <>
      <div className="branch-selector" role="list" aria-label="Sucursales registradas">
        {branchSummaries.map(({ branch, openShifts, sales, lowCount }) => <button type="button" role="listitem" key={branch.id} className={`branch-choice ${branch.id === selectedId ? 'is-selected' : ''}`} aria-pressed={branch.id === selectedId} onClick={() => setSelectedId(branch.id)}>
          <span className="branch-choice-icon"><Store size={18} /></span><span className="branch-choice-main"><strong>{branch.name}</strong><small>{branch.active ? 'Activa' : 'Inactiva'} · {openShifts.length ? 'Caja abierta' : 'Caja cerrada'}</small></span><span className="branch-choice-stats"><b>{money(sales)}</b><small>ventas hoy</small></span><span className={`branch-low-dot ${lowCount ? 'has-alert' : ''}`} title={lowCount ? `${lowCount} productos bajo mínimo` : 'Inventario normal'} /></button>)}
      </div>

      {selected && <>
        <header className="branch-detail-header"><div><span className={`branch-live ${selected.branch.active ? 'is-active' : ''}`}><i />{selected.branch.active ? 'Sucursal activa' : 'Sucursal inactiva'}</span><h2>{selected.branch.name}</h2><p>{selected.branch.address || 'Dirección sin registrar'}{selected.branch.phone ? ` · ${selected.branch.phone}` : ''}</p></div><div className="branch-detail-date"><CalendarClock size={16} />{new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'full' }).format(new Date(`${dateToday}T12:00:00-04:00`))}</div></header>

        <div className="branch-kpis">
          <article><span className="branch-kpi-icon red"><ShoppingBag size={18} /></span><div><small>Ventas de hoy</small><strong>{money(selected.sales)}</strong><p>{selected.validOrders.length} pedidos completados</p></div></article>
          <article><span className="branch-kpi-icon amber"><Wallet size={18} /></span><div><small>Estado de caja</small><strong>{selected.openShifts.length ? 'Abierta' : 'Cerrada'}</strong><p>{selected.openShifts.length ? `${selected.openShifts.length} turno(s) activo(s)` : 'Sin turno activo'}</p></div></article>
          <article><span className="branch-kpi-icon blue"><Users size={18} /></span><div><small>Asistencias de hoy</small><strong>{selected.branchAttendance.length}</strong><p>de {selected.activeStaff.length} usuarios activos</p></div></article>
          <article><span className={`branch-kpi-icon ${selected.lowCount ? 'red' : 'green'}`}><Package size={18} /></span><div><small>Inventario bajo</small><strong>{selected.lowCount}</strong><p>{selected.lowCount ? 'Productos en o bajo mínimo' : 'Sin alertas de stock'}</p></div></article>
        </div>

        <div className="branch-control-panels">
          <section className="panel branch-monitor-panel">
            <button type="button" className="branch-panel-toggle" aria-expanded={expanded.cash} onClick={() => toggle('cash')}><span className="branch-panel-icon"><Wallet size={18} /></span><span><strong>Caja y personal atendiendo</strong><small>Turnos abiertos, cajeros y efectivo esperado</small></span><ChevronDown size={18} className={expanded.cash ? 'is-expanded' : ''} /></button>
            {expanded.cash && <div className="branch-panel-content">{selected.openCash.length ? selected.openCash.map(({ shift, expected, cashSales, cashIn, cashOut, orderCount, movements }) => {
              const cashier = data.users.find(user => user.id === shift.cashier) || data.employees.find(employee => employee.id === shift.cashier);
              return <article className="branch-shift-card" key={shift.id}><div className="branch-shift-top"><div><span className="branch-live is-active"><i />Turno abierto</span><h3>{cashier?.name || 'Cajero sin perfil'}</h3><p><Clock3 size={13} /> Abrió a las {time(shift.openedAt)}</p></div><strong className="branch-shift-expected">{money(expected)}<small>Efectivo esperado</small></strong></div><div className="branch-cash-grid"><div><small>Fondo inicial</small><strong>{money(shift.opening)}</strong></div><div><small>Ventas en efectivo</small><strong>{money(cashSales)}</strong></div><div><small>Ingresos</small><strong className="cash-positive"><TrendingUp size={14} />{money(cashIn)}</strong></div><div><small>Egresos</small><strong className="cash-negative"><TrendingDown size={14} />{money(cashOut)}</strong></div><div><small>Pedidos del turno</small><strong>{orderCount}</strong></div></div><button type="button" className="button branch-movement-button" onClick={() => { setCashFormShift(current => current === shift.id ? '' : shift.id); setCashError(''); }}><TrendingUp size={14} />Registrar ingreso / egreso</button>{cashFormShift === shift.id && <form className="branch-cash-form" onSubmit={registerCashMovement}><label>Movimiento<select name="type" defaultValue="Ingreso"><option>Ingreso</option><option>Egreso</option></select></label><label>Monto (Bs.)<input name="amount" type="number" min="0.01" step="0.01" placeholder="0,00" required /></label><label className="branch-cash-concept">Concepto<input name="concept" maxLength={160} placeholder="Ej. Cambio para caja" required /></label><button type="submit" className="button primary" disabled={saving}>Guardar movimiento</button></form>}{cashError && cashFormShift === shift.id && <div className="branch-inline-error" role="alert">{cashError}</div>}{movements.length > 0 && <details className="branch-movements"><summary>Ver movimientos de caja ({movements.length})</summary><div>{movements.slice(0, 8).map(movement => <p key={movement.id}><span>{movement.concept || movement.type}</span><time>{time(movement.date)}</time><strong className={movement.type.toLowerCase().includes('egreso') ? 'cash-negative' : 'cash-positive'}>{movement.type.toLowerCase().includes('egreso') ? '−' : '+'} {money(movement.amount)}</strong></p>)}</div></details>}</article>;
            }) : <div className="branch-empty-inline"><Wallet size={20} /><span>No hay una caja abierta en esta sucursal.</span></div>}</div>}
          </section>

          <section className="panel branch-monitor-panel">
            <button type="button" className="branch-panel-toggle" aria-expanded={expanded.sales} onClick={() => toggle('sales')}><span className="branch-panel-icon"><ShoppingBag size={18} /></span><span><strong>Ventas y pedidos de hoy</strong><small>Registro de actividad de esta sucursal</small></span><ChevronDown size={18} className={expanded.sales ? 'is-expanded' : ''} /></button>
            {expanded.sales && <div className="branch-panel-content"><div className="branch-sales-summary"><span><b>{selected.validOrders.length}</b> pedidos activos/completados</span><strong>{money(selected.sales)}</strong></div>{selected.todayOrders.length ? <div className="branch-orders-list">{[...selected.todayOrders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(order => <article key={order.id}><span className="branch-order-ticket">{order.ticket || order.id}</span><span className="branch-order-description"><strong>{order.customer || 'Cliente de mostrador'}</strong><small>{order.items || 'Sin detalle'} · {time(order.date)}</small></span><span className={`branch-order-status ${order.status === 'Cancelado' ? 'is-cancelled' : ''}`}>{order.status}</span><b>{money(order.total)}</b></article>)}</div> : <div className="branch-empty-inline"><ShoppingBag size={20} /><span>No hay pedidos registrados hoy.</span></div>}</div>}
          </section>

          <section className="panel branch-monitor-panel">
            <button type="button" className="branch-panel-toggle" aria-expanded={expanded.attendance} onClick={() => toggle('attendance')}><span className="branch-panel-icon"><Clock3 size={18} /></span><span><strong>Asistencia del personal</strong><small>Quién marcó su entrada hoy y quién falta</small></span><ChevronDown size={18} className={expanded.attendance ? 'is-expanded' : ''} /></button>
            {expanded.attendance && <div className="branch-panel-content">{attendanceError && <div className="branch-inline-error">No se pudo cargar la asistencia: {attendanceError}</div>}{selected.activeStaff.length ? <div className="branch-attendance-list">{selected.activeStaff.map(user => {
              const record = selected.branchAttendance.find(item => item.employeeId === user.id);
              return <article key={user.id}><span className={`branch-attendance-mark ${record ? 'marked' : ''}`}>{record ? <CheckCircle2 size={17} /> : <Users size={16} />}</span><span><strong>{user.name}</strong><small>{user.role}</small></span>{record ? <span className="branch-attendance-time">Entrada {time(record.timestamp)}{record.exitTimestamp ? ` · Salida ${time(record.exitTimestamp)}` : ' · En turno'}</span> : <span className="branch-attendance-missing">Sin marcar</span>}</article>;
            })}</div> : <div className="branch-empty-inline"><Users size={20} /><span>No hay usuarios activos asignados a esta sucursal.</span></div>}</div>}
          </section>

          <section className="panel branch-monitor-panel">
            <button type="button" className="branch-panel-toggle" aria-expanded={expanded.stock} onClick={() => toggle('stock')}><span className="branch-panel-icon"><Box size={18} /></span><span><strong>Insumos y existencias</strong><small>Insumos, snacks y bebidas; incluye freezer y almacén</small></span><ChevronDown size={18} className={expanded.stock ? 'is-expanded' : ''} /></button>
            {expanded.stock && <div className="branch-panel-content">{stockItems.length ? <div className="branch-stock-list"><div className="branch-stock-head"><span>Artículo</span><span>Existencias</span><span>Mínimo</span><span>Estado</span></div>{stockItems.map((item, index) => <article key={`${item.group}-${item.name}-${index}`}><span><strong>{item.name}</strong><small>{item.group}</small></span><strong>{item.quantity} {item.unit}{item.freezer !== undefined && ` · Freezer ${item.freezer} / Almacén ${item.warehouse ?? 0}`}</strong><span>{item.minimum} {item.unit}</span><span className={`branch-stock-state ${item.quantity <= item.minimum ? 'is-low' : ''}`}>{item.quantity <= item.minimum ? 'Reponer' : 'Disponible'}</span></article>)}</div> : <div className="branch-empty-inline"><Package size={20} /><span>No hay existencias registradas para esta sucursal.</span></div>}</div>}
          </section>
        </div>
      </>}
    </>}
  </section>;
}
