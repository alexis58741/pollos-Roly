'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Camera, Check, Pencil, Plus, Power, Printer, Search, Trash2, X } from 'lucide-react';
import { BeverageStock, Data, localDate, Purchase, Shift, StaffPayment, SystemUser } from '../lib/data';
import { cashSummary, csvDownload, paymentTotal } from '../lib/business';
import { matchesPeriod } from '../lib/admin-selectors';
import PurchaseEditor from './PurchaseEditor';
import AddSystemUser from './AddSystemUser';
import StaffPaymentEditor from './StaffPaymentEditor';
import EmployeeFaceEnrollment from './EmployeeFaceEnrollment';
import { groupPurchases, purchaseTotal } from '../lib/purchases';
import type { Mutation } from '../lib/supabase/operations';

type Props = { section: string; data: Data; saving: boolean; update: (next: Data, message: string) => Promise<boolean>; mutate: (operation: Mutation, message: string) => Promise<boolean>; refresh: () => Promise<void>; notify: (message: string) => void; mutationError: string; clearMutationError: () => void; createUser: (values: {name:string;surname:string;phone:string;email:string;password:string;role:string;branch:string}) => Promise<{ok:boolean;error?:string;message?:string}>; deleteUser: (id: string) => Promise<{ok:boolean;error?:string}>; saveEmployeeFace: (id: string, descriptor: number[], consent: boolean) => Promise<{ok:boolean;error?:string}> };
type Collection = 'suppliers' | 'notices' | 'users' | 'employees' | 'staffPayments' | 'finances' | 'snackStocks' | 'beverageStocks' | 'purchases' | 'shifts' | 'cashMovements' | 'closeShift';
type Field = { key: string; label: string; type?: string; options?: { value: string; label: string }[]; required?: boolean; value?: string | number; min?: number; max?: number; step?: number };
type Editor = { collection: Collection; id?: string; values: Record<string, string | number | boolean | null>; title: string };
const money = (n: number) => `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const options = (values: string[]) => values.map(value => ({ value, label: value }));
const methods = options(['Efectivo', 'QR', 'Tarjeta']);
const labels: Record<string, string> = { proveedores: 'proveedor', comunicados: 'aviso', empleados: 'usuario del sistema', 'personal-operativo': 'empleado', 'pagos-personal': 'pago', 'finanzas-personales': 'movimiento', snacks: 'existencia', bebidas: 'stock de bebidas', compras: 'compra' };
const collections: Record<string, Collection> = { proveedores: 'suppliers', comunicados: 'notices', empleados: 'users', 'personal-operativo': 'employees', 'pagos-personal': 'staffPayments', 'finanzas-personales': 'finances', snacks: 'snackStocks', bebidas: 'beverageStocks', compras: 'purchases' };

export default function AdminModules({ section, data, saving, update, mutate, notify, refresh, mutationError, clearMutationError, createUser, deleteUser, saveEmployeeFace }: Props) {
  const [query, setQuery] = useState('');
  const [branch, setBranch] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(localDate());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [formError, setFormError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createUserBusy, setCreateUserBusy] = useState(false);
  const [createUserError, setCreateUserError] = useState('');
  const [userToDelete, setUserToDelete] = useState<SystemUser | null>(null);
  const [deleteUserBusy, setDeleteUserBusy] = useState(false);
  const [deleteUserError, setDeleteUserError] = useState('');
  const [employeeToEnroll, setEmployeeToEnroll] = useState<Data['employees'][number] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (editor) dialog.current?.showModal(); else dialog.current?.close(); }, [editor]);
  const branchOptions = data.branches.map(b => ({ value: b.id, label: b.name }));
  const branchName = (id: string) => id === 'all' ? 'Todas las sucursales' : data.branches.find(b => b.id === id)?.name || 'Sin sucursal';
  const employeeName = (id: string) => data.employees.find(e => e.id === id)?.name || 'Personal sin registrar';
  const productName = (id: string) => data.products.find(p => p.id === id)?.name || 'Producto sin registrar';
  const stockName = (id: string) => data.stock.find(s => s.id === id)?.name || 'Insumo sin registrar';
  const supplierName = (id: string) => id ? data.suppliers.find(s => s.id === id)?.name || 'Proveedor sin registrar' : 'Sin proveedor / Varios';
  const scoped = (r: { branch?: string; date?: string }) => {
    return (branch === 'all' || !r.branch || r.branch === 'all' || r.branch === branch) && matchesPeriod(r.date, from, to);
  };
  const search = (cells: React.ReactNode[]) => cells.map(c => typeof c === 'object' ? '' : String(c)).join(' ').toLowerCase().includes(query.toLowerCase());
  const field = (key: string, label: string, type = 'text', required = true): Field => ({ key, label, type, required });
  const amount = (key = 'amount', label = 'Monto (Bs)', min = .01): Field => ({ ...field(key, label, 'number'), min, max: 10000000 });
  const select = (key: string, label: string, values: Field['options']): Field => ({ key, label, options: values, required: true });
  const branchField = select('branch', 'Sucursal', branchOptions);
  const dateField = { ...field('date', 'Fecha', 'date'), value: localDate() };
  function open(collection: Collection, title: string, values: object = {}, id?: string) {
    if (collection === 'purchases') { clearMutationError(); setPurchaseOpen(true); return; }
    setFormError(''); clearMutationError(); setEditor({ collection, title, id, values: { branch: branch === 'all' ? data.branches[0]?.id || '' : branch, active: true, date: localDate(), ...values } as Editor['values'] });
  }
  function fields(): Field[] {
    switch (editor?.collection) {
      case 'suppliers': return [field('name', 'Nombre o razón social'), field('contact', 'Persona de contacto', 'text', false), field('phone', 'Teléfono', 'tel', false), field('nit', 'NIT', 'text', false), field('active', 'Proveedor activo', 'checkbox', false)];
      case 'notices': return [field('title', 'Título'), field('body', 'Mensaje', 'textarea'), select('branch', 'Destinatarios', [{ value: 'all', label: 'Todas las sucursales' }, ...branchOptions]), select('priority', 'Prioridad', options(['Normal', 'Importante', 'Urgente'])), dateField, field('active', 'Aviso publicado', 'checkbox', false)];
      case 'users': return [field('name', 'Nombre completo'), field('email', 'Correo de contacto', 'email'), select('role', 'Rol de acceso', options(['Administrador', 'Cajero'])), { ...branchField, options: [{value: '', label: 'Sin asignar'}, ...branchOptions], required: false }, field('active', 'Usuario activo', 'checkbox', false)];
      case 'employees': return [field('name', 'Nombre completo'), select('role', 'Puesto', options(['Supervisor', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza'])), branchField, field('phone', 'Teléfono', 'tel', false), field('active', 'Empleado activo', 'checkbox', false)];
      case 'finances': return [select('type', 'Tipo de movimiento', options(['Ingreso', 'Egreso'])), branchField, amount(), field('category', 'Categoría'), field('description', 'Descripción', 'textarea'), dateField, select('method', 'Método de pago', methods)];
      case 'snackStocks': return [select('product', 'Producto del menú (categoría Snacks)', data.products.filter(p => p.category.trim().toLowerCase() === 'snacks').map(p => ({ value: p.id, label: p.name }))), branchField, amount('quantity', 'Cantidad actual (unidades)', 0), amount('minimum', 'Stock mínimo (unidades)', 0)];
      case 'beverageStocks': return [select('product', 'Bebida del menú', data.products.filter(p => p.category.trim().toLowerCase() === 'bebidas').map(p => ({ value: p.id, label: p.name }))), branchField, { ...amount('freezer', 'Cantidad en freezer', 0), step: 1 }, { ...amount('warehouse', 'Cantidad en almacén', 0), step: 1 }, { ...amount('minimum', 'Mínimo en freezer (unidades)', 0), step: 1 }];
      case 'shifts': return [branchField, select('cashier', 'Responsable de caja', [{ value: data.currentUserId || '', label: `${data.profile.name} (tu sesión)` }]), amount('opening', 'Fondo inicial en efectivo (Bs)', 0), field('notes', 'Observaciones', 'textarea', false)];
      case 'cashMovements': return [select('type', 'Tipo', options(['Ingreso', 'Egreso'])), amount(), field('concept', 'Concepto')];
      case 'closeShift': return [amount('counted', 'Efectivo contado al cierre (Bs)', 0), field('notes', 'Observaciones de cierre', 'textarea', false)];
      default: return [];
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editor) return;
    try {
      const values: Record<string, unknown> = {};
      const form = new FormData(e.currentTarget);
      for (const f of fields()) {
        const v = f.type === 'checkbox' ? form.has(f.key) : String(form.get(f.key) ?? '').trim();
        if (f.required && v === '') throw new Error(`Completa ${f.label}.`);
        values[f.key] = f.type === 'number' ? Number(v) : v;
        if (f.type === 'number' && (!Number.isFinite(values[f.key]) || Number(v) < (f.min ?? 0))) throw new Error(`Revisa ${f.label}.`);
      }
      let next = data;
      const id = editor.id || crypto.randomUUID();
      const row: Record<string, unknown> & { id: string } = { id, ...values };
      if (editor.collection === 'closeShift') {
        const shift = data.shifts.find(s => s.id === editor.id && !s.closedAt);
        if (!shift) throw new Error('Este turno ya está cerrado.');
        next = { ...data, shifts: data.shifts.map(s => s.id === id ? { ...s, counted: Number(values.counted), notes: String(values.notes), closedAt: new Date().toISOString() } : s) };
      } else if (editor.collection === 'cashMovements') {
        const shift = data.shifts.find(s => s.id === editor.values.shift && !s.closedAt);
        if (!shift) throw new Error('Abre un turno antes de registrar movimientos.');
        if (values.type === 'Egreso' && Number(values.amount) > cashSummary(data, shift).expected) throw new Error('El egreso supera el efectivo disponible.');
        next = { ...data, cashMovements: [{ ...row, shift: shift.id, date: new Date().toISOString() } as Data['cashMovements'][number], ...data.cashMovements] };
      } else if (editor.collection === 'shifts') {
        if (data.shifts.some(s => s.branch === values.branch && s.cashier === data.currentUserId && !s.closedAt)) throw new Error('Ya tienes un turno abierto en esta sucursal. Ciérralo antes de abrir otro.');
        next = { ...data, shifts: [{ ...row, openedAt: new Date().toISOString(), closedAt: null, counted: null } as Shift, ...data.shifts] };
      } else {
        if (editor.collection === 'users' && data.users.some(u => u.id !== id && u.email.toLowerCase() === String(values.email).toLowerCase())) throw new Error('Ya existe un usuario con ese correo.');
        if (editor.collection === 'snackStocks') {
          if (!Number.isInteger(values.quantity) || !Number.isInteger(values.minimum)) throw new Error('Las existencias de snacks se registran en unidades enteras.');
          if (data.snackStocks.some(s => s.id !== id && s.product === values.product && s.branch === values.branch)) throw new Error('Este producto ya tiene existencias en esa sucursal. Edita el registro existente.');
        }
        if (editor.collection === 'beverageStocks') {
          if (![values.freezer, values.warehouse, values.minimum].every(value => Number.isInteger(value) && Number(value) >= 0)) throw new Error('Las cantidades de bebidas deben ser números enteros desde cero.');
          const existing = data.beverageStocks.find(s => s.product === values.product && s.branch === values.branch);
          const stock = { ...row, id: existing?.id || crypto.randomUUID() } as BeverageStock;
          next = { ...data, beverageStocks: existing ? data.beverageStocks.map(s => s.id === existing.id ? stock : s) : [stock, ...data.beverageStocks] };
        } else {
          const key = editor.collection;
          next = { ...data, [key]: editor.id ? data[key].map(item => item.id === id ? row : item) : [row, ...data[key]] } as Data;
        }
      }
      if (await update(next, 'Registro guardado correctamente')) setEditor(null);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo guardar el registro.'); }
  }
  async function saveStaffPayment(record: Omit<StaffPayment, 'id'>) {
    if (!editor || editor.collection !== 'staffPayments') return false;
    setFormError(''); clearMutationError();
    const id = editor.id || crypto.randomUUID();
    const payment: StaffPayment = { id, ...record };
    const payments = editor.id ? data.staffPayments.map(item => item.id === id ? payment : item) : [payment, ...data.staffPayments];
    const ok = await update({ ...data, staffPayments: payments }, editor.id ? 'Pago actualizado correctamente' : 'Pago registrado correctamente');
    if (ok) setEditor(null);
    return ok;
  }
  async function confirmDeleteUser() {
    if (!userToDelete || deleteUserBusy) return;
    setDeleteUserBusy(true); setDeleteUserError('');
    try {
      const result = await deleteUser(userToDelete.id);
      if (!result.ok) { setDeleteUserError(result.error || 'No se pudo eliminar la cuenta.'); return; }
      setUserToDelete(null);
      await refresh();
      notify(`Cuenta de ${userToDelete.name} eliminada.`);
    } catch (error) {
      setDeleteUserError(error instanceof Error ? error.message : 'No se pudo eliminar la cuenta.');
    } finally { setDeleteUserBusy(false); }
  }
  async function toggleSystemUser(user: SystemUser) {
    if (user.id === data.currentUserId || saving) return;
    await update(
      { ...data, users: data.users.map(item => item.id === user.id ? { ...item, active: !item.active } : item) },
      user.active ? 'Usuario desactivado' : 'Usuario activado',
    );
  }
  async function toggleEmployee(employee: Data['employees'][number]) {
    if (saving) return;
    await update({ ...data, employees: data.employees.map(item => item.id === employee.id ? { ...item, active: !item.active } : item) }, employee.active ? 'Empleado desactivado' : 'Empleado activado');
  }
  type Row = { id: string; cells: React.ReactNode[]; raw: (string | number)[]; record?: object; editable?: boolean };
  let headers: string[] = [];
  let rows: Row[] = [];
  if (section === 'proveedores') { headers = ['Proveedor', 'Contacto', 'Teléfono', 'NIT', 'Estado']; rows = data.suppliers.map(s => ({ id: s.id, cells: [s.name, s.contact || '—', s.phone || '—', s.nit || '—', s.active ? 'Activo' : 'Inactivo'], raw: [s.name, s.contact, s.phone, s.nit, s.active ? 'Activo' : 'Inactivo'], record: s })); }
  if (section === 'snacks') { headers = ['Producto', 'Sucursal', 'Existencias', 'Mínimo', 'Estado']; rows = data.snackStocks.filter(scoped).map(s => ({ id: s.id, cells: [productName(s.product), branchName(s.branch), s.quantity, s.minimum, <span key="status" className={`badge ${s.quantity <= s.minimum ? 'warning' : 'success'}`}>{s.quantity <= s.minimum ? 'Stock bajo' : 'Disponible'}</span>], raw: [productName(s.product), branchName(s.branch), s.quantity, s.minimum, s.quantity <= s.minimum ? 'Stock bajo' : 'Disponible'], record: s })); }
  if (section === 'bebidas') {
    headers = ['Bebida', 'Sucursal', 'Freezer', 'Almacén', 'Total', 'Mínimo freezer', 'Estado'];
    const drinks = data.products.filter(p => p.category.trim().toLowerCase() === 'bebidas');
    const branches = data.branches.filter(b => branch === 'all' ? b.active : b.id === branch);
    rows = drinks.flatMap(product => branches.map(branchRow => {
      const existing = data.beverageStocks.find(stock => stock.product === product.id && stock.branch === branchRow.id);
      const stock: BeverageStock = existing || { id: `${product.id}:${branchRow.id}`, product: product.id, branch: branchRow.id, freezer: 0, warehouse: 0, minimum: 0 };
      const total = stock.freezer + stock.warehouse;
      return { id: stock.id, cells: [product.name, branchRow.name, stock.freezer, stock.warehouse, total, stock.minimum, <span key="status" className={`badge ${stock.freezer <= stock.minimum ? 'warning' : 'success'}`}>{stock.freezer <= stock.minimum ? (total === 0 ? 'Sin existencias' : 'Reponer freezer') : 'Disponible'}</span>], raw: [product.name, branchRow.name, stock.freezer, stock.warehouse, total, stock.minimum, stock.freezer <= stock.minimum ? 'Reponer freezer' : 'Disponible'], record: stock };
    }));
  }
  if (section === 'empleados') { headers = ['Nombre', 'Correo', 'Rol', 'Sucursal', 'Estado']; rows = data.users.filter(scoped).map(u => ({ id: u.id, cells: [u.name, u.email, u.role, branchName(u.branch), u.active ? 'Activo' : 'Inactivo'], raw: [u.name, u.email, u.role, branchName(u.branch), u.active ? 'Activo' : 'Inactivo'], record: u })); }
  if (section === 'personal-operativo') { headers = ['Nombre', 'Puesto', 'Sucursal', 'Teléfono', 'Estado']; rows = data.employees.filter(e => scoped({ branch: e.branch })).filter(e => ['Supervisor','Cocinero','Mesero','Repartidor','Limpieza'].includes(e.role)).map(e => ({ id: e.id, cells: [<span className="employee-name-cell" key="name">{e.name}<button className="edit-button" disabled={!e.active} onClick={() => setEmployeeToEnroll(e)}><Camera size={13}/> Registrar rostro</button></span>, e.role, branchName(e.branch), e.phone || '—', e.active ? 'Activo' : 'Inactivo'], raw: [e.name, e.role, branchName(e.branch), e.phone || '', e.active ? 'Activo' : 'Inactivo'], record: e })); }
  if (section === 'compras') { headers = ['Fecha', 'Comprobante', 'Proveedor', 'Insumos', 'Sucursal', 'Total', 'Estado']; rows = groupPurchases(data.purchases.filter(scoped)).map(g => ({ id: g.first.id, cells: [g.first.date, g.first.receipt || '—', supplierName(g.first.supplier), g.items.map(p => `${p.quantity} ${data.stock.find(s => s.id === p.stock)?.unit || ''} ${stockName(p.stock)}`).join(' · '), branchName(g.first.branch), money(g.total), g.first.status], raw: [g.first.date, g.first.receipt || '', supplierName(g.first.supplier), g.items.map(p => `${p.quantity} × ${stockName(p.stock)}`).join(' · '), branchName(g.first.branch), g.total, g.first.status], record: g.first, editable: false })); }
  if (section === 'pagos-personal') { headers = ['Fecha', 'Empleado', 'Tipo de pago', 'Sucursal', 'Concepto', 'Monto', 'Estado']; rows = data.staffPayments.filter(scoped).map(p => ({ id: p.id, cells: [p.date, p.employeeName || employeeName(p.employee), p.paymentType || 'Pago Mensual', branchName(p.branch), p.concept, money(p.amount), p.status], raw: [p.date, p.employeeName || employeeName(p.employee), p.paymentType || 'Pago Mensual', branchName(p.branch), p.concept, p.amount, p.status], record: p, editable: p.status !== 'Pagado' })); }
  if (section === 'finanzas-personales') { headers = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Sucursal', 'Método', 'Monto']; rows = data.finances.filter(scoped).map(f => ({ id: f.id, cells: [f.date, f.type, f.category, f.description, branchName(f.branch), f.method, money(f.amount)], raw: [f.date, f.type, f.category, f.description, branchName(f.branch), f.method, f.amount], record: f, editable: false })); }
  rows = rows.filter(r => search(r.raw));
  const dateSections = ['compras', 'pagos-personal', 'finanzas-personales', 'reportes', 'caja'];
  const invalidRange = Boolean(from && to && from > to);
  const filteredShifts = data.shifts.filter(s => scoped({ branch: s.branch, date: s.openedAt }) && branchName(s.branch).toLowerCase().includes(query.toLowerCase()));
  const exportRows = () => { csvDownload(`pollos-roly-${section}-${localDate()}`, headers, rows.map(r => r.raw)); notify('Reporte exportado'); };
  const orders = data.orders.filter(scoped).filter(o => o.status !== 'Cancelado');
  const sales = orders.reduce((s, o) => s + o.total, 0);
  const purchases = purchaseTotal(data.purchases.filter(scoped).filter(p => p.status === 'Registrada'));
  const payroll = data.staffPayments.filter(scoped).filter(p => p.status === 'Pagado').reduce((s, p) => s + p.amount, 0);
  const finance = data.finances.filter(scoped);
  const income = finance.filter(f => f.type === 'Ingreso').reduce((s, f) => s + f.amount, 0);
  const expenses = finance.filter(f => f.type === 'Egreso').reduce((s, f) => s + f.amount, 0);
  const reportExpenseTotal = purchases + payroll + expenses;
  const reportBalance = sales + income - reportExpenseTotal;
  const reportPurchases = groupPurchases(data.purchases.filter(scoped).filter(p => p.status === 'Registrada'));
  const reportPayments = data.staffPayments.filter(scoped);
  const reportFinance = finance;
  const reportShifts = data.shifts.filter(shift => scoped({ branch: shift.branch, date: shift.openedAt }));
  const reportShiftRows = reportShifts.map(shift => {
    const shiftOrders = orders.filter(order => {
      if (order.shift) return order.shift === shift.id;
      const orderTime = new Date(order.date).getTime();
      return order.branch === shift.branch && orderTime >= new Date(shift.openedAt).getTime() && orderTime <= new Date(shift.closedAt || new Date().toISOString()).getTime();
    });
    const summary = cashSummary(data, shift);
    return { id: shift.id, cells: [data.users.find(user => user.id === shift.cashier)?.name || data.profile.name || 'Cajero', branchName(shift.branch), shiftOrders.length, money(shiftOrders.reduce((sum, order) => sum + order.total, 0)), money(summary.cashSales), money(summary.expected), summary.difference === null ? 'Abierto' : money(summary.difference)], raw: [] };
  });
  function table(h: string[], r: Row[], actions = true) {
    return <div className="table-scroll"><table><thead><tr>{h.map(c => <th key={c}>{c}</th>)}{actions && <th>Acciones</th>}</tr></thead><tbody>{r.map(row => <tr key={row.id}>{row.cells.map((c, i) => <td key={i}>{c}</td>)}{actions && <td>{row.editable !== false && <span className={['empleados','personal-operativo'].includes(section) ? 'user-row-actions' : undefined}><button className="edit-button" aria-label={`Editar ${row.raw[0]}`} onClick={() => open(collections[section], `Editar ${labels[section]}`, row.record, row.id)}><Pencil size={14} />Editar</button>{section === 'empleados' && row.id !== data.currentUserId && <><button className={`user-status-toggle ${((row.record as SystemUser).active) ? 'is-active' : 'is-inactive'}`} disabled={saving} onClick={() => toggleSystemUser(row.record as SystemUser)} aria-label={`${(row.record as SystemUser).active ? 'Desactivar' : 'Activar'} cuenta de ${(row.record as SystemUser).name}`}><Power size={14} />{(row.record as SystemUser).active ? 'Desactivar' : 'Activar'}</button><button className="icon-button danger-icon" aria-label={`Eliminar cuenta de ${(row.record as SystemUser).name}`} title="Eliminar cuenta" onClick={() => { setDeleteUserError(''); setUserToDelete(row.record as SystemUser); }}><Trash2 size={16} /></button></>}{section === 'personal-operativo' && <button className={`user-status-toggle ${((row.record as Data['employees'][number]).active) ? 'is-active' : 'is-inactive'}`} disabled={saving} onClick={() => toggleEmployee(row.record as Data['employees'][number])} aria-label={`${(row.record as Data['employees'][number]).active ? 'Desactivar' : 'Activar'} empleado ${String(row.raw[0])}`}><Power size={14} />{(row.record as Data['employees'][number]).active ? 'Desactivar' : 'Activar'}</button>}</span>}{section === 'compras' && (row.record as Purchase).status === 'Registrada' && <button className="edit-button" onClick={() => setConfirmId(row.id)}>Anular</button>}</td>}</tr>)}</tbody></table>{!r.length && <div className="empty-state">Aún no hay registros. Agrega el primero o revisa los filtros.</div>}</div>;
  }
  return <>
    {section !== 'perfil' && <div className="module-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Buscar en este apartado" placeholder="Buscar…" value={query} onChange={e => setQuery(e.target.value)} /></div>{!['proveedores'].includes(section) && <label className="compact-label">Sucursal<select aria-label="Sucursal del apartado" value={branch} onChange={e => setBranch(e.target.value)}><option value="all">Todas las sucursales</option>{branchOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</select></label>}{dateSections.includes(section) && <><label className="compact-label">Desde<input type="date" aria-label="Desde" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} onInput={e => setFrom(e.currentTarget.value)} /></label><label className="compact-label">Hasta<input type="date" aria-label="Hasta" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} onInput={e => setTo(e.currentTarget.value)} /></label></>}{collections[section] && section !== 'empleados' && <button className="button primary" onClick={() => open(collections[section], section === 'compras' ? 'Registrar nueva compra' : `Agregar ${labels[section]}`)}><Plus size={16} />{section === 'compras' ? 'Registrar compra' : `Agregar ${labels[section]}`}</button>}{section === 'empleados' && <><button className="button primary" onClick={() => { setCreateUserError(''); setCreateUserOpen(true); }}> <Plus size={16}/>Nuevo usuario</button><button className="button" onClick={refresh}>Actualizar usuarios</button></>}{section === 'reportes' ? <button className="button primary" disabled={invalidRange} onClick={() => window.print()}><Printer size={16} />Imprimir reporte</button> : rows.length > 0 && <button className="button" disabled={invalidRange} onClick={exportRows}><ArrowDownToLine size={16} />Exportar</button>}</div>}
    {invalidRange && <p className="error-banner" role="alert">La fecha Desde no puede ser posterior a Hasta.</p>}{section === 'empleados' && <div className="info-note">Aquí solo se crean cuentas con acceso al sistema para Administradores y Cajeros. Supervisor, Cocina, Mesero, Repartidor y Limpieza se registran en Empleados; no necesitan usuario ni contraseña.</div>}{section === 'personal-operativo' && <div className="info-note">Registra aquí al personal sin cuenta del sistema. Cada empleado debe tener una plantilla facial registrada desde el botón Registrar rostro para que la tablet pueda identificarlo y marcar su asistencia.</div>}
    {section === 'snacks' && <div className="info-note">Existencias de productos de la categoría <b>Snacks</b>, separadas por sucursal. Crea los productos en <Link href="/admin/menu">Menú</Link> y luego registra sus cantidades aquí.</div>}
    {section === 'bebidas' && <div className="info-note">Aquí aparecen las bebidas creadas en <Link href="/admin/menu">Menú</Link>. Registra las cantidades del freezer y almacén por sucursal; las ventas descuentan primero del freezer y luego del almacén.</div>}
    {section === 'compras' && <div className="info-note">Registra varios insumos en una compra, con proveedor opcional. Al confirmar se actualiza el inventario de la sucursal; al anular se revierte la compra completa. Puedes elegir insumos existentes o escribir uno nuevo.</div>}
    {section === 'finanzas-personales' && <><div className="mini-stats"><Summary label="Otros ingresos" value={money(income)} /><Summary label="Otros egresos" value={money(expenses)} /><Summary label="Balance de movimientos" value={money(income - expenses)} /></div><div className="info-note">Registra ingresos y egresos adicionales. Las compras y los pagos al personal se suman por separado en Reportes; evita volver a ingresarlos aquí.</div></>}
    {section === 'pagos-personal' && <div className="info-note">Los pagos pendientes pueden editarse. Los pagos marcados como Pagado quedan como comprobantes de consulta y se incluyen en Reportes.</div>}
    {collections[section] && section !== 'comunicados' && <section className="panel">{table(headers, rows)}</section>}
    {confirmId && <div className="confirm-bar" role="alert"><span>¿Anular esta compra completa y descontar del inventario todos los insumos recibidos?</span><button className="button" onClick={() => setConfirmId(null)}>Volver</button><button className="button primary" onClick={async () => { try { if (await mutate({ collection: 'purchases', create: false, record: { id: confirmId, status: 'Anulada' } }, 'Compra anulada y stock actualizado')) setConfirmId(null); } catch (e) { notify((e as Error).message); } }}>Confirmar anulación</button></div>}
    {section === 'empleados' && userToDelete && <div className="confirm-bar" role="alert"><span><strong>¿Eliminar la cuenta de {userToDelete.name}?</strong> La cuenta de acceso se eliminará si no tiene actividad vinculada.</span>{deleteUserError && <p className="error-banner user-delete-error" role="alert">{deleteUserError}</p>}<button className="button" disabled={deleteUserBusy} onClick={() => { setUserToDelete(null); setDeleteUserError(''); }}>Cancelar</button><button className="button danger-button" disabled={deleteUserBusy} onClick={confirmDeleteUser}>{deleteUserBusy ? 'Eliminando…' : 'Confirmar eliminación'}</button></div>}
    {section === 'comunicados' && <div className="notices-grid">{data.notices.filter(scoped).filter(n => `${n.title} ${n.body}`.toLowerCase().includes(query.toLowerCase())).map(n => <article className="panel notice-card" key={n.id}><div><span className={`badge ${n.priority === 'Urgente' ? 'warning' : 'success'}`}>{n.priority} · {n.active ? 'Publicado' : 'Archivado'}</span><button className="icon-button" aria-label={`Editar aviso ${n.title}`} onClick={() => open('notices', 'Editar aviso', n, n.id)}><Pencil size={16} /></button></div><h2>{n.title}</h2><p>{n.body}</p><small>{branchName(n.branch)} · {n.date}</small><button className="button" onClick={() => update({ ...data, notices: data.notices.map(item => item.id === n.id ? { ...item, active: !item.active } : item) }, n.active ? 'Aviso archivado' : 'Aviso publicado')}>{n.active ? 'Archivar' : 'Publicar'}</button></article>)}{!data.notices.length && <div className="empty-state">Todavía no tienes avisos. Publica el primero para tu equipo.</div>}</div>}
    {section === 'reportes' && <div className="report-print-area">
      <header className="report-print-heading"><p>POLLOS ROLY · ADMINISTRACIÓN</p><h1>{data.settings.name || 'Pollos Roly'}</h1><span>Reporte operativo · Período: {from || 'Inicio'} — {to || 'Sin fecha límite'} · Sucursal: {branchName(branch)}</span>{(data.settings.address || data.settings.phone) && <small>{[data.settings.address, data.settings.phone].filter(Boolean).join(' · ')}</small>}<small>Generado: {new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</small></header>
      <div className="report-kpis">
        <article className="report-kpi"><span>Ventas generadas</span><strong>{money(sales)}</strong><small>{orders.length} pedidos completados o en curso, cancelados excluidos</small></article>
        <article className="report-kpi"><span>Otros ingresos</span><strong>{money(income)}</strong><small>Ingresos registrados en Finanzas</small></article>
        <article className="report-kpi"><span>Gastos y pagos</span><strong>{money(reportExpenseTotal)}</strong><small>Compras {money(purchases)} · Personal {money(payroll)} · Otros egresos {money(expenses)}</small></article>
        <article className="report-kpi report-kpi-balance"><span>Balance operativo</span><strong>{money(reportBalance)}</strong><small>Ventas + ingresos − compras − nómina pagada − otros egresos</small></article>
      </div>
      <p className="report-disclaimer">Resumen de movimientos registrados. El balance operativo no calcula costo de mercadería consumida ni equivale a utilidad contable. Los movimientos de caja se muestran para conciliación y no se suman otra vez al balance.</p>
      <ReportBlock number="01" title="Caja operativa por cajero">{table(['Cajero', 'Sucursal', 'Transacciones', 'Ventas', 'Cobrado en efectivo', 'Efectivo esperado', 'Diferencia'], reportShiftRows, false)}</ReportBlock>
      <ReportBlock number="02" title="Ventas registradas">{table(['Ticket', 'Fecha', 'Cliente', 'Sucursal', 'Detalle', 'Método de pago', 'Estado', 'Total'], orders.map(order => ({ id: order.id, cells: [order.ticket || `#${order.id.slice(0, 8)}`, new Date(order.date).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }), order.customer || 'Cliente general', branchName(order.branch), order.items || '—', order.payments?.length && order.payments.length > 1 ? 'Pago mixto' : order.payment, order.status, money(order.total)], raw: [] })), false)}</ReportBlock>
      <ReportBlock number="03" title="Pagos al personal">{table(['Fecha', 'Empleado / tipo', 'Sucursal', 'Período', 'Concepto / observaciones', 'Método / estado', 'Monto'], reportPayments.map(p => ({ id: p.id, cells: [p.date, <>{p.employeeName || employeeName(p.employee)}<small className="report-cell-detail">{p.paymentType || 'Pago mensual'}</small></>, branchName(p.branch), p.period || '—', <>{p.concept || '—'}{p.observations && <small className="report-cell-detail">{p.observations}</small>}</>, <>{p.method || '—'}<small className="report-cell-detail">{p.status}</small></>, money(p.amount)], raw: [] })), false)}</ReportBlock>
      <ReportBlock number="04" title="Compras y gastos de insumos">{table(['Fecha', 'Comprobante', 'Proveedor', 'Detalle de insumos', 'Sucursal', 'Monto', 'Estado'], reportPurchases.map(group => ({ id: group.id, cells: [group.first.date, group.first.receipt || '—', supplierName(group.first.supplier), group.items.map(item => `${item.quantity} ${data.stock.find(stock => stock.id === item.stock)?.unit || ''} ${stockName(item.stock)}`).join(' · '), branchName(group.first.branch), money(group.total), group.first.status], raw: [] })), false)}</ReportBlock>
      <ReportBlock number="05" title="Otros ingresos y egresos">{table(['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Sucursal', 'Método', 'Monto'], reportFinance.map(item => ({ id: item.id, cells: [item.date, item.type, item.category || '—', item.description || '—', branchName(item.branch), item.method || '—', money(item.amount)], raw: [] })), false)}</ReportBlock>
      <ReportBlock number="06" title="Movimientos de caja del período">{table(['Fecha', 'Cajero', 'Sucursal', 'Tipo', 'Concepto', 'Monto'], data.cashMovements.filter(m => reportShifts.some(shift => shift.id === m.shift) && scoped({ branch: data.shifts.find(shift => shift.id === m.shift)?.branch, date: m.date })).map(m => { const shift = data.shifts.find(item => item.id === m.shift); return { id: m.id, cells: [new Date(m.date).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }), data.users.find(user => user.id === shift?.cashier)?.name || data.profile.name, branchName(shift?.branch || ''), m.type, m.concept, money(m.amount)], raw: [] }; }), false)}</ReportBlock>
      <ReportBlock number="07" title="Ventas por método de pago">{table(['Método', 'Pedidos', 'Recaudación'], methods.map(m => ({ id: m.value, cells: [m.label, orders.filter(o => (o.payments || [{method:o.payment,amount:o.total}]).some(p => p.method === m.value)).length, money(paymentTotal(orders, m.value))], raw: [] })), false)}</ReportBlock>
      <ReportBlock number="08" title="Resumen por sucursal">{table(['Sucursal', 'Pedidos', 'Ventas'], data.branches.filter(b => branch === 'all' || b.id === branch).map(b => ({ id: b.id, cells: [b.name, orders.filter(o => o.branch === b.id).length, money(orders.filter(o => o.branch === b.id).reduce((sum, o) => sum + o.total, 0))], raw: [] })), false)}</ReportBlock>
    </div>}    {section === 'caja' && <><div className="info-note">Cada cajero puede tener un turno abierto en la sucursal. El esperado incluye fondo inicial, ventas en efectivo dentro del turno y movimientos de caja. QR y tarjeta no aumentan el efectivo. Las compras y pagos al personal no generan retiros automáticos.</div><div className="cash-actions"><button className="button primary" onClick={() => open('shifts', 'Abrir turno de caja')}><Plus size={16} />Abrir turno</button></div>{data.shifts.filter(s => !s.closedAt && (branch === 'all' || s.branch === branch)).map(s => { const summary = cashSummary(data, s); return <section className="panel cash-card" key={s.id}><div className="panel-heading"><div><h2>{branchName(s.branch)}</h2><p>Abierto: {new Date(s.openedAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })} · {data.users.find(u => u.id === s.cashier)?.name || data.profile.name}</p></div><span className="badge success">Turno abierto</span></div><div className="mini-stats"><Summary label="Fondo inicial" value={money(s.opening)} /><Summary label="Ventas en efectivo" value={money(summary.cashSales)} /><Summary label="Ingresos / egresos" value={`${money(summary.income)} / ${money(summary.expenses)}`} /><Summary label="Efectivo esperado" value={money(summary.expected)} /></div><div className="cash-actions"><button className="button" onClick={() => open('cashMovements', 'Registrar movimiento de caja', { shift: s.id })}>Registrar ingreso / egreso</button><button className="button primary" onClick={() => open('closeShift', 'Cerrar turno', { notes: s.notes }, s.id)}>Cerrar turno</button></div>{table(['Fecha', 'Tipo', 'Concepto', 'Monto'], data.cashMovements.filter(m => m.shift === s.id).map(m => ({ id: m.id, cells: [new Date(m.date).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }), m.type, m.concept, money(m.amount)], raw: [] })), false)}</section>; })}<section className="panel report-secondary"><div className="panel-heading"><h2>Historial de turnos</h2><button className="button" disabled={invalidRange} onClick={() => { csvDownload('pollos-roly-caja', ['Sucursal', 'Apertura', 'Cierre', 'Esperado', 'Contado', 'Diferencia'], filteredShifts.map(s => [branchName(s.branch), s.openedAt, s.closedAt || 'Abierto', cashSummary(data, s).expected, s.counted ?? '', cashSummary(data, s).difference ?? ''])); notify('Historial exportado'); }}><ArrowDownToLine size={15} />Exportar caja</button></div>{table(['Sucursal', 'Apertura', 'Estado', 'Esperado', 'Contado', 'Diferencia'], filteredShifts.map(s => ({ id: s.id, cells: [branchName(s.branch), new Date(s.openedAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }), s.closedAt ? 'Cerrado' : 'Abierto', money(cashSummary(data, s).expected), s.counted === null ? '—' : money(s.counted), cashSummary(data, s).difference === null ? '—' : money(cashSummary(data, s).difference!)], raw: [] })), false)}</section></>}
    {section === 'perfil' && <form className="panel settings-panel" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); update({ ...data, profile: { name: String(f.get('name')).trim(), surname: String(f.get('surname')).trim(), email: String(f.get('email')).trim(), phone: String(f.get('phone')).trim() } }, 'Perfil guardado'); }}><div className="panel-heading"><div><h2>Mis datos</h2><p>Datos de tu perfil de administrador en Supabase.</p></div></div><div className="settings-fields">{[{ key: 'name', label: 'Nombre', type: 'text', required: true }, { key: 'surname', label: 'Apellido', type: 'text' }, { key: 'email', label: 'Correo de contacto', type: 'email' }, { key: 'phone', label: 'Teléfono', type: 'tel' }].map(f => <label key={f.key}>{f.label}<input name={f.key} type={f.type} required={f.required} maxLength={150} defaultValue={data.profile[f.key as keyof Data['profile']]} /></label>)}</div><p className="info-note">Este correo es de contacto. El correo de acceso y la contraseña se administran directamente en Supabase Auth.</p><div className="form-footer"><span>Rol: Administrador</span><button className="button primary" type="submit"><Check size={15} />Guardar perfil</button></div></form>}
    {employeeToEnroll && <EmployeeFaceEnrollment key={employeeToEnroll.id} name={employeeToEnroll.name} onClose={() => setEmployeeToEnroll(null)} onSave={(descriptor, consent) => saveEmployeeFace(employeeToEnroll.id, descriptor, consent).then(result => { if (result.ok) notify(`Rostro de ${employeeToEnroll.name} registrado.`); return result; })} />}
    {createUserOpen && <AddSystemUser branches={data.branches} saving={createUserBusy} error={createUserError} cancel={() => setCreateUserOpen(false)} submit={async values => { setCreateUserBusy(true); setCreateUserError(''); try { const result=await createUser(values); if(!result.ok){setCreateUserError(result.error||'No se pudo crear el usuario.');return false;} await refresh(); notify(result.message||'Usuario creado correctamente.'); return true;} finally {setCreateUserBusy(false);} }} />}
    {purchaseOpen && <PurchaseEditor data={data} initialBranch={branch} error={mutationError} clearError={clearMutationError} cancel={() => setPurchaseOpen(false)} save={draft => mutate({ collection: 'purchaseDocuments', create: true, record: { ...draft } }, 'Compra registrada e inventario actualizado')} />}
    <dialog ref={dialog} className={`modal ${editor?.collection === 'staffPayments' ? 'staff-payment-modal' : ''}`} aria-labelledby="module-dialog-title" onCancel={() => setEditor(null)} onClick={e => { if (e.target === e.currentTarget) setEditor(null); }}><div className="modal-heading"><h2 id="module-dialog-title">{editor?.collection === 'staffPayments' ? <span className="staff-payment-title"><Plus size={20} />{editor.id ? 'Editar Pago' : 'Registrar Nuevo Pago'}</span> : editor?.title}</h2><button className="icon-button" aria-label="Cerrar formulario" onClick={() => setEditor(null)}><X size={20} /></button></div>{editor?.collection === 'staffPayments' ? <StaffPaymentEditor key={`${editor.id || 'new-staff-payment'}-${editor.collection}`} data={data} payment={editor.id ? editor.values as unknown as StaffPayment : undefined} saving={saving} error={formError || mutationError} cancel={() => setEditor(null)} save={saveStaffPayment} /> : editor && <form key={`${editor.collection}-${editor.id || 'new'}`} className="entity-form" onSubmit={save}>{fields().map(f => <label key={f.key} className={f.type === 'checkbox' ? 'checkbox-label' : ''}>{f.type !== 'checkbox' && f.label}{f.options ? <select name={f.key} required={f.required} defaultValue={String(editor.values[f.key] ?? f.options[0]?.value ?? '')}><option value="" disabled>Selecciona una opción</option>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : f.type === 'textarea' ? <textarea name={f.key} rows={4} required={f.required} maxLength={2000} defaultValue={String(editor.values[f.key] ?? '')} /> : f.type === 'checkbox' ? <><input type="checkbox" name={f.key} defaultChecked={Boolean(editor.values[f.key])} />{f.label}</> : <input name={f.key} type={f.type || 'text'} required={f.required} min={f.min} max={f.max} maxLength={200} step={f.type === 'number' ? f.step ?? '.01' : undefined} defaultValue={String(editor.values[f.key] ?? f.value ?? '')} />}</label>)}{(formError || mutationError) && <p className="error-banner" role="alert">{formError || mutationError}</p>}<div className="modal-footer"><button type="button" className="button" onClick={() => setEditor(null)}>Cancelar</button><button className="button primary" type="submit"><Check size={15} />Guardar</button></div></form>}</dialog>
  </>;
}
function Summary({ label, value }: { label: string; value: string }) { return <article className="stat-card"><p className="muted">{label}</p><strong>{value}</strong></article>; }
function ReportBlock({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section className="report-block"><h2 className="report-block-title"><span>{number}</span>{title}</h2>{children}</section>; }
