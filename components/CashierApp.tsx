'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Ban, ChefHat, Check, CircleDollarSign, Clock3, History, Minus, Package, Pencil, Plus, Printer, RefreshCw, Search, ShoppingBag, Store, Wallet, X } from 'lucide-react';
import { signOut } from '../app/auth/actions';
import { cancelCashierOrder, CashierOrder, CashierSnapshot, closeCashierShift, loadCashierData, openCashierShift, registerCashierMovement, registerCashierSale, updateCashierOrder } from '../app/cajero/actions';
import { productPhotoUrl } from '../lib/products';

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type CartLine = { productId: string; quantity: number };
type Panel = 'venta' | 'caja';

export default function CashierApp() {
  const [data, setData] = useState<CashierSnapshot | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>('venta');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState('');
  const [method, setMethod] = useState('Efectivo');
  const [opening, setOpening] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');
  const [counted, setCounted] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [movementType, setMovementType] = useState('Ingreso');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementConcept, setMovementConcept] = useState('');
  const [historyFilter, setHistoryFilter] = useState('Todos');
  const [historyQuery, setHistoryQuery] = useState('');
  const [salesTab, setSalesTab] = useState<'current' | 'history'>('history');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await loadCashierData();
    if (result.data) { setData(result.data); setError(''); }
    else setError(result.error || 'No se pudieron cargar los datos del cajero.');
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const categories = useMemo(() => ['Todos', ...new Set(data?.products.map(p => p.category) || [])], [data?.products]);
  const products = useMemo(() => (data?.products || []).filter(p => p.name.toLowerCase().includes(query.toLowerCase()) && (category === 'Todos' || p.category === category)), [data?.products, query, category]);
  const cartProducts = cart.flatMap(line => { const product = data?.products.find(p => p.id === line.productId); return product ? [{ ...product, quantity: line.quantity }] : []; });
  const total = cartProducts.reduce((sum, item) => sum + (item.onSale && item.salePrice != null ? item.salePrice : item.price) * item.quantity, 0);
  const soldProducts = useMemo(() => {
    const totals = new Map<string, { quantity: number; subtotal: number }>();
    for (const order of data?.recentOrders || []) if (order.status !== 'Cancelado') for (const line of order.lines) {
      const previous = totals.get(line.name) || { quantity: 0, subtotal: 0 };
      totals.set(line.name, { quantity: previous.quantity + line.quantity, subtotal: previous.subtotal + line.subtotal });
    }
    return [...totals.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.quantity - a.quantity);
  }, [data?.recentOrders]);
  const filteredHistory = (data?.recentOrders || []).filter(order =>
    (historyFilter === 'Todos' || (historyFilter === 'Anuladas' ? order.status === 'Cancelado' : order.status !== 'Cancelado')) &&
    `${order.ticket} ${order.customer}`.toLocaleLowerCase('es').includes(historyQuery.toLocaleLowerCase('es')),
  );
  const completedCount = (data?.recentOrders || []).filter(order => order.status !== 'Cancelado').length;
  const cancelledCount = (data?.recentOrders || []).filter(order => order.status === 'Cancelado').length;
  const editingOrder = data?.recentOrders.find(order => order.id === editingOrderId);

  function add(productId: string) { setCart(lines => { const existing = lines.find(line => line.productId === productId); const product = data?.products.find(p => p.id === productId); const originalQuantity = editingOrder?.lines.find(line => line.productId === productId)?.quantity || 0; const available = (product?.stock || 0) + originalQuantity; if (product?.snack && (existing?.quantity || 0) >= available) return lines; return existing ? lines.map(line => line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line) : [...lines, { productId, quantity: 1 }]; }); }
  function changeQuantity(productId: string, amount: number) { const product = data?.products.find(p => p.id === productId); const originalQuantity = editingOrder?.lines.find(line => line.productId === productId)?.quantity || 0; const available = (product?.stock || 0) + originalQuantity; setCart(lines => lines.flatMap(line => { if (line.productId !== productId) return [line]; const quantity = line.quantity + amount; if (quantity <= 0) return []; if (product?.snack && quantity > available) return [line]; return [{ ...line, quantity }]; })); }

  function beginEdit(order: CashierOrder) {
    if (!shift || order.status === 'Cancelado') return;
    setEditingOrderId(order.id);
    setCart(order.lines.map(line => ({ productId: line.productId, quantity: line.quantity })));
    setCustomer(order.customer === 'Cliente de mostrador' ? '' : order.customer);
    setMethod(['Efectivo', 'QR', 'Tarjeta'].includes(order.payment) ? order.payment : 'Efectivo');
    setSalesTab('current');
  }

  function printTicket(order: CashierOrder) {
    if (!data) return;
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    const popup = window.open('', '_blank', 'width=420,height=720');
    if (!popup) { setError('Permite las ventanas emergentes para imprimir el ticket.'); return; }
    const rows = order.lines.map(line => `<tr><td>${line.quantity} × ${escape(line.name)}</td><td>${money(line.subtotal)}</td></tr>`).join('');
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${escape(order.ticket)}</title><style>@page{size:80mm auto;margin:5mm}*{box-sizing:border-box}body{width:70mm;margin:0 auto;font:12px Arial,sans-serif;color:#111}.center{text-align:center}.brand{font-weight:800;font-size:18px}.muted{color:#555;font-size:10px;line-height:1.5}.line{border-top:1px dashed #555;margin:10px 0}table{width:100%;border-collapse:collapse}td{padding:4px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}.total{display:flex;justify-content:space-between;font-weight:800;font-size:15px;margin-top:8px}</style></head><body><div class="center brand">${escape(data.businessName)}</div><div class="center muted">${escape(data.branchName)}<br/>${escape(order.ticket)} · ${new Date(order.date).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}<br/>${escape(order.customer || 'Cliente de mostrador')}</div><div class="line"></div><table>${rows}</table><div class="line"></div><div class="total"><span>TOTAL</span><span>${money(order.total)}</span></div><p class="muted">Pago: ${escape(order.payment)} · ${escape(order.status)}</p><div class="line"></div><p class="center muted">¡Gracias por elegir ${escape(data.businessName)}!</p><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
    popup.document.close();
  }

  async function submit(action: () => Promise<{ ok: boolean; error?: string; result?: { data?: CashierSnapshot; error?: string } }>, success: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await action();
      if (!result.ok) { setError(result.error || 'No se pudo guardar.'); return false; }
      if (result.result?.data) setData(result.result.data);
      else if (result.result?.error) setError(`Se guardó, pero no se pudo actualizar la pantalla: ${result.result.error}`);
      setMessage(success);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
    return false;
  }

  if (!data) return <main className="cashier-loading"><ChefHat size={38} /><p>{error || 'Cargando caja…'}</p>{error && <button className="button" onClick={() => void refresh()}>Volver a intentar</button>}</main>;

  const shift = data.shift;
  const header = <header className="cashier-header"><a className="cashier-brand" href="/cajero"><span><ChefHat size={24} /></span><strong>pollos <b>roly</b><small>PUNTO DE VENTA</small></strong></a><div className="cashier-header-branch"><Store size={16} /><span>{data.branchName}<small>{data.businessName}</small></span></div><span className={`cashier-shift-pill ${shift ? 'is-open' : ''}`}><i />{shift ? 'Caja abierta' : 'Caja cerrada'}</span><div className="cashier-header-user"><span className="cashier-avatar">{data.profileName.slice(0, 1).toUpperCase()}</span><span>{data.profileName}<small>Cajero</small></span><form action={signOut}><button className="button" aria-label="Cerrar sesión"><X size={16} />Cerrar sesión</button></form></div></header>;
  if (!shift) return <main className="cashier-page is-opening">
    {header}
    <section className="cashier-open-stage">
      <form className="cashier-open-card" onSubmit={event => { event.preventDefault(); void submit(() => openCashierShift({ opening: Number(opening), notes: openingNotes }), 'Caja abierta. Ya puedes empezar a registrar ventas.').then(ok => { if (ok) { setPanel('venta'); setOpening(''); setOpeningNotes(''); } }); }}>
        <span className="cashier-open-icon"><Wallet size={38} /></span>
        <p className="eyebrow">INICIO DE TURNO · {data.branchName}</p>
        <h1>Apertura de Caja</h1>
        <p className="cashier-open-description">Declara el monto inicial de tu caja (sencillo) para empezar a vender.</p>
        {error && <div className="cashier-alert is-error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Cerrar aviso"><X size={16}/></button></div>}
        <label className="cashier-opening-amount">MONTO INICIAL (BS.)<span><b>Bs.</b><input type="number" min="0" max="10000000" step="0.01" required value={opening} onChange={event => setOpening(event.target.value)} placeholder="0.00" disabled={busy} /></span></label>
        <label className="cashier-opening-notes">Observaciones (opcional)<textarea rows={2} maxLength={1000} value={openingNotes} onChange={event => setOpeningNotes(event.target.value)} placeholder="Notas de apertura…" disabled={busy}/></label>
        <div className="cashier-open-note"><CircleDollarSign size={17}/><span>Este monto se sumará a las ventas en efectivo para el arqueo final.</span></div>
        <button className="button primary cashier-open-submit" disabled={busy}><Wallet size={18}/>{busy ? 'Abriendo caja…' : 'Abrir caja y empezar a vender'}<span aria-hidden="true">›</span></button>
        {message && <p className="cashier-open-success" role="status">{message}</p>}
      </form>
    </section>
    <footer className="cashier-footer">{data.businessName} · Punto de venta · {data.branchName}</footer>
  </main>;

  return <main className="cashier-page">
    {header}
    {(error || message) && <div className={error ? 'cashier-alert is-error' : 'cashier-alert is-success'} role={error ? 'alert' : 'status'}>{error || message}<button onClick={() => { setError(''); setMessage(''); }} aria-label="Cerrar aviso"><X size={16} /></button></div>}
    {panel === 'venta' && <>
      <div className="cashier-sales-heading"><div><p className="eyebrow">PUNTO DE VENTA · {data.branchName}</p><h1>Ventas</h1></div><div><button className="button cashier-refresh" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/>Actualizar</button><button className="button primary cashier-close-shortcut" onClick={() => setPanel('caja')}><Wallet size={16}/>Cerrar caja</button></div></div>
      <div className="cashier-sales-layout">
        <section className="cashier-catalog"><div className="cashier-catalog-heading"><div><h2>Productos</h2><p>Selecciona productos para el pedido actual.</p></div><span className="cashier-count"><Package size={15}/>{products.length}</span></div><div className="cashier-catalog-tools"><label className="cashier-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto"/></label><div className="cashier-categories">{categories.map(item => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></div><div className="cashier-product-grid">{products.map(product => { const price = product.onSale && product.salePrice != null ? product.salePrice : product.price; const inOrder = editingOrder?.lines.find(line => line.productId === product.id)?.quantity || 0; const outOfStock = product.snack && (product.stock || 0) + inOrder < 1; const qty = cart.find(line => line.productId === product.id)?.quantity || 0; return <button className="cashier-product" key={product.id} disabled={!shift || outOfStock || busy} onClick={() => add(product.id)}><span className="cashier-product-photo">{product.photoPath ? <img src={productPhotoUrl(product.photoPath)} alt=""/> : <ChefHat size={25}/>}</span><span className="cashier-product-info"><strong>{product.name}</strong><small>{product.category}{product.snack ? ` · ${product.stock} disp.` : ''}</small><b>{money(price)}</b></span>{qty > 0 && <span className="cashier-product-qty">{qty}</span>}<span className="cashier-add"><Plus size={16}/></span></button>; })}{!products.length && <div className="cashier-empty">No hay productos activos que coincidan con la búsqueda.</div>}</div></section>
        <aside className="cashier-sales-side">
          <nav className="cashier-sales-tabs" aria-label="Pedido e historial del turno">
            <button className={salesTab === 'current' ? 'selected' : ''} onClick={() => setSalesTab('current')}><ShoppingBag size={15}/>Pedido actual{cart.length > 0 && <i>{cart.reduce((n, line) => n + line.quantity, 0)}</i>}</button>
            <button className={salesTab === 'history' ? 'selected' : ''} onClick={() => setSalesTab('history')}><History size={15}/>Historial del turno</button>
          </nav>
          {salesTab === 'current' ? <section className="cashier-current-order"><div className="cashier-section-heading"><div><h2>{editingOrder ? `Editar ${editingOrder.ticket}` : 'Nuevo pedido'}</h2><p>{cart.reduce((n, line) => n + line.quantity, 0)} productos</p></div>{editingOrder && <button className="cashier-text-button" onClick={() => { setEditingOrderId(null); setCart([]); setCustomer(''); }} disabled={busy}>Cancelar edición</button>}</div><label className="cashier-customer">Cliente (opcional)<input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Cliente de mostrador" maxLength={160}/></label><div className="cashier-cart-lines">{cartProducts.map(item => <article className="cashier-cart-line" key={item.id}><div className="cashier-line-info"><strong>{item.name}</strong><small>{money(item.onSale && item.salePrice != null ? item.salePrice : item.price)} c/u</small></div><div className="cashier-quantity"><button onClick={() => changeQuantity(item.id,-1)} aria-label={`Quitar uno de ${item.name}`}><Minus size={13}/></button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id,1)} aria-label={`Agregar uno de ${item.name}`}><Plus size={13}/></button></div><strong className="cashier-line-total">{money(item.quantity*(item.onSale && item.salePrice != null ? item.salePrice : item.price))}</strong></article>)}{!cart.length && <div className="cashier-cart-empty"><ShoppingBag size={27}/><p>El pedido está vacío</p><small>Agrega platos desde el catálogo.</small></div>}</div><div className="cashier-checkout"><label>Método de pago<select value={method} onChange={e => setMethod(e.target.value)}><option>Efectivo</option><option>QR</option><option>Tarjeta</option></select></label><div className="cashier-total"><span>Total</span><strong>{money(total)}</strong></div><button className="button primary cashier-submit" disabled={!shift || !cart.length || busy} onClick={() => void submit(() => editingOrder && shift ? updateCashierOrder({ orderId: editingOrder.id, customer, items: cart.map(({productId,quantity})=>({productId,quantity})), method }) : shift ? registerCashierSale({ shiftId: shift.id, customer, items: cart.map(({productId,quantity})=>({productId,quantity})), method }) : Promise.resolve({ok:false,error:'Abre la caja para registrar ventas.'}), editingOrder ? 'Pedido actualizado.' : 'Venta registrada correctamente.').then(ok => { if (ok) { setCart([]); setCustomer(''); setEditingOrderId(null); setSalesTab('history'); } })}><Check size={17}/>{busy ? 'Guardando…' : editingOrder ? 'Guardar cambios' : 'Registrar pedido'}</button></div></section> : <section className="cashier-shift-board"><div className="cashier-shift-summary"><article><small>COMPLETADAS</small><strong>{completedCount}</strong></article><article><small>ANULADAS</small><strong>{cancelledCount}</strong></article><article><small>TOTAL DEL TURNO</small><strong>{money(data.todayTotal)}</strong></article></div><section className="cashier-sold-list"><h3>🍗 Platos vendidos en este turno</h3>{soldProducts.slice(0,12).map(product => <div key={product.name}><strong>{product.name}</strong><span>{product.quantity} unid.</span><b>{money(product.subtotal)}</b></div>)}{!soldProducts.length && <p className="cashier-empty">Todavía no hay productos vendidos en este turno.</p>}</section><div className="cashier-history-tools"><div className="cashier-history-filters">{['Todos','Completadas','Anuladas'].map(filter => <button key={filter} className={historyFilter===filter?'selected':''} onClick={() => setHistoryFilter(filter)}>{filter}</button>)}</div><label><Search size={15}/><input value={historyQuery} onChange={event => setHistoryQuery(event.target.value)} placeholder="Buscar por cliente o ticket…" aria-label="Buscar pedidos del turno"/></label></div><div className="cashier-order-history">{filteredHistory.map(order => <article key={order.id} className={order.status==='Cancelado'?'cancelled':''}><div className="cashier-order-ticket"><strong>#{order.ticket.replace(/^R-0*/, '')}</strong><small>{new Date(order.date).toLocaleTimeString('es-BO',{timeZone:'America/La_Paz',hour:'2-digit',minute:'2-digit'})}</small></div><div className="cashier-order-description"><strong>{order.status==='Cancelado'?'Anulada':order.status}</strong><small>{order.customer || 'Cliente de mostrador'} · {order.payment}</small></div><b className="cashier-order-amount">{money(order.total)}</b><div className="cashier-order-actions">{order.status!=='Cancelado' && shift && <button title="Editar pedido" aria-label={`Editar ${order.ticket}`} disabled={busy} onClick={() => beginEdit(order)}><Pencil size={15}/></button>}<button title="Reimprimir ticket" aria-label={`Reimprimir ${order.ticket}`} onClick={() => printTicket(order)}><Printer size={15}/></button>{order.status!=='Cancelado' && shift && <button title="Anular pedido" aria-label={`Anular ${order.ticket}`} disabled={busy} onClick={() => { if (window.confirm(`¿Anular el pedido ${order.ticket}? Se devolverá el stock de snacks.`)) void submit(() => cancelCashierOrder(order.id),'Pedido anulado.'); }}><Ban size={15}/></button>}</div></article>)}{!filteredHistory.length && <div className="cashier-empty">No hay pedidos que coincidan con este filtro.</div>}</div></section>}
        </aside>
      </div>
    </>}
    {panel === 'caja' && <><div className="cashier-cash-heading"><div><p className="eyebrow">TURNO · {data.branchName}</p><h1>Caja</h1></div><button className="button" onClick={() => setPanel('venta')}><ShoppingBag size={16}/>Volver a ventas</button></div><div className="cashier-cash-grid">{!shift ? <section className="cashier-cash-card"><div className="cashier-cash-icon"><Wallet size={22} /></div><h2>Abrir turno de caja</h2><p>Cuenta el efectivo con el que inicias. Solo puede haber un turno abierto en esta sucursal.</p><form onSubmit={event => { event.preventDefault(); void submit(() => openCashierShift({ opening: Number(opening), notes: openingNotes }), 'Turno de caja abierto.'); }}><label>Fondo inicial (Bs)<input type="number" min="0" step="0.01" required value={opening} onChange={e => setOpening(e.target.value)} placeholder="0.00" /></label><label>Observaciones (opcional)<textarea maxLength={1000} rows={3} value={openingNotes} onChange={e => setOpeningNotes(e.target.value)} placeholder="Notas de apertura…" /></label><button className="button primary" disabled={busy}><Check size={16} />Abrir caja</button></form></section> : <>
      <section className="cashier-cash-card"><div className="cashier-cash-card-heading"><div><div className="cashier-cash-icon"><Wallet size={22} /></div><h2>Turno abierto</h2><p>{data.branchName} · {new Date(shift.openedAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</p></div><span className="cashier-shift-pill is-open"><i />Activo</span></div><div className="cashier-cash-numbers"><div><small>Fondo inicial</small><strong>{money(shift.opening)}</strong></div><div><small>Efectivo esperado</small><strong>{money(data.expectedCash)}</strong></div></div><div className="cashier-movement"><h3>Registrar ingreso o egreso</h3><form onSubmit={event => { event.preventDefault(); void submit(() => registerCashierMovement({ shiftId: shift.id, type: movementType, amount: Number(movementAmount), concept: movementConcept }), 'Movimiento de caja registrado.'); setMovementAmount(''); setMovementConcept(''); }}><label>Tipo<select value={movementType} onChange={e => setMovementType(e.target.value)}><option>Ingreso</option><option>Egreso</option></select></label><label>Monto (Bs)<input type="number" min="0.01" step="0.01" required value={movementAmount} onChange={e => setMovementAmount(e.target.value)} placeholder="0.00" /></label><label className="cashier-movement-concept">Concepto<input maxLength={200} required value={movementConcept} onChange={e => setMovementConcept(e.target.value)} placeholder="Ej. Cambio para caja" /></label><button className="button" disabled={busy}><ArrowDownUp size={15} />Registrar movimiento</button></form></div></section>
      <section className="cashier-cash-card cashier-close-card"><div className="cashier-cash-icon"><Check size={22} /></div><h2>Cerrar turno</h2><p>Cuenta el efectivo disponible. El sistema guardará el monto esperado y cualquier diferencia.</p><form onSubmit={event => { event.preventDefault(); void submit(() => closeCashierShift({ shiftId: shift.id, counted: Number(counted), notes: closeNotes }), 'Turno cerrado y arqueo guardado.'); }}><label>Efectivo contado (Bs)<input type="number" min="0" step="0.01" required value={counted} onChange={e => setCounted(e.target.value)} placeholder={data.expectedCash.toFixed(2)} /></label><label>Observaciones del cierre<input maxLength={1000} value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Notas opcionales…" /></label><div className="cashier-expected"><span>Diferencia estimada</span><strong>{money(Number(counted || 0) - data.expectedCash)}</strong></div><button className="button primary" disabled={busy}><Check size={16} />Cerrar y guardar arqueo</button></form></section>
      </>}</div></>}
    <footer className="cashier-footer">{data.businessName} · Punto de venta · {data.branchName}</footer>
  </main>;
}
