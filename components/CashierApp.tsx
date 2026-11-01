'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ArrowDownUp, Ban, Bell, ChefHat, Check, CircleDollarSign, Clock3, ConciergeBell, Drumstick, Flame, Grid2X2, History, LogOut, Minus, Package, Pencil, Plus, Popcorn, Printer, QrCode, RefreshCw, Search, ShoppingBag, Store, CupSoda, Wallet, X } from 'lucide-react';
import { signOut } from '../app/auth/actions';
import { cancelCashierOrder, CashierOrder, CashierProduct, CashierSnapshot, ChickenCustomization, closeCashierShift, loadCashierData, openCashierShift, registerCashierSale, updateCashierOrder } from '../app/cajero/actions';
import { productPhotoUrl } from '../lib/products';

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type CartLine = { productId: string; quantity: number; customizations?: ChickenCustomization[] };
type Panel = 'venta' | 'caja';
type PaymentMethod = 'Efectivo' | 'QR' | 'Mixto';
type MixedPayment = { Efectivo: string; QR: string };
type PaymentField = 'cashGiven' | 'digitalReceived' | keyof MixedPayment;
const amountValue = (value: string) => Number(value.replace(',', '.')) || 0;
const choiceSummary = (choice: ChickenCustomization) => `${choice.piece} ${choice.preparation}${choice.accompaniments.length ? ` · ${choice.accompaniments.join(', ')}` : ' · Sin acompañamientos'}`;

