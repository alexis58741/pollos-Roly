'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Bell, Check, ChefHat, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, CreditCard, LayoutDashboard, Menu, MoreHorizontal, Package, Pencil, Plus, Search, Settings, ShoppingBag, ShoppingBasket, Store, Users, UtensilsCrossed, Wallet, X } from 'lucide-react';
import { Branch, Category, Data, Employee, localDate, Product, Stock } from '../lib/data';
import MenuCategories from './MenuCategories';
import ProductEditor from './ProductEditor';
import { effectivePrice, productPhotoUrl } from '../lib/products';
import { navigation, advancedSections } from '../lib/navigation';
import AdminModules from './AdminModules';
import { csvDownload, paymentTotal } from '../lib/business';
import { createSystemUser, loadAdminData, saveAdminMutation } from '../app/admin/actions';
import { planMutation, type Mutation } from '../lib/supabase/operations';
import { signOut } from '../app/auth/actions';
import { inventoryAlerts, matchingBranches } from '../lib/admin-selectors';
import AdminAttendance from './AdminAttendance';

const money = (n: number) => `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type Entity = 'products' | 'stock' | 'employees' | 'branches' | 'categoryRecords';
type Modal = { entity: Entity; item?: Product | Stock | Employee | Branch | Category } | null;

export default function AdminApp({ section }: { section: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [branch, setBranch] = useState('all');
  const [period, setPeriod] = useState('today');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [menuView, setMenuView] = useState<'products' | 'categories'>('products');
  const [status, setStatus] = useState('Todos');
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [alerts, setAlerts] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    loadAdminData().then(result => { if (!active) return; if (result.data) setData(result.data); else setLoadError(result.error || 'No se pudieron cargar los datos.'); }).catch(() => { if (active) setLoadError('No se pudo conectar con el servidor.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (modal || selectedOrder) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [modal, selectedOrder]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);
  async function refresh() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try { const result = await loadAdminData(); if (result.data) { setData(result.data); setLoadError(''); setNeedsRefresh(false); setRefreshCount(v => v + 1); setModal(null); setNotice('Datos actualizados desde Supabase'); } else setLoadError(result.error || 'No se pudo actualizar.'); }
    catch { setLoadError('No se pudo conectar con el servidor.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function update(next: Data, message: string, attachment?: { product: Product; photo: FormData } | { operation: Mutation }) {
    if (!data || savingRef.current) return false;
    if (needsRefresh) { setNotice('Actualiza los datos antes de guardar otro cambio.'); return false; }
    setMutationError('');
    let operation;
    try { operation = attachment && 'operation' in attachment ? attachment.operation : attachment ? { collection: 'products', create: !data.products.some(p => p.id === attachment.product.id), record: { ...attachment.product } } : planMutation(data, next); }
    catch (error) {
      const detail = error instanceof Error ? error.message : 'Revisa los cambios.';
      setNotice(detail);
      if (detail === 'No hay cambios para guardar.') return true;
      setMutationError(detail); return false;
    }
    savingRef.current = true; setSaving(true);
    try {
      const result = await saveAdminMutation(operation, attachment && 'photo' in attachment ? attachment.photo : undefined);
      if (!result.ok) { setMutationError(result.error || 'No se pudo guardar.'); setNotice(result.error || 'No se pudo guardar.'); return false; }
      if (result.data) setData(result.data);
      else setNeedsRefresh(true);
      setNotice(result.warning || message); return true;
    } catch { setNeedsRefresh(true); setMutationError('No se pudo confirmar el resultado. Actualiza los datos antes de reintentar para evitar duplicados.'); setNotice('No se pudo confirmar el resultado. Actualiza los datos antes de reintentar para evitar duplicados.'); return false; }
    finally { savingRef.current = false; setSaving(false); }
  }
  if (!data) return <div className="loading"><ChefHat size={42} /><p>{loadError || 'Cargando desde Supabase…'}</p>{loadError && <><button className="button" onClick={refresh}>Reintentar</button><form action={signOut}><button className="button">Volver a iniciar sesión</button></form></>}</div>;
  const current = navigation.find(n => n.id === section)!;
  const branchName = (id: string) => data.branches.find(b => b.id === id)?.name || 'Sin sucursal';
  const inBranch = (item: { branch: string }) => branch === 'all' || item.branch === branch;
  const today = localDate();
  const start = new Date(`${today}T00:00:00-04:00`);
  start.setDate(start.getDate() - (period === 'week' ? 6 : period === 'month' ? 29 : 0));
  const orders = data.orders.filter(o => inBranch(o) && new Date(o.date) >= start && localDate(new Date(o.date)) <= today);
  const completed = orders.filter(o => o.status !== 'Cancelado');
  const revenue = completed.reduce((s, o) => s + o.total, 0);
  const lowStock = inventoryAlerts(data, branch);
  const filteredOrders = orders.filter(o => `${o.ticket || o.id} ${o.customer}`.toLowerCase().includes(query.toLowerCase()) && (status === 'Todos' || o.status === status));
  const categories = [...new Set([...(data.categories || []), ...data.products.map(p => p.category)])];
  const products = data.products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) && (category === 'Todos' || p.category === category));
  const records = section === 'inventario' ? data.stock.filter(inBranch).filter(i => i.name.toLowerCase().includes(query.toLowerCase())) : matchingBranches(data, branch, query);
  const openEntity = section === 'menu' ? 'products' : section === 'inventario' ? 'stock' : 'branches';
  const entityNames: Record<Entity, string> = { products: 'producto', stock: 'insumo', employees: 'integrante', branches: 'sucursal', categoryRecords: 'categoría' };
  function exportOrders() {
    csvDownload(`pollos-roly-ventas-${today}`, ['Pedido', 'Fecha', 'Cliente', 'Sucursal', 'Pago', 'Estado', 'Total Bs'], filteredOrders.map(o => [o.ticket || o.id, o.date, o.customer, branchName(o.branch), o.payment, o.status, o.total]));
    setNotice('Reporte de ventas exportado');
  }
  async function saveEntity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!modal || !data) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    const base = { id: modal.item?.id || crypto.randomUUID(), name: String(values.name).trim() };
    if (!base.name) { setMutationError('El nombre no puede estar vacío ni contener solo espacios.'); return; }
    let item;
    if (modal.entity === 'categoryRecords') item = { ...base, active: values.active === 'on' };
    else if (modal.entity === 'stock') item = { ...base, branch: String(values.branch), quantity: Number(values.quantity), minimum: Number(values.minimum), unit: String(values.unit).trim() };
    else if (modal.entity === 'employees') item = { ...base, role: String(values.role), branch: String(values.branch), phone: String(values.phone).trim(), active: values.active === 'on' };
    else item = { ...base, address: String(values.address).trim(), phone: String(values.phone).trim(), active: values.active === 'on' };
    const list = data[modal.entity] || [];
    const next = { ...data, [modal.entity]: modal.item ? list.map(i => i.id === item.id ? item : i) : [...list, item] };
    if (await update(next, `${entityNames[modal.entity][0].toUpperCase()}${entityNames[modal.entity].slice(1)} guardado correctamente`)) setModal(null);
  }
  const order = data.orders.find(o => o.id === selectedOrder);
  const hours = Array.from({ length: 10 }, (_, i) => i + 10);
  const amounts = hours.map(h => completed.filter(o => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/La_Paz', hour: '2-digit', hour12: false }).format(new Date(o.date))) === h).reduce((s, o) => s + o.total, 0));
  const maxAmount = Math.max(...amounts, 100);
  const bestSellerMap = new Map<string, { name: string; quantity: number; revenue: number; product?: Product }>();
  completed.forEach(o => o.items.split('·').forEach(entry => {
    const match = entry.trim().match(/^(\d+(?:[.,]\d+)?)\s*[×x]\s*(.+)$/i);
    const quantity = match ? Number(match[1].replace(',', '.')) : 1;
    const name = (match?.[2] || entry).trim();
    if (!name) return;
    const product = data.products.find(p => p.name.toLowerCase() === name.toLowerCase());
    const existing = bestSellerMap.get(name) || { name, quantity: 0, revenue: 0, product };
    existing.quantity += quantity;
    existing.revenue += quantity * (product ? effectivePrice(product) : 0);
    bestSellerMap.set(name, existing);
  }));
  const bestSellers = [...bestSellerMap.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 4);
  const paymentColors = ['#ff6c23', '#ffc342', '#ef5143'];
  const paymentBreakdown = ['Efectivo', 'QR', 'Tarjeta'].map((name, i) => {
    const total = paymentTotal(completed, name);
    return { name, total, percent: revenue ? Math.round(total / revenue * 100) : 0, color: paymentColors[i] };
  });
  let paymentOffset = 0;
  const paymentGradient = paymentBreakdown.map(p => {
    const start = paymentOffset;
    paymentOffset += p.percent;
    return `${p.color} ${start}% ${paymentOffset}%`;
  }).join(', ');
  return <div className="app-shell" aria-busy={saving} onKeyDownCapture={event => { if (saving) event.preventDefault(); }}>
    {saving && <div className="saving-mask" role="status">Guardando o actualizando en Supabase…</div>}
    {mobile && <button className="sidebar-shade" aria-label="Cerrar menú" onClick={() => setMobile(false)} />}
    <aside className={`sidebar ${mobile ? 'open' : ''}`}>
      <Link href="/admin/dashboard" className="brand"><span className="brand-icon"><ChefHat size={29} /></span><span>pollos <b>roly</b><small>ADMINISTRACIÓN</small></span></Link>
      <div className="workspace"><span className="workspace-icon"><Store size={19} /></span><div>Mi negocio<small>Panel de administrador</small></div><span className="green-dot" /></div>
      <p className="nav-caption">PRINCIPAL</p>
      <nav aria-label="Administración">{navigation.map(n => <div key={n.id}>{n.id === 'inventario' && <p className="nav-caption second">INVENTARIO</p>}{n.id === 'empleados' && <p className="nav-caption second">PERSONAL</p>}<Link className={`nav-link ${n.child ? 'nav-child' : ''} ${section === n.id ? 'active' : ''}`} href={n.href} onClick={() => setMobile(false)}><n.icon size={17} /><span>{n.label}</span>{section === n.id && <span className="active-dot" />}</Link></div>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-promo"><span aria-hidden="true">🐓</span><strong>pollos <b>roly</b></strong><p>Sabor que hace crecer tu negocio.</p></div><div className="profile"><span className="avatar">AD</span><div>{data.profile.name}<small>Administrador</small></div><form action={signOut}><button className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión"><X size={17} /></button></form></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-toggle" aria-label="Abrir menú" onClick={() => setMobile(true)}><Menu size={21} /></button>{section !== 'reportes' && <div className="header-search"><Search size={17} /><input ref={searchRef} aria-label="Buscar en el apartado actual" placeholder="Buscar productos, ventas, pedidos…" value={query} onChange={e => setQuery(e.target.value)} /><kbd>Ctrl + K</kbd></div>}</div><div className="topbar-actions"><div className="alerts-wrap"><button className="icon-button notification" aria-label="Ver alertas de inventario" aria-expanded={alerts} onClick={() => setAlerts(!alerts)}><Bell size={19} />{lowStock.length > 0 && <i />}</button>{alerts && <div className="alerts-panel"><strong>Alertas de inventario</strong>{lowStock.length ? lowStock.map(i => <p key={i.id}>{i.name}<small>{i.quantity} {i.unit} · {branchName(i.branch)}</small></p>) : <p>Todo el inventario está por encima del mínimo.</p>}<Link href="/admin/inventario">Revisar inventario <ArrowRight size={14} /></Link></div>}</div><div className="top-divider" /><div className="top-user"><span className="avatar small">AD</span><span>{data.profile.name}<small>Administrador</small></span><ChevronDown size={14} /></div></div></header>
      <main>
        {section !== 'dashboard' && <div className="connected-banner"><span><span className="green-dot" /> Datos reales · {data.settings.name}</span><button className="button" onClick={refresh} disabled={saving}>Actualizar datos</button></div>}
        {(loadError || needsRefresh) && <div className="error-banner" role="alert">{loadError || "El cambio se envió a Supabase. Actualiza los datos antes de continuar."}</div>}{!data.branches.some(b => b.active) && <div className="info-note">Empieza creando o activando tu primera <Link href="/admin/sucursales">sucursal</Link>. Después podrás registrar productos, insumos y personal.</div>}
        <div className={`page-heading ${section === 'dashboard' ? 'dashboard-heading' : ''}`}><div><p className="eyebrow">{section === 'dashboard' ? 'TU NEGOCIO HOY' : 'PANEL DE ADMINISTRADOR'}</p><h1>{section === 'dashboard' ? <>¡Hola, {data.profile.name || 'Administrador'}! <span aria-hidden="true">👋</span></> : current.label}</h1><p className="subtitle">{section === 'dashboard' ? 'Aquí tienes un resumen de tu negocio hoy.' : ({ menu: 'Tu sabor empieza aquí. Organiza lo que ofreces a tus clientes.', ventas: 'Consulta tus pedidos y lleva el control de cada venta.', inventario: 'Controla las existencias por sucursal.', asistencia: 'Consulta quién registró su entrada y a qué hora.', sucursales: 'Gestiona los lugares donde se comparte tu sabor.', configuracion: 'Dale a tu negocio sus propios detalles.' } as Record<string, string>)[section]}</p></div>{section === 'menu' ? <div className="heading-actions"><button className="button" onClick={() => { setMutationError(''); setMenuView('categories'); setModal({ entity: 'categoryRecords' }); }}><Plus size={17} />Agregar categoría</button><button className="button primary" onClick={() => { setMutationError(''); setMenuView('products'); setModal({ entity: 'products' }); }}><Plus size={17} />Agregar producto</button></div> : ['inventario', 'sucursales'].includes(section) ? <button className="button primary" onClick={() => { setMutationError(''); setModal({ entity: openEntity }); }}><Plus size={17} />Agregar {entityNames[openEntity]}</button> : ['dashboard', 'ventas'].includes(section) && <button className="button" onClick={exportOrders}><ArrowDownToLine size={16} />Exportar reporte</button>}</div>
        {!advancedSections.includes(section) && section !== 'configuracion' && <div className="filter-row"><div className="section-context"><span className="green-dot" />{section === 'dashboard' ? 'Resumen del negocio' : `${section === 'menu' ? (menuView === 'categories' ? (data.categoryRecords || []).filter(c => c.active).length : products.length) : section === 'ventas' ? filteredOrders.length : records.length} registros`}</div><div className="filters">{!(section === 'menu' && menuView === 'categories') && <label className="select-wrap"><Store size={15} /><select aria-label="Filtrar por sucursal" value={branch} onChange={e => { setBranch(e.target.value); setPage(1); }}><option value="all">Todas las sucursales</option>{data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><ChevronDown size={13} /></label>}{['dashboard', 'ventas'].includes(section) && <label className="select-wrap"><Clock3 size={15} /><select aria-label="Período de ventas" value={period} onChange={e => { setPeriod(e.target.value); setPage(1); }}><option value="today">Hoy</option><option value="week">Últimos 7 días</option><option value="month">Últimos 30 días</option></select><ChevronDown size={13} /></label>}</div></div>}
        {section === 'asistencia' && <AdminAttendance branches={data.branches} />}
        {advancedSections.includes(section) && section !== 'asistencia' && <AdminModules key={refreshCount} section={section} data={data} saving={saving} update={update} mutate={(operation, message) => update(data, message, { operation })} notify={setNotice} refresh={refresh} mutationError={mutationError} clearMutationError={() => setMutationError('')} createUser={createSystemUser} />}
        {section === 'dashboard' && <>
          <div className="stats-grid">{[
            { title: 'Ventas totales', value: money(revenue), icon: CircleDollarSign, color: 'orange', detail: 'Ingresos del período seleccionado' },
            { title: 'Pedidos recibidos', value: String(completed.length), icon: ShoppingBag, color: 'blue', detail: `${completed.filter(o => o.status === 'Entregado').length} pedidos entregados` },
            { title: 'Ticket promedio', value: money(completed.length ? revenue / completed.length : 0), icon: Wallet, color: 'purple', detail: 'Consumo promedio por pedido' },
            { title: 'Pedidos en curso', value: String(completed.filter(o => ['En preparación', 'Listo para entregar'].includes(o.status)).length).padStart(2, '0'), icon: Clock3, color: 'green', detail: 'Preparando algo delicioso' },
          ].map(s => <article className="stat-card" key={s.title}><div className="stat-top"><span>{s.title}</span><span className={`stat-icon ${s.color}`}><s.icon size={20} /></span></div><strong>{s.value}</strong><p>{s.detail}</p></article>)}</div>
          <div className="charts-grid"><section className="panel sales-chart"><div className="panel-heading"><div><h2>El ritmo de tus ventas</h2><p>Ingresos por hora · {period === 'today' ? 'hoy' : 'período seleccionado'}</p></div><span className="chart-legend"><i />Ventas</span></div><div className="chart-summary"><strong>{money(revenue)}</strong><span>en {completed.length} pedidos</span></div><div className="chart"><div className="y-axis">{[1, .75, .5, .25, 0].map(n => <span key={n}>{Math.round(maxAmount * n)}</span>)}</div><div className="plot"><div className="grid-lines">{[1, 2, 3, 4, 5].map(n => <i key={n} />)}</div><svg viewBox="0 0 900 180" preserveAspectRatio="none" role="img" aria-label="Gráfico de ingresos por hora, de 10 a 19 horas"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ed7028" stopOpacity=".22" /><stop offset="100%" stopColor="#ed7028" stopOpacity=".01" /></linearGradient></defs><path d={`M 0 180 ${amounts.map((v, i) => `L ${i * 100} ${175 - v / maxAmount * 160}`).join(' ')} L 900 180 Z`} fill="url(#area)" /><polyline points={amounts.map((v, i) => `${i * 100},${175 - v / maxAmount * 160}`).join(' ')} fill="none" stroke="#e97836" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg><div className="x-axis">{hours.map(h => <span key={h}>{h}:00</span>)}</div></div></div></section>
            <section className="panel payments"><div className="panel-heading"><div><h2>Cada pago cuenta</h2><p>Distribución de tus ingresos</p></div><span className="payment-heading-icon"><CreditCard size={18} /></span></div><div className="payment-visual"><div className="payment-donut" style={{ background: revenue ? `conic-gradient(${paymentGradient})` : 'conic-gradient(#ece8e3 0 100%)' }}><div><strong>{money(revenue)}</strong><small>Total recibido</small></div></div><div className="payment-legend">{paymentBreakdown.map(payment => <div className="payment-legend-row" key={payment.name}><span><i style={{ background: payment.color }} />{payment.name}<small>{payment.percent}%</small></span><strong>{money(payment.total)}</strong></div>)}</div></div></section></div>
          <div className="lower-grid dashboard-lower-grid"><section className="panel best-sellers-panel"><div className="panel-heading"><div><h2>Productos más vendidos</h2><p>Tus productos estrella hoy</p></div><Link className="text-link" href="/admin/menu">Ver todos <ArrowRight size={14} /></Link></div><div className="bestseller-table-head"><span>#</span><span>Producto</span><span>Cantidad</span><span>Ingresos</span></div>{bestSellers.length ? bestSellers.map((item, index) => <div className="bestseller-row" key={item.name}><span className="bestseller-rank">{index + 1}</span><span className="bestseller-product">{item.product?.photoPath ? <img src={productPhotoUrl(item.product.photoPath)} alt="" /> : <span className="bestseller-thumb"><UtensilsCrossed size={15} /></span>}<strong>{item.name}</strong></span><span>{item.quantity}</span><strong>{money(item.revenue)}</strong></div>) : <div className="dashboard-empty">Todavía no hay productos vendidos en este período.</div>}</section>
            <section className="panel dashboard-recent-panel"><div className="panel-heading"><div><h2>Últimos pedidos</h2><p>Actividad reciente de tu negocio</p></div><Link className="text-link" href="/admin/ventas">Ver todos <ArrowRight size={14} /></Link></div><div className="dashboard-orders">{filteredOrders.slice(0, 4).map(o => <button className="dashboard-order-row" key={o.id} onClick={() => setSelectedOrder(o.id)}><strong>{o.ticket || o.id}</strong><span className="dashboard-customer">{o.customer}<small>Hace {Math.max(0, Math.floor((Date.now() - new Date(o.date).getTime()) / 60000)) < 1 ? 'un momento' : `${Math.floor((Date.now() - new Date(o.date).getTime()) / 60000)} min`}</small></span><b>{money(o.total)}</b><span className={`dashboard-order-status status-${o.status === 'Cancelado' ? 'cancelled' : o.status === 'Entregado' ? 'complete' : o.status === 'Listo para entregar' ? 'ready' : 'new'}`}>{o.status === 'Entregado' ? 'Completado' : o.status === 'Cancelado' ? 'Cancelado' : o.status === 'Listo para entregar' ? 'Listo' : 'Nuevo'}</span></button>)}{!filteredOrders.length && <div className="dashboard-empty">No hay pedidos que coincidan con la búsqueda.</div>}</div></section></div>
        </>}
        {section === 'ventas' && <section className="panel"><div className="table-toolbar"><div className="search-field"><Search size={17} /><input placeholder="Buscar pedido o cliente…" aria-label="Buscar pedido o cliente" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></div><select className="plain-select" aria-label="Filtrar estado" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option>Todos</option>{['En preparación', 'Listo para entregar', 'Entregado', 'Cancelado'].map(s => <option key={s}>{s}</option>)}</select></div>{orderTable(filteredOrders.slice((page - 1) * 10, page * 10))}<div className="pagination"><span>{filteredOrders.length} pedidos · {money(filteredOrders.filter(o => o.status !== 'Cancelado').reduce((s, o) => s + o.total, 0))}</span><div><button className="icon-button" aria-label="Página anterior" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={17} /></button><span>{page} / {Math.max(1, Math.ceil(filteredOrders.length / 10))}</span><button className="icon-button" aria-label="Página siguiente" disabled={page * 10 >= filteredOrders.length} onClick={() => setPage(page + 1)}><ChevronRight size={17} /></button></div></div></section>}
        {section === 'menu' && <div className="menu-view-tabs" role="tablist" aria-label="Apartados del menú"><button id="products-tab" role="tab" aria-selected={menuView === 'products'} aria-controls="products-panel" onClick={() => setMenuView('products')}>Platos y productos</button><button id="categories-tab" role="tab" aria-selected={menuView === 'categories'} aria-controls="categories-panel" onClick={() => setMenuView('categories')}>Categorías</button></div>}
        {section === 'menu' && menuView === 'categories' && <MenuCategories data={data} edit={item => { setMutationError(''); setModal({ entity: 'categoryRecords', item }); }} toggle={item => update({ ...data, categoryRecords: (data.categoryRecords || []).map(c => c.id === item.id ? { ...c, active: !c.active } : c) }, item.active ? 'Categoría archivada' : 'Categoría reactivada')} />}
        {section === 'menu' && menuView === 'products' && <div id="products-panel" role="tabpanel" aria-labelledby="products-tab"><div className="menu-toolbar"><div className="tabs">{['Todos', ...categories].map(c => <button key={c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="search-field"><Search size={17} /><input placeholder="Buscar producto…" aria-label="Buscar producto" value={query} onChange={e => setQuery(e.target.value)} /></div></div><div className="products-grid">{products.map(p => <article className="product-card" key={p.id}><div className={`product-art category-${categories.indexOf(p.category) % 4}`}>{p.photoPath && <img className="product-card-photo" src={productPhotoUrl(p.photoPath)} alt={p.name} />}<span>{p.category === 'Bebidas' ? <CreditCard size={42} /> : p.category === 'Snacks' ? <ShoppingBasket size={42} /> : <UtensilsCrossed size={42} />}</span><span className={`badge ${p.active ? 'success' : 'neutral'}`}>{p.active ? 'Disponible' : 'Pausado'}</span></div><div className="product-body"><small>{p.category}</small><h2>{p.name}</h2>{p.description && <p className="product-description">{p.description}</p>}<div><strong>{money(effectivePrice(p))}{p.onSale && <del className="regular-price">{money(p.price)}</del>}</strong><button className="edit-button" aria-label={`Editar ${p.name}`} onClick={() => { setMutationError(''); setModal({ entity: 'products', item: p }); }}><Pencil size={15} />Editar</button></div></div></article>)}</div>{!products.length && <div className="empty-state">No se encontraron productos. Prueba otra búsqueda o agrega uno.</div>}<p className="footnote">El menú es común a todas las sucursales. Los precios y la disponibilidad se guardan en Supabase.</p></div>}
        {['inventario', 'sucursales'].includes(section) && <section className="panel"><div className="table-toolbar"><div className="search-field"><Search size={17} /><input placeholder={`Buscar ${section === 'inventario' ? 'insumo' : 'sucursal'}…`} aria-label="Buscar registros" value={query} onChange={e => setQuery(e.target.value)} /></div><span className="muted">{records.length} registros</span></div><div className="table-scroll"><table><thead><tr><th>Nombre</th>{section === 'inventario' ? <><th>Sucursal</th><th>Existencias</th><th>Mínimo</th><th>Estado</th></> : <><th>Dirección</th><th>Teléfono</th><th>Estado</th></>}<th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{records.map(record => <tr key={record.id}><td className="record-name">{record.name}</td>{'quantity' in record ? <><td>{branchName(record.branch)}</td><td><strong>{record.quantity}</strong> {record.unit}</td><td>{record.minimum} {record.unit}</td><td><span className={`badge ${record.quantity <= record.minimum ? 'warning' : 'success'}`}>{record.quantity <= record.minimum ? 'Stock bajo' : 'Disponible'}</span></td></> : <><td>{record.address}</td><td>{record.phone || 'Sin registrar'}</td><td><span className={`badge ${record.active ? 'success' : 'neutral'}`}>{record.active ? 'Activa' : 'Inactiva'}</span></td></>}<td><button className="icon-button" aria-label={`Editar ${record.name}`} onClick={() => { setMutationError(''); setModal({ entity: openEntity, item: record }); }}><Pencil size={16} /></button></td></tr>)}</tbody></table></div>{!records.length && <div className="empty-state">No hay registros que coincidan. Puedes agregar uno nuevo.</div>}</section>}
        {section === 'configuracion' && <form className="panel settings-panel" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); update({ ...data, settings: { name: String(f.get('name')).trim(), phone: String(f.get('phone')).trim(), address: String(f.get('address')).trim(), message: String(f.get('message')).trim() } }, 'Configuración guardada'); }}><div className="panel-heading"><div><h2>Información del negocio</h2><p>Datos que identificarán a Pollos Roly en tus comprobantes.</p></div><Store size={22} className="muted" /></div><div className="settings-fields"><label>Nombre del negocio<input name="name" required maxLength={80} defaultValue={data.settings.name} /></label><label>Teléfono de contacto<input name="phone" type="tel" maxLength={30} defaultValue={data.settings.phone} placeholder="Ej. 70000000" /></label><label className="full">Dirección<input name="address" maxLength={200} defaultValue={data.settings.address} placeholder="Dirección de tu negocio" /></label><label className="full">Mensaje de agradecimiento<textarea name="message" maxLength={200} defaultValue={data.settings.message} rows={3} /></label></div><div className="form-footer"><span>Moneda: Bolivianos (Bs) · Zona horaria: Bolivia</span><button className="button primary" type="submit"><Check size={17} />Guardar cambios</button></div></form>}
        <footer className="footer"><span><b>pollos roly</b> · Hecho para tu negocio</span><span>Administración · v0.1</span></footer>
      </main>
    </div>
    {notice && <div role="status" className="toast"><Check size={18} />{notice}</div>}
    <dialog ref={dialogRef} aria-labelledby="dialog-title" className={`modal ${modal?.entity === 'products' ? 'product-modal' : ''}`} onCancel={e => { if (saving) { e.preventDefault(); return; } setModal(null); setSelectedOrder(null); }} onClick={e => { if (!saving && e.target === e.currentTarget) { setModal(null); setSelectedOrder(null); } }}>
      <div className="modal-heading"><div><p className="eyebrow">POLLOS ROLY</p><h2 id="dialog-title">{modal ? `${modal.item ? 'Editar' : 'Agregar'} ${entityNames[modal.entity]}` : `Pedido ${order?.ticket || order?.id || ''}`}</h2></div><button className="icon-button" disabled={saving} aria-label="Cerrar diálogo" onClick={() => { setModal(null); setSelectedOrder(null); }}><X size={21} /></button></div>
      {modal?.entity === 'products' && <ProductEditor key={modal.item?.id || 'new-product'} product={modal.item as Product | undefined} categories={categories} saving={saving} error={mutationError} cancel={() => setModal(null)} save={async (product, photo) => {
        const exists = data.products.some(p => p.id === product.id);
        const next = { ...data, products: exists ? data.products.map(p => p.id === product.id ? product : p) : [...data.products, product] };
        const ok = await update(next, 'Producto guardado correctamente', photo ? { product, photo } : undefined);
        if (ok) setModal(null);
        return ok;
      }} />}
      {modal && modal.entity !== 'products' && <form key={modal.item?.id || modal.entity} onSubmit={saveEntity} className="entity-form"><label>Nombre<input name="name" autoFocus required maxLength={modal.entity === 'categoryRecords' ? 80 : 100} defaultValue={modal.item?.name} /></label>
        {['employees', 'stock'].includes(modal.entity) && <label>Sucursal<select name="branch" required defaultValue={(modal.item as Stock | Employee)?.branch || data.branches[0]?.id}>{data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        {modal.entity === 'stock' && <><div className="form-columns"><label>Cantidad actual<input name="quantity" type="number" min="0" max="1000000" step="0.01" required defaultValue={(modal.item as Stock)?.quantity ?? 0} /></label><label>Stock mínimo<input name="minimum" type="number" min="0" max="1000000" step="0.01" required defaultValue={(modal.item as Stock)?.minimum ?? 5} /></label></div><label>Unidad<select name="unit" defaultValue={(modal.item as Stock)?.unit || 'unidades'}>{['unidades', 'kg', 'litros', 'paquetes'].map(u => <option key={u}>{u}</option>)}</select></label><p className="footnote">Ajuste manual de existencias por sucursal. Las compras actualizan estas cantidades automáticamente.</p></>}
        {modal.entity === 'employees' && <label>Rol<select name="role" defaultValue={(modal.item as Employee)?.role || 'Cajero'}>{['Administrador', 'Supervisor', 'Cajero', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza'].map(r => <option key={r}>{r}</option>)}</select></label>}
        {modal.entity === 'branches' && <label>Dirección<input name="address" required maxLength={200} defaultValue={(modal.item as Branch)?.address} /></label>}
        {['branches', 'employees'].includes(modal.entity) && <label>Teléfono<input name="phone" type="tel" maxLength={30} defaultValue={(modal.item as Branch | Employee)?.phone} /></label>}
        {modal.entity !== 'stock' && <label className="checkbox-label"><input type="checkbox" name="active" defaultChecked={modal.item ? (modal.item as Product).active : true} />Activo</label>}
        <div className="entity-save-error">{mutationError && <p className="error-banner" role="alert">{mutationError}</p>}</div><div className="modal-footer"><button type="button" className="button" onClick={() => setModal(null)}>Cancelar</button><button type="submit" className="button primary"><Check size={17} />Guardar {entityNames[modal.entity]}</button></div>
      </form>}
      {order && <div className="order-detail"><div className="detail-line"><span>Cliente</span><strong>{order.customer}</strong></div><div className="detail-line"><span>Sucursal</span><strong>{branchName(order.branch)}</strong></div><div className="detail-line"><span>Fecha</span><strong>{new Date(order.date).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</strong></div><div className="order-items">{order.items}</div><div className="detail-line"><span>Pago con {order.payment}</span><strong>{money(order.total)}</strong></div><label>Estado del pedido<select value={order.status} onChange={e => update({ ...data, orders: data.orders.map(o => o.id === order.id ? { ...o, status: e.target.value } : o) }, 'Estado del pedido actualizado')}>{['En preparación', 'Listo para entregar', 'Entregado', 'Cancelado'].map(s => <option key={s}>{s}</option>)}</select></label><p className="footnote">Los cambios se guardan en Supabase. Cancelar devuelve los snacks y no se permite en turnos cerrados.</p></div>}
    </dialog>
  </div>;

  function orderTable(list: Data['orders']) {
    return <div className="table-scroll"><table><thead><tr><th>Pedido / cliente</th><th>Hora</th><th>Pago</th><th>Total</th><th>Estado</th><th><span className="sr-only">Detalle</span></th></tr></thead><tbody>{list.map(o => <tr key={o.id}><td><button className="order-link" onClick={() => setSelectedOrder(o.id)}>{o.ticket || o.id}</button><small className="customer-name">{o.customer}</small></td><td>{new Date(o.date).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' })}</td><td>{o.payment}</td><td className="amount">{money(o.total)}</td><td><span className={`badge ${o.status === 'Entregado' ? 'success' : o.status === 'Cancelado' ? 'neutral' : o.status === 'Listo para entregar' ? 'blue-badge' : 'warning'}`}><i />{o.status}</span></td><td><button className="icon-button" aria-label={`Ver pedido ${o.id}`} onClick={() => setSelectedOrder(o.id)}><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table>{!list.length && <div className="empty-state">No hay pedidos para estos filtros.</div>}</div>;
  }
}
