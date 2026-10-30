'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { Data, localDate } from '../lib/data';
import { normalizedStockName, PurchaseDraft, PurchaseItem, purchaseLineTotal, purchaseTotal, purchaseUnits, validatePurchaseDraft } from '../lib/purchases';

const money = (n: number) => `${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`;
type Line = PurchaseItem & { key: string };
type Props = { data: Data; initialBranch?: string; error: string; clearError: () => void; cancel: () => void; save: (draft: PurchaseDraft) => Promise<boolean> };

export default function PurchaseEditor({ data, initialBranch, error, clearError, cancel, save }: Props) {
  const branches = data.branches.filter(b => b.active);
  const [id] = useState(() => crypto.randomUUID());
  const [branch, setBranch] = useState(branches.some(b => b.id === initialBranch) ? initialBranch! : branches[0]?.id || '');
  const [supplier, setSupplier] = useState('');
  const [receipt, setReceipt] = useState('');
  const [date, setDate] = useState(localDate());
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('unidades');
  const [quantity, setQuantity] = useState('1');
  const [cost, setCost] = useState('0');
  const [items, setItems] = useState<Line[]>([]);
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const availableStock = data.stock.filter(s => s.branch === branch);
  const matched = availableStock.find(s => normalizedStockName(s.name) === normalizedStockName(name));
  const queued = items.find(s => normalizedStockName(s.name) === normalizedStockName(name));
  const selectedUnit = matched?.unit || queued?.unit || unit;
  const total = purchaseTotal(items);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busyRef.current) return;
    try {
      if (items.length >= 100) throw new Error('La compra admite hasta 100 insumos.');
      const line = { stock: matched?.id || queued?.stock || null, name: matched?.name || queued?.name || name.trim(), unit: selectedUnit, quantity: Number(quantity), unitCost: Number(cost) };
      validatePurchaseDraft({ id, branch, supplier, receipt, date, notes, items: [line] });
      setItems(current => [...current, { ...line, key: crypto.randomUUID() }]);
      setName(''); setQuantity('1'); setCost('0'); setUnit('unidades'); setLocalError(''); clearError(); nameInput.current?.focus();
    } catch (e) { setLocalError((e as Error).message); }
  }
  async function confirm() {
    if (busyRef.current) return;
    setLocalError(''); clearError();
    try {
      if (name.trim()) throw new Error('Tienes un insumo pendiente. Añádelo a la lista o borra su nombre antes de confirmar.');
      const draft = validatePurchaseDraft({ id, branch, supplier, receipt, date, notes, items });
      busyRef.current = true; setBusy(true);
      if (await save(draft)) cancel();
    } catch (e) { setLocalError((e as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="modal purchase-modal" aria-labelledby="purchase-dialog-title" onCancel={e => { if (busyRef.current) e.preventDefault(); else cancel(); }} onClick={e => { if (e.target === e.currentTarget && !busyRef.current) cancel(); }}>
    <div className="purchase-heading"><h2 id="purchase-dialog-title"><ShoppingCart size={27} />Registrar nueva compra</h2><button type="button" className="icon-button" aria-label="Cerrar registro de compra" disabled={busy} onClick={cancel}><X size={22} /></button></div>
    <div className="purchase-content">
      <fieldset className="purchase-meta" disabled={busy}>
        <label>Sucursal *<select value={branch} disabled={items.length > 0} onChange={e => { setBranch(e.target.value); setName(''); setUnit('unidades'); }}><option value="" disabled>Selecciona una sucursal</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Proveedor<select value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">— Sin proveedor / Varios —</option>{data.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>N.º de comprobante<input value={receipt} maxLength={120} onChange={e => setReceipt(e.target.value)} placeholder="Ej. 001-492" /></label>
      </fieldset>
      {!branches.length && <p className="purchase-hint">Crea o activa una <Link href="/admin/sucursales">sucursal</Link> para registrar compras.</p>}
      <div className="purchase-date"><label>Fecha de compra<input type="date" value={date} disabled={busy} onChange={e => setDate(e.target.value)} onInput={e => setDate(e.currentTarget.value)} /></label>{items.length > 0 && <small>Quita los insumos de la lista para cambiar de sucursal.</small>}</div>
      <div className="purchase-panels">
        <form className="purchase-add-panel" onSubmit={add}>
          <h3>Agregar insumos</h3>
          <fieldset disabled={busy || !branch}>
            <label>¿QUÉ COMPRASTE? *<input ref={nameInput} list="purchase-stock-options" required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Tomates, o escoba…" /></label>
            <datalist id="purchase-stock-options">{availableStock.map(s => <option key={s.id} value={s.name}>{s.unit}</option>)}</datalist>
            <p className="purchase-hint">Escribe libremente o selecciona uno de la lista.{name.trim() && !matched && <span> Se creará en el inventario de esta sucursal al confirmar.</span>}</p>
            <div className="purchase-line-fields"><label>CANTIDAD COMPRADA<input aria-label="Cantidad comprada" type="number" required min="0.01" max="1000000" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>PRECIO UNITARIO (Bs.)<input aria-label="Precio unitario (Bs.)" type="number" required min="0.01" max="1000000" step="0.01" value={cost} onChange={e => setCost(e.target.value)} /></label></div>
            <label>UNIDAD<select value={selectedUnit} disabled={!!matched || !!queued} onChange={e => setUnit(e.target.value)}>{purchaseUnits.map(u => <option key={u}>{u}</option>)}</select></label>
            <button type="submit" className="button primary purchase-add-button" disabled={!name.trim() || Number(quantity) <= 0 || Number(cost) <= 0 || items.length >= 100}><Plus size={16} />Añadir a la lista</button>
          </fieldset>
        </form>
        <section className="purchase-detail" aria-labelledby="purchase-detail-title">
          <div className="purchase-detail-heading"><h3 id="purchase-detail-title">Detalle de la compra</h3><span className="purchase-count">{items.length} {items.length === 1 ? 'ítem' : 'ítems'}</span></div>
          {!items.length ? <div className="purchase-empty">La lista está vacía. Añade insumos con el panel lateral.</div> : <div className="purchase-items" role="list" aria-label="Insumos de la compra">{items.map((item, index) => <div className="purchase-item" role="listitem" key={item.key}><div><strong>{item.name}</strong><small>{item.quantity} {item.unit} × {money(item.unitCost)}</small></div><b>{money(purchaseLineTotal(item.quantity, item.unitCost))}</b><button type="button" className="icon-button" aria-label={`Quitar ${item.name}, ítem ${index + 1}`} disabled={busy} onClick={() => { setItems(current => current.filter(i => i.key !== item.key)); setLocalError(''); clearError(); }}><Trash2 size={17} /></button></div>)}</div>}
          <div className="purchase-total"><strong>Total general:</strong><output aria-label="Total general de la compra">{money(total)}</output></div>
        </section>
      </div>
      <label className="purchase-notes">OBSERVACIONES ADICIONALES<textarea rows={2} value={notes} maxLength={2000} disabled={busy} onChange={e => setNotes(e.target.value)} placeholder="Ej. Compra realizada en efectivo para reabastecimiento urgente" /></label>
      {(localError || error) && <p className="error-banner" role="alert">{localError || error}</p>}
    </div>
    <div className="purchase-footer"><button type="button" className="button" disabled={busy} onClick={cancel}>Cancelar</button><button type="button" className="button primary" disabled={busy || !items.length || !branch} onClick={confirm}><Check size={18} />{busy ? 'Registrando compra…' : 'Confirmar registro de compra'}</button></div>
  </dialog>;
}
