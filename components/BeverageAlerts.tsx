'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CupSoda, RefreshCw } from 'lucide-react';
import { BeverageAlert, loadBeverageAlerts, transferBeverageStock } from '../app/beverages/actions';

type Props = { products: { id: string; name: string }[]; branches: { id: string; name: string }[]; onTransferred?: () => void };

export default function BeverageAlerts({ products, branches, onTransferred }: Props) {
  const [alerts, setAlerts] = useState<BeverageAlert[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const seen = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const result = await loadBeverageAlerts();
    if (!result.alerts) { setError(result.error || 'No se pudieron cargar las alertas.'); return; }
    setError('');
    setAlerts(result.alerts);
    const current = new Set(result.alerts.map(row => row.id));
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const row of result.alerts) if (!seen.current.has(row.id)) {
        const name = products.find(item => item.id === row.productId)?.name || 'Bebida';
        const branch = branches.find(item => item.id === row.branchId)?.name || 'Sucursal';
        try { new Notification(`Stock mínimo en freezer: ${name}`, { body: `${branch}: quedan ${row.freezer} unidades. Mínimo: ${row.minimum}. Almacén: ${row.warehouse}.`, tag: `bebida-${row.id}` }); }
        catch { /* La alerta sigue disponible dentro del sistema si el navegador no admite notificaciones del sistema. */ }
      }
    }
    seen.current = current;
  }, [products, branches]);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => { void refresh(); }, 15000); return () => window.clearInterval(timer); }, [refresh]);
  useEffect(() => { if (typeof Notification !== 'undefined') setPermission(Notification.permission); }, []);

  async function enableNotifications() {
    if (typeof Notification === 'undefined') { setError('Este navegador no permite notificaciones. Las alertas seguirán visibles aquí.'); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') { seen.current.clear(); void refresh(); }
  }

  async function transfer(id: string) {
    const amount = Number(quantity);
    if (!Number.isSafeInteger(amount) || amount <= 0) { setError('Escribe una cantidad entera mayor que cero.'); return; }
    setSaving(true); setError('');
    const result = await transferBeverageStock(id, amount);
    setSaving(false);
    if (!result.ok) { setError(result.error || 'No se pudo trasladar la bebida.'); return; }
    setSelected(null); setQuantity('');
    await refresh(); onTransferred?.();
  }

  if (!alerts.length && !error) return null;
  return <section className="beverage-alerts" aria-label="Alertas de bebidas en freezer">
    <div className="beverage-alerts-header"><span><Bell size={17} />Bebidas que llegaron al mínimo en freezer <b>{alerts.length}</b></span><div>{permission !== 'granted' && <button type="button" onClick={enableNotifications}>Activar avisos en este dispositivo</button>}<button type="button" onClick={() => void refresh()} aria-label="Actualizar alertas de bebidas"><RefreshCw size={15} /></button></div></div>
    {error && <p className="beverage-alert-error" role="alert">{error}</p>}
    {alerts.map(row => <div className="beverage-alert-row" key={row.id}><CupSoda size={19} /><div><strong>{products.find(item => item.id === row.productId)?.name || 'Bebida'}</strong><small>{branches.find(item => item.id === row.branchId)?.name || 'Sucursal'} · Freezer: {row.freezer} · Mínimo: {row.minimum} · Almacén: {row.warehouse}</small></div>{row.warehouse > 0 && <button type="button" className="beverage-replenish" onClick={() => { setSelected(selected === row.id ? null : row.id); setQuantity(''); }}>Pasar al freezer</button>}{selected === row.id && <form onSubmit={event => { event.preventDefault(); void transfer(row.id); }}><input type="number" min="1" max={row.warehouse} step="1" value={quantity} onChange={event => setQuantity(event.target.value)} aria-label="Unidades a trasladar desde almacén" placeholder="Cantidad" required /><button disabled={saving} type="submit">{saving ? 'Guardando…' : 'Confirmar'}</button></form>}</div>)}
  </section>;
}