export default function CashierApp() {
  const [data, setData] = useState<CashierSnapshot | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>('venta');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customizingProductId, setCustomizingProductId] = useState<string | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<ChickenCustomization['piece']>('Pechuga');
  const [selectedPreparation, setSelectedPreparation] = useState<ChickenCustomization['preparation']>('Brasa');
  const [selectedAccompaniments, setSelectedAccompaniments] = useState<ChickenCustomization['accompaniments']>(['Arroz', 'Fideo', 'Papa']);
  const [customer, setCustomer] = useState('');
  const [method, setMethod] = useState('Efectivo');
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [historyFilter, setHistoryFilter] = useState('Todos');
  const [historyQuery, setHistoryQuery] = useState('');
  const [salesTab, setSalesTab] = useState<'current' | 'history'>('current');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cashGiven, setCashGiven] = useState('');
  const [digitalReceived, setDigitalReceived] = useState('');
  const [mixedPayment, setMixedPayment] = useState<MixedPayment>({ Efectivo: '', QR: '' });
  const [activePaymentField, setActivePaymentField] = useState<PaymentField>('cashGiven');

  const refresh = useCallback(async () => {
    const result = await loadCashierData();
    if (result.data) { setData(result.data); setError(''); }
    else setError(result.error || 'No se pudieron cargar los datos del cajero.');
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (data?.shift) setCounted(data.expectedCash.toFixed(2));
    else setCounted('');
  }, [data?.shift?.id, data?.expectedCash]);

  const categories = useMemo(() => ['Todos', ...new Set(data?.products.map(p => p.category) || [])], [data?.products]);
  const products = useMemo(() => (data?.products || []).filter(p => category === 'Todos' || p.category === category), [data?.products, category]);
  const cartProducts = cart.flatMap(line => { const product = data?.products.find(p => p.id === line.productId); return product ? [{ ...product, quantity: line.quantity, customizations: line.customizations || [] }] : []; });
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
  const customizingProduct = data?.products.find(product => product.id === customizingProductId);

  function openChickenCustomization(product: CashierProduct) {
    setCustomizingProductId(product.id);
    setSelectedPiece(product.pieceType === 'leg_thigh' ? 'Pierna' : 'Pechuga');
    setSelectedPreparation('Brasa');
    setSelectedAccompaniments(['Arroz', 'Fideo', 'Papa']);
  }

  function add(productId: string) {
    const product = data?.products.find(p => p.id === productId);
    if (product?.requiresChoices) { openChickenCustomization(product); return; }
    setCart(lines => {
      const existing = lines.find(line => line.productId === productId);
      const originalQuantity = editingOrder?.lines.find(line => line.productId === productId)?.quantity || 0;
      const available = (product?.stock || 0) + originalQuantity;
      if (product?.snack && (existing?.quantity || 0) >= available) return lines;
      return existing ? lines.map(line => line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line) : [...lines, { productId, quantity: 1 }];
    });
  }

  function addChickenChoice() {
    if (!customizingProduct) return;
    const choice: ChickenCustomization = { piece: selectedPiece, preparation: selectedPreparation, accompaniments: selectedAccompaniments };
    setCart(lines => {
      const existing = lines.find(line => line.productId === customizingProduct.id);
      const original = existing?.customizations || [];
      return existing
        ? lines.map(line => line.productId === customizingProduct.id ? { ...line, quantity: line.quantity + 1, customizations: [...original, choice] } : line)
        : [...lines, { productId: customizingProduct.id, quantity: 1, customizations: [choice] }];
    });
    setCustomizingProductId(null);
  }

  function changeQuantity(productId: string, amount: number) {
    const product = data?.products.find(p => p.id === productId);
    if (product?.requiresChoices && amount > 0) { openChickenCustomization(product); return; }
    const originalQuantity = editingOrder?.lines.find(line => line.productId === productId)?.quantity || 0;
    const available = (product?.stock || 0) + originalQuantity;
    setCart(lines => lines.flatMap(line => {
      if (line.productId !== productId) return [line];
      if (product?.requiresChoices) {
        const customizations = (line.customizations || []).slice(0, amount < 0 ? -1 : undefined);
        return customizations.length ? [{ ...line, quantity: customizations.length, customizations }] : [];
      }
      const quantity = line.quantity + amount;
      if (quantity <= 0) return [];
      if (product?.snack && quantity > available) return [line];
      return [{ ...line, quantity }];
    }));
  }

  function beginEdit(order: CashierOrder) {
    if (!shift || order.status === 'Cancelado') return;
    setEditingOrderId(order.id);
    setCart(order.lines.map(line => ({ productId: line.productId, quantity: line.quantity, ...(line.customizations.length ? { customizations: line.customizations } : {}) })));
    setCustomer(order.customer === 'Cliente de mostrador' ? '' : order.customer);
    setMethod(['Efectivo', 'QR', 'Mixto'].includes(order.payment) ? order.payment : 'Efectivo');
    setSalesTab('current');
  }

  function printTicket(order: CashierOrder, printWindow?: Window | null, cashDetails?: { given: number; change: number }) {
    if (!data) return;
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    const popup = printWindow || window.open('', '_blank', 'width=520,height=720');
    if (!popup) { setError('Permite las ventanas emergentes para imprimir el ticket.'); return; }
    const rows = order.lines.map(line => `<tr><td>${line.quantity} × ${escape(line.name)}${line.customizations.map(choice => `<br/><small>${escape(choiceSummary(choice))}</small>`).join('')}</td><td>${money(line.subtotal)}</td></tr>`).join('');
    const kitchenRows = order.lines.map(line => `<li><b>${line.quantity} ×</b> ${escape(line.name)}${line.customizations.map(choice => `<div class="notes">${escape(choiceSummary(choice))}</div>`).join('')}</li>`).join('');
    const paymentRows = order.payments.map(item => `<div class="row"><span>${escape(item.method)}</span><b>${money(item.amount)}</b></div>`).join('');
    const cashText = cashDetails && cashDetails.given > 0 ? `<div class="row"><span>Efectivo recibido</span><b>${money(cashDetails.given)}</b></div><div class="row"><span>Cambio a devolver</span><b>${money(cashDetails.change)}</b></div>` : '';
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comprobantes ${escape(order.ticket)}</title><style>@page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{width:72mm;margin:0 auto;font:700 12px Arial,sans-serif;color:#111}.ticket{padding:2mm 0}.ticket+.ticket{break-before:page;page-break-before:always}.center{text-align:center}.order-number{text-align:center;font-size:16px;font-weight:800;margin-bottom:3px}.brand{font-weight:800;font-size:18px}.heading{font-size:15px;font-weight:800;text-align:center;margin:8px 0}.muted{color:#555;font-size:10px;line-height:1.5}.line{border-top:1px dashed #555;margin:9px 0}table{width:100%;border-collapse:collapse}td{padding:4px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}.total,.row{display:flex;justify-content:space-between;gap:8px;padding:3px 0}.total{font-weight:800;font-size:15px;margin-top:8px}.row{font-size:11px}.kitchen-list{padding-left:18px;margin:12px 0}.kitchen-list li{padding:6px 0;font-size:15px;font-weight:700}.notes{margin-top:12px;font-size:12px}</style></head><body><section class="ticket"><div class="order-number">PEDIDO ${escape(order.ticket)}</div><div class="center brand">${escape(data.businessName)}</div><div class="heading">COMANDA PARA COCINA</div><div class="center muted">${escape(data.branchName)}<br/>${new Date(order.date).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}<br/>Cliente: ${escape(order.customer || 'Mostrador')}</div><div class="line"></div><ul class="kitchen-list">${kitchenRows}</ul><div class="line"></div><p class="center muted">Preparar pedido · ${escape(order.ticket)}</p></section><section class="ticket"><div class="order-number">PEDIDO ${escape(order.ticket)}</div><div class="center brand">${escape(data.businessName)}</div><div class="heading">COMPROBANTE DEL CLIENTE</div><div class="center muted">${escape(data.branchName)}<br/>${new Date(order.date).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}<br/>Cliente: ${escape(order.customer || 'Mostrador')}</div><div class="line"></div><table>${rows}</table><div class="line"></div><div class="total"><span>TOTAL</span><span>${money(order.total)}</span></div>${paymentRows}${cashText}<div class="line"></div><p class="center muted">¡Gracias por su compra!</p></section></body></html>`);
    popup.document.close();
    popup.onafterprint = () => popup.close();
    window.setTimeout(() => { if (!popup.closed) { popup.focus(); popup.print(); } }, 350);
  }

  async function submit(action: () => Promise<{ ok: boolean; error?: string; orderId?: string; result?: { data?: CashierSnapshot; error?: string } }>, success: string, onSuccess?: (result: { ok: boolean; orderId?: string; result?: { data?: CashierSnapshot; error?: string } }) => void) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await action();
      if (!result.ok) { setError(result.error || 'No se pudo guardar.'); return false; }
      if (result.result?.data) setData(result.result.data);
      else if (result.result?.error) setError(`Se guardó, pero no se pudo actualizar la pantalla: ${result.result.error}`);
      setMessage(success);
      onSuccess?.(result);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
    return false;
  }

  function openPaymentDialog() {
    const mode = (editingOrder?.payment === 'Mixto' ? 'Mixto' : method) as PaymentMethod;
    setMethod(mode);
    setMixedPayment({ Efectivo: '', QR: '' });
    setCashGiven('');
    setDigitalReceived('');
    setActivePaymentField(mode === 'Mixto' || mode === 'Efectivo' ? 'cashGiven' : 'digitalReceived');
    setPaymentOpen(true);
  }

  function setPaymentMode(value: PaymentMethod) {
    setMethod(value);
    setMixedPayment({ Efectivo: '', QR: '' });
    setCashGiven('');
    setDigitalReceived('');
    setActivePaymentField(value === 'Mixto' || value === 'Efectivo' ? 'cashGiven' : 'digitalReceived');
  }

  function writePaymentField(value: string) {
    if (activePaymentField === 'cashGiven') setCashGiven(value);
    else if (activePaymentField === 'digitalReceived') setDigitalReceived(value);
    else setMixedPayment(current => ({ ...current, [activePaymentField]: value }));
  }

  function pressPaymentKey(key: string) {
    const current = activePaymentField === 'cashGiven' ? cashGiven : activePaymentField === 'digitalReceived' ? digitalReceived : mixedPayment[activePaymentField];
    if (key === '⌫') { writePaymentField(current.slice(0, -1)); return; }
    if (key === '.' && current.includes('.')) return;
    writePaymentField(`${current}${key}`);
  }

  function addQuickPayment(amount: number) {
    const current = activePaymentField === 'cashGiven' ? cashGiven : activePaymentField === 'digitalReceived' ? digitalReceived : mixedPayment[activePaymentField];
    writePaymentField((amountValue(current) + amount).toFixed(2));
  }

  const splitTotal = Object.values(mixedPayment).reduce((sum, amount) => sum + amountValue(amount), 0);
  const cashApplied = method === 'Mixto' ? amountValue(mixedPayment.Efectivo) : method === 'Efectivo' ? total : 0;
  const changeAmount = Math.max(0, amountValue(cashGiven) - cashApplied);
  const paymentItems = method === 'Mixto'
    ? (['Efectivo', 'QR'] as const).flatMap(key => amountValue(mixedPayment[key]) > 0 ? [{ method: key, amount: Number(amountValue(mixedPayment[key]).toFixed(2)) }] : [])
    : [{ method, amount: Number(total.toFixed(2)) }];
  const paymentMatchesTotal = method === 'Mixto'
    ? Math.round(splitTotal * 100) === Math.round(total * 100) && paymentItems.length > 1 && amountValue(cashGiven) >= cashApplied
    : method === 'Efectivo' ? amountValue(cashGiven) >= total : Math.round(amountValue(digitalReceived) * 100) === Math.round(total * 100);

  function confirmPayment() {
    if (!shift || !paymentMatchesTotal || !cart.length || busy) return;
    const printWindow = window.open('', '_blank', 'width=520,height=760');
    if (!printWindow) { setError('El navegador bloqueó la impresión. Permite ventanas emergentes para abrir el PDF de cocina y cliente.'); return; }
    printWindow.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Preparando comprobantes</title></head><body style="font:16px Arial;padding:32px">Preparando comprobantes de cocina y cliente…</body></html>');
    const action = editingOrder
      ? () => updateCashierOrder({ orderId: editingOrder.id, customer, items: cart.map(line => ({ productId: line.productId, quantity: line.quantity, customizations: line.customizations || [] })), payments: paymentItems })
      : () => registerCashierSale({ shiftId: shift.id, customer, items: cart.map(line => ({ productId: line.productId, quantity: line.quantity, customizations: line.customizations || [] })), payments: paymentItems });
    void submit(action, editingOrder ? 'Pedido actualizado.' : 'Venta registrada correctamente.', result => {
      const orders = result.result?.data?.recentOrders || [];
      const savedOrder = orders.find(order => order.id === result.orderId) || orders[0];
      if (savedOrder) printTicket(savedOrder, printWindow, cashApplied > 0 ? { given: amountValue(cashGiven), change: changeAmount } : undefined);
      else { printWindow.close(); setError('El pedido se guardó, pero no pude preparar los comprobantes. Puedes reimprimirlos desde el historial.'); }
    }).then(ok => {
      if (ok) { setPaymentOpen(false); setCart([]); setCustomer(''); setEditingOrderId(null); setSalesTab('history'); }
      else if (!printWindow.closed) printWindow.close();
    });
  }

  if (!data) return <main className="cashier-loading"><ChefHat size={38} /><p>{error || 'Cargando caja…'}</p>{error && <button className="button" onClick={() => void refresh()}>Volver a intentar</button>}</main>;

  const shift = data.shift;
  const header = <header className="cashier-header"><a className="cashier-brand" href="/cajero"><span className="cashier-brand-logo"><Image src="/images/logo-pollos-roly.png" alt="Pollos Roly" width={64} height={64} priority /></span><strong>Pollos Roly<small>PUNTO DE VENTA</small></strong></a><span className={`cashier-shift-pill ${shift ? 'is-open' : ''}`}><i />{shift ? 'Caja abierta' : 'Caja cerrada'}</span><div className="cashier-header-user"><span className="cashier-avatar">{data.profileName.slice(0, 1).toUpperCase()}</span><span>{data.profileName}<small>Cajero</small></span><span className="cashier-header-branch"><Store size={14}/>{data.branchName}</span><Bell className="cashier-bell" size={18}/><form action={signOut}><button className="button" aria-label="Cerrar sesión"><LogOut size={16} />Cerrar sesión</button></form></div></header>;
  if (!shift) return <main className="cashier-page is-opening">
    {header}
    <section className="cashier-open-stage">
      <div className="cashier-open-backdrop-art" aria-hidden="true"><Image src="/images/chicken-header.png" alt="" fill sizes="(max-width: 760px) 0px, 520px" priority /></div>
      <form className="cashier-open-card" onSubmit={event => { event.preventDefault(); void submit(() => openCashierShift({ opening: Number(opening), notes: '' }), 'Caja abierta. Ya puedes empezar a registrar ventas.').then(ok => { if (ok) { setPanel('venta'); setOpening(''); } }); }}>
        <span className="cashier-open-icon"><Wallet size={38} /></span>
        <p className="eyebrow">INICIO DE TURNO · {data.branchName}</p>
        <h1>Apertura de Caja</h1>
        <p className="cashier-open-description">Declara el monto inicial de tu caja (sencillo) para empezar a vender.</p>
        {error && <div className="cashier-alert is-error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Cerrar aviso"><X size={16}/></button></div>}
        <label className="cashier-opening-amount">MONTO INICIAL (BS.)<span><b>Bs.</b><input type="number" min="0" max="10000000" step="0.01" required value={opening} onChange={event => setOpening(event.target.value)} placeholder="0.00" disabled={busy} /></span></label>
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
      <div className="cashier-sales-heading"><div className="cashier-sales-heading-art" aria-hidden="true"><Image src="/images/chicken-header.png" alt="" fill sizes="560px" priority /></div><div className="cashier-sales-title"><p className="eyebrow">PUNTO DE VENTA <span>›</span> {data.branchName}</p><span className="cashier-sales-title-icon"><ShoppingBag size={24}/></span><div><h1>Ventas</h1><p>Registra pedidos y gestiona tus ventas.</p></div></div><div><button className="button cashier-refresh" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/>Actualizar</button><button className="button primary cashier-close-shortcut" onClick={() => setPanel('caja')}><Wallet size={16}/>Cerrar caja</button></div></div>
      <div className="cashier-sales-layout">
        <section className="cashier-catalog"><div className="cashier-catalog-heading"><div><h2><Package size={20}/>Productos</h2><p>Selecciona productos para el pedido actual.</p></div><span className="cashier-count"><Package size={15}/>{products.length}</span></div><div className="cashier-catalog-tools"><div className="cashier-categories">{categories.map(item => { const normalized = item.toLocaleLowerCase('es'); const CategoryIcon = item === 'Todos' ? Grid2X2 : normalized.includes('pollo') ? Drumstick : normalized.includes('snack') ? Popcorn : normalized.includes('bebida') ? CupSoda : ConciergeBell; return <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}><CategoryIcon size={16}/>{item}</button>; })}</div></div><div className="cashier-product-grid">{products.map(product => { const price = product.onSale && product.salePrice != null ? product.salePrice : product.price; const inOrder = editingOrder?.lines.find(line => line.productId === product.id)?.quantity || 0; const outOfStock = product.snack && (product.stock || 0) + inOrder < 1; const qty = cart.find(line => line.productId === product.id)?.quantity || 0; return <button className="cashier-product" key={product.id} disabled={!shift || outOfStock || busy} onClick={() => add(product.id)}><span className="cashier-product-photo">{product.photoPath ? <img src={productPhotoUrl(product.photoPath)} alt=""/> : <ChefHat size={25}/>}</span><span className="cashier-product-info"><strong>{product.name}</strong><small>{product.category}{product.snack ? ` · ${product.stock} disp.` : ''}</small><b>{money(price)}</b></span>{qty > 0 && <span className="cashier-product-qty">{qty}</span>}<span className="cashier-add"><Plus size={16}/></span></button>; })}{!products.length && <div className="cashier-empty">No hay productos activos que coincidan con la búsqueda.</div>}</div></section>
        <aside className="cashier-sales-side">
          <nav className="cashier-sales-tabs" aria-label="Pedido e historial del turno">
            <button className={salesTab === 'current' ? 'selected' : ''} onClick={() => setSalesTab('current')}><ShoppingBag size={19}/>Pedido actual{cart.length > 0 && <i>{cart.reduce((n, line) => n + line.quantity, 0)}</i>}</button>
            <button className={salesTab === 'history' ? 'selected' : ''} onClick={() => setSalesTab('history')}><History size={19}/>Historial del turno</button>
          </nav>
          {salesTab === 'current' ? <section className="cashier-current-order"><div className="cashier-section-heading"><div><h2>{editingOrder ? `Editar ${editingOrder.ticket}` : 'Nuevo pedido'}</h2><p>{cart.reduce((n, line) => n + line.quantity, 0)} productos</p></div>{editingOrder && <button className="cashier-text-button" onClick={() => { setEditingOrderId(null); setCart([]); setCustomer(''); }} disabled={busy}>Cancelar edición</button>}</div><div className="cashier-cart-lines">{cartProducts.map(item => <article className="cashier-cart-line" key={item.id}><div className="cashier-line-info"><strong>{item.name}</strong><small>{money(item.onSale && item.salePrice != null ? item.salePrice : item.price)} c/u</small>{item.customizations.map((choice,index)=><small className="cashier-line-customization" key={index}>{index+1}. {choiceSummary(choice)}</small>)}</div><div className="cashier-quantity"><button onClick={() => changeQuantity(item.id,-1)} aria-label={`Quitar uno de ${item.name}`}><Minus size={13}/></button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id,1)} aria-label={`Agregar uno de ${item.name}`}><Plus size={13}/></button></div><strong className="cashier-line-total">{money(item.quantity*(item.onSale && item.salePrice != null ? item.salePrice : item.price))}</strong></article>)}{!cart.length && <div className="cashier-cart-empty"><ShoppingBag size={27}/><p>El pedido está vacío</p><small>Agrega platos desde el catálogo.</small></div>}</div><div className="cashier-checkout"><div className="cashier-total"><span>Total</span><strong>{money(total)}</strong></div><button className="button primary cashier-submit" disabled={!shift || !cart.length || busy} onClick={openPaymentDialog}><CircleDollarSign size={17}/>{editingOrder ? 'Continuar al pago' : 'Cobrar pedido'}</button></div></section> : <section className="cashier-shift-board"><div className="cashier-shift-summary"><article><small>COMPLETADAS</small><strong>{completedCount}</strong></article><article><small>ANULADAS</small><strong>{cancelledCount}</strong></article><article><small>TOTAL DEL TURNO</small><strong>{money(data.todayTotal)}</strong></article></div><section className="cashier-sold-list"><h3>🍗 Platos vendidos en este turno</h3>{soldProducts.slice(0,12).map(product => <div key={product.name}><strong>{product.name}</strong><span>{product.quantity} unid.</span><b>{money(product.subtotal)}</b></div>)}{!soldProducts.length && <p className="cashier-empty">Todavía no hay productos vendidos en este turno.</p>}</section><div className="cashier-history-tools"><div className="cashier-history-filters">{['Todos','Completadas','Anuladas'].map(filter => <button key={filter} className={historyFilter===filter?'selected':''} onClick={() => setHistoryFilter(filter)}>{filter}</button>)}</div><label><Search size={15}/><input value={historyQuery} onChange={event => setHistoryQuery(event.target.value)} placeholder="Buscar por cliente o ticket…" aria-label="Buscar pedidos del turno"/></label></div><div className="cashier-order-history">{filteredHistory.map(order => <article key={order.id} className={order.status==='Cancelado'?'cancelled':''}><div className="cashier-order-ticket"><strong>#{order.ticket.replace(/^R-0*/, '')}</strong><small>{new Date(order.date).toLocaleTimeString('es-BO',{timeZone:'America/La_Paz',hour:'2-digit',minute:'2-digit'})}</small></div><div className="cashier-order-description"><strong>{order.status==='Cancelado'?'Anulada':order.status}</strong><small>{order.customer || 'Cliente de mostrador'} · {order.payment}</small></div><b className="cashier-order-amount">{money(order.total)}</b><div className="cashier-order-actions">{order.status!=='Cancelado' && shift && <button title="Editar pedido" aria-label={`Editar ${order.ticket}`} disabled={busy} onClick={() => beginEdit(order)}><Pencil size={15}/></button>}<button title="Reimprimir ticket" aria-label={`Reimprimir ${order.ticket}`} onClick={() => printTicket(order)}><Printer size={15}/></button>{order.status!=='Cancelado' && shift && <button title="Anular pedido" aria-label={`Anular ${order.ticket}`} disabled={busy} onClick={() => { void submit(() => cancelCashierOrder(order.id),'Pedido anulado. Ya no cuenta en las ventas.',() => setHistoryFilter('Anuladas')); }}><Ban size={15}/></button>}</div></article>)}{!filteredHistory.length && <div className="cashier-empty">No hay pedidos que coincidan con este filtro.</div>}</div></section>}
        </aside>
      </div>
    </>}
    {panel === 'caja' && <><div className="cashier-cash-heading"><div><p className="eyebrow">TURNO · {data.branchName}</p><h1>Caja</h1></div><button className="button" onClick={() => setPanel('venta')}><ShoppingBag size={16}/>Volver a ventas</button></div><div className="cashier-cash-grid">{!shift ? <section className="cashier-cash-card"><div className="cashier-cash-icon"><Wallet size={22} /></div><h2>Abrir turno de caja</h2><p>Cuenta el efectivo con el que inicias. Solo puede haber un turno abierto en esta sucursal.</p><form onSubmit={event => { event.preventDefault(); void submit(() => openCashierShift({ opening: Number(opening), notes: '' }), 'Turno de caja abierto.'); }}><label>Fondo inicial (Bs)<input type="number" min="0" step="0.01" required value={opening} onChange={e => setOpening(e.target.value)} placeholder="0.00" /></label><button className="button primary" disabled={busy}><Check size={16} />Abrir caja</button></form></section> : <>
      <section className="cashier-cash-card"><div className="cashier-cash-card-heading"><div><div className="cashier-cash-icon"><Wallet size={22} /></div><h2>Turno abierto</h2><p>{data.branchName} · {new Date(shift.openedAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</p></div><span className="cashier-shift-pill is-open"><i />Activo</span></div><div className="cashier-cash-numbers"><div><small>Fondo inicial</small><strong>{money(shift.opening)}</strong></div><div><small>Efectivo esperado</small><strong>{money(data.expectedCash)}</strong></div></div></section>
      <section className="cashier-cash-card cashier-close-card"><div className="cashier-cash-icon"><Check size={22} /></div><h2>Cerrar turno</h2><p>El efectivo esperado se calcula automáticamente con el fondo inicial y las ventas en efectivo. Cuenta el dinero disponible e ingresa el monto exacto.</p><form onSubmit={event => { event.preventDefault(); void submit(() => closeCashierShift({ shiftId: shift.id, counted: Number(counted), notes: '' }), 'Turno cerrado y arqueo guardado.'); }}><label>Efectivo contado (Bs)<input type="number" min="0" step="0.01" required value={counted} onChange={e => setCounted(e.target.value)} placeholder={data.expectedCash.toFixed(2)} /></label><div className="cashier-expected"><span>Diferencia estimada</span><strong>{money(Number(counted || 0) - data.expectedCash)}</strong></div><button className="button primary" disabled={busy}><Check size={16} />Cerrar y guardar arqueo</button></form></section>
    </>}</div></>}
    {customizingProduct && panel === 'venta' && <div className="cashier-chicken-overlay" onMouseDown={() => setCustomizingProductId(null)}><section className="cashier-chicken-dialog" role="dialog" aria-modal="true" aria-labelledby="cashier-chicken-title" onMouseDown={event => event.stopPropagation()}><header><div><small>PERSONALIZA ESTA PORCIÓN</small><h2 id="cashier-chicken-title">{customizingProduct.name}</h2><p>Selecciona una presa, preparación y acompañamientos.</p></div><button type="button" aria-label="Cerrar personalización" onClick={() => setCustomizingProductId(null)}><X size={18}/></button></header><section className="cashier-choice-group"><div className="cashier-choice-heading"><span>🍗</span><div><strong>Elige la presa</strong><small>Las opciones dependen de este producto.</small></div></div><div className="cashier-choice-options">{(customizingProduct.pieceType === 'all' ? ['Pechuga','Ala','Pierna','Contra'] as const : customizingProduct.pieceType === 'leg_thigh' ? ['Pierna','Contra'] as const : ['Pechuga','Ala'] as const).map(piece => <button type="button" key={piece} className={selectedPiece===piece?'selected':''} onClick={() => setSelectedPiece(piece)}><Drumstick size={17}/>{piece}</button>)}</div></section><section className="cashier-choice-group"><div className="cashier-choice-heading"><Flame size={18}/><div><strong>Preparación</strong><small>¿Cómo lo preparamos?</small></div></div><div className="cashier-choice-options cashier-preparation-options">{(['Brasa','Broaster'] as const).map(preparation => <button type="button" key={preparation} className={selectedPreparation===preparation?'selected':''} onClick={() => setSelectedPreparation(preparation)}>{preparation==='Brasa'?'🔥':'🍗'} {preparation}</button>)}</div></section><section className="cashier-choice-group"><div className="cashier-choice-heading"><span>🍚</span><div><strong>Acompañamientos</strong><small>Elige arroz, fideo o papa.</small></div><button type="button" className="cashier-complete-choice" onClick={() => setSelectedAccompaniments(selectedAccompaniments.length===3?[]:['Arroz','Fideo','Papa'])}>{selectedAccompaniments.length===3?'Completo':'Marcar completo'}</button></div><div className="cashier-choice-options cashier-side-options">{(['Arroz','Fideo','Papa'] as const).map(side => <button type="button" key={side} className={selectedAccompaniments.includes(side)?'selected':''} aria-pressed={selectedAccompaniments.includes(side)} onClick={() => setSelectedAccompaniments(current => current.includes(side)?current.filter(item=>item!==side):[...current,side])}><span>{side==='Arroz'?'🍚':side==='Fideo'?'🍝':'🥔'}</span>{side}<i>{selectedAccompaniments.includes(side)?'✓':'+'}</i></button>)}</div></section><div className="cashier-chicken-preview"><span>{selectedPiece} · {selectedPreparation}</span><small>{selectedAccompaniments.length?selectedAccompaniments.join(' · '):'Sin acompañamientos'}</small></div><footer><button type="button" className="cashier-payment-cancel" onClick={() => setCustomizingProductId(null)}>Cancelar</button><button type="button" className="cashier-payment-confirm" onClick={addChickenChoice}><Plus size={17}/>Agregar al pedido</button></footer></section></div>}    {paymentOpen && panel === 'venta' && <div className="cashier-payment-overlay" onMouseDown={() => !busy && setPaymentOpen(false)}><section className="cashier-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="cashier-payment-title" onMouseDown={event => event.stopPropagation()}><header><div><small>COBRO DEL PEDIDO</small><h2 id="cashier-payment-title">Registrar pago</h2></div><button type="button" aria-label="Cerrar cobro" onClick={() => !busy && setPaymentOpen(false)}><X size={19}/></button></header><div className="cashier-payment-due"><span>Total a pagar</span><strong>{money(total)}</strong></div><label className="cashier-payment-customer">Nombre del cliente (opcional)<input value={customer} onChange={event => setCustomer(event.target.value)} placeholder="Ej. Juan" maxLength={60} autoComplete="given-name" /></label><div className="cashier-payment-methods">{([{id:'Efectivo',label:'Efectivo',icon:CircleDollarSign},{id:'QR',label:'QR',icon:QrCode},{id:'Mixto',label:'Mixto',icon:ArrowDownUp}] as const).map(({id,label,icon:Icon}) => <button type="button" key={id} className={method===id?'selected':''} onClick={() => setPaymentMode(id)}><Icon size={18}/>{label}</button>)}</div>{method==='Mixto' ? <div className="cashier-payment-splits"><div className="cashier-payment-split-heading"><strong>Distribuye el total entre los métodos</strong><span className={Math.round(splitTotal*100)===Math.round(total*100)?'balanced':''}>{money(splitTotal)} / {money(total)}</span></div><div className="cashier-payment-split-fields">{(['Efectivo','QR'] as const).map((key) => <label key={key} className={activePaymentField===key?'active':''} onClick={() => setActivePaymentField(key)}>{key}<span>Bs.</span><input type="number" min="0" step="0.01" inputMode="decimal" value={mixedPayment[key]} onFocus={() => setActivePaymentField(key)} onChange={event => setMixedPayment(current => ({...current,[key]:event.target.value}))} placeholder="0.00" aria-label={`Monto por ${key}`}/></label>)}</div><label className={`cashier-payment-given ${activePaymentField==='cashGiven'?'active':''}`}>Efectivo recibido del cliente<span>Bs.</span><input type="number" min="0" step="0.01" inputMode="decimal" value={cashGiven} onFocus={() => setActivePaymentField('cashGiven')} onChange={event => setCashGiven(event.target.value)} placeholder="0.00"/></label></div> : method==='Efectivo' ? <label className={`cashier-payment-given ${activePaymentField==='cashGiven'?'active':''}`}>Monto que entrega el cliente<span>Bs.</span><input type="number" min="0" step="0.01" inputMode="decimal" value={cashGiven} onFocus={() => setActivePaymentField('cashGiven')} onChange={event => setCashGiven(event.target.value)} placeholder="0.00"/></label> : <label className={`cashier-payment-given ${activePaymentField==='digitalReceived'?'active':''}`}>Monto recibido por {method}<span>Bs.</span><input type="number" min="0" step="0.01" inputMode="decimal" value={digitalReceived} onFocus={() => setActivePaymentField('digitalReceived')} onChange={event => setDigitalReceived(event.target.value)} placeholder="0.00" /></label>}<div className="cashier-payment-results"><div><span>{method==='Mixto'?'Total distribuido':'Por cobrar'}</span><strong>{method==='Mixto'?money(splitTotal):money(total)}</strong></div>{(method==='Efectivo'||method==='Mixto') && <><div><span>Efectivo recibido</span><strong>{money(amountValue(cashGiven))}</strong></div><div className="cashier-change"><span>Cambio a devolver</span><strong>{money(changeAmount)}</strong></div></>}{method==='QR' && <div><span>Monto recibido</span><strong>{money(amountValue(digitalReceived))}</strong></div>}</div><div className="cashier-payment-pad"><div className="cashier-number-pad">{['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(key => <button type="button" key={key} onClick={() => pressPaymentKey(key)}>{key}</button>)}</div><div className="cashier-quick-pad">{[10,50,100].map(amount => <button type="button" key={amount} onClick={() => addQuickPayment(amount)}>+{amount}</button>)}<button type="button" onClick={() => writePaymentField('')}>Borrar</button></div></div>{!paymentMatchesTotal && <p className="cashier-payment-warning">{method==='Mixto'?'Distribuye el total completo en al menos dos métodos y verifica el efectivo recibido.':'El monto recibido debe cubrir el total del pedido.'}</p>}<footer><button type="button" className="cashier-payment-cancel" onClick={() => setPaymentOpen(false)} disabled={busy}>Cancelar</button><button type="button" className="cashier-payment-confirm" onClick={confirmPayment} disabled={busy||!paymentMatchesTotal}>{busy?'Guardando…':editingOrder?'Confirmar cambios':'Confirmar pedido'}<Check size={17}/></button></footer></section></div>}
    <footer className="cashier-footer">{data.businessName} · Punto de venta · {data.branchName}</footer>
  </main>;
}
