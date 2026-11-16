'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { Branch, Data, localDate, StaffPayment } from '../lib/data';

const paymentTypes = ['Pago Diario', 'Pago Semanal', 'Pago Quincenal', 'Pago Mensual', 'Horas Extra', 'Bono', 'Otro'];
type Draft = Omit<StaffPayment, 'id'>;
type Preview = { amount: number; count: number; minutes: number };
type Props = {
  data: Data;
  payment?: StaffPayment;
  saving: boolean;
  error: string;
  cancel: () => void;
  save: (record: Draft) => Promise<boolean>;
  loadAttendanceDiscount: (employeeId: string, date: string) => Promise<{ preview?: Preview; error?: string }>;
};
const money = (amount: number) => `Bs ${amount.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function StaffPaymentEditor({ data, payment, saving, error, cancel, save, loadAttendanceDiscount }: Props) {
  const [employee, setEmployee] = useState(payment?.employee || '');
  const [employeeName, setEmployeeName] = useState(payment?.employeeName || data.employees.find(item => item.id === payment?.employee)?.name || '');
  const [branch, setBranch] = useState(payment?.branch || data.branches.find(item => item.active)?.id || '');
  const [paymentType, setPaymentType] = useState(payment?.paymentType || 'Pago Diario');
  const [grossAmount, setGrossAmount] = useState(String(payment?.grossAmount ?? payment?.amount ?? ''));
  const [date, setDate] = useState(payment?.date || localDate());
  const [status, setStatus] = useState(payment?.status || 'Pagado');
  const [concept, setConcept] = useState(payment?.concept || '');
  const [observations, setObservations] = useState(payment?.observations || '');
  const [preview, setPreview] = useState<Preview | null>(payment ? { amount: payment.lateFineDiscount || 0, count: 0, minutes: 0 } : null);
  const [previewError, setPreviewError] = useState('');
  const [checking, setChecking] = useState(false);
  const requestId = useRef(0);
  const employeeOptions = data.employees.filter(item => item.active || item.id === employee);
  const branchOptions: Branch[] = data.branches.filter(item => item.active || item.id === branch);
  const manual = !employee;
  const selectedEmployee = data.employees.find(item => item.id === employee);
  const numericGross = Number(grossAmount);
  const discount = preview ? Math.min(preview.amount, Math.max(0, numericGross || 0)) : 0;
  const netAmount = Math.max(0, Math.round((numericGross - discount) * 100) / 100);
  const canSave = !saving && (!employee || Boolean(preview)) && Number.isFinite(numericGross) && numericGross > 0;
  const autoPayType = ['Pago Diario', 'Pago Semanal', 'Pago Quincenal', 'Pago Mensual'].includes(paymentType);
  const payDescription = paymentType === 'Pago Diario'
    ? `Tarifa diaria ${date && (new Date(`${date}T12:00:00`).getDay() === 0 || new Date(`${date}T12:00:00`).getDay() === 6) ? 'de fin de semana' : 'entre semana'}.`
    : `Calculado con las tarifas diarias entre semana y de fin de semana para el período ${paymentType.toLowerCase()}.`;

  useEffect(() => {
    if (!selectedEmployee || payment) return;
    if (!['Pago Diario', 'Pago Semanal', 'Pago Quincenal', 'Pago Mensual'].includes(paymentType)) return;
    const end = new Date(`${date}T12:00:00`);
    if (Number.isNaN(end.getTime())) return;
    const days = paymentType === 'Pago Diario' ? 1 : paymentType === 'Pago Semanal' ? 7 : paymentType === 'Pago Quincenal' ? 15 : new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    let total = 0;
    for (let offset = 0; offset < days; offset++) {
      const day = new Date(end);
      if (paymentType === 'Pago Mensual') day.setDate(1 + offset);
      else day.setDate(end.getDate() - offset);
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      total += weekend ? selectedEmployee.weekendDailyPay : selectedEmployee.weekdayDailyPay;
    }
    setGrossAmount((Math.round(total * 100) / 100).toFixed(2));
  }, [selectedEmployee, date, paymentType, payment]);

  useEffect(() => {
    if (!employee || payment) { setPreview(null); setPreviewError(''); setChecking(false); return; }
    const currentRequest = ++requestId.current;
    setPreview(null);
    setPreviewError('');
    setChecking(true);
    loadAttendanceDiscount(employee, date).then(result => {
      if (requestId.current !== currentRequest) return;
      if (result.error) setPreviewError(result.error);
      else setPreview(result.preview || { amount: 0, count: 0, minutes: 0 });
    }).catch(() => { if (requestId.current === currentRequest) setPreviewError('No se pudo consultar las tardanzas pendientes.'); })
      .finally(() => { if (requestId.current === currentRequest) setChecking(false); });
    return () => { if (requestId.current === currentRequest) requestId.current++; };
  }, [employee, date, payment, loadAttendanceDiscount]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeName.trim() || !branch || !Number.isFinite(numericGross) || numericGross <= 0) return;
    if (employee && !preview) return;
    const period = date.slice(0, 7);
    await save({
      employee, employeeName: employeeName.trim(), branch, paymentType,
      amount: netAmount, grossAmount: numericGross, lateFineDiscount: discount,
      date, status, concept: concept.trim(), observations: observations.trim(), period,
      method: payment?.method || 'Efectivo',
    });
  }

  return <form className="staff-payment-editor" onSubmit={submit}>
    <div className="staff-payment-fields">
      <label>Empleado<select value={employee} disabled={Boolean(payment)} onChange={event => {
        const selected = event.target.value;
        setEmployee(selected);
        const person = data.employees.find(item => item.id === selected);
        if (person) { setEmployeeName(person.name); setBranch(person.branch); }
      }}><option value="">— Escribir nombre manualmente —</option>{employeeOptions.map(item => <option key={item.id} value={item.id}>{item.name} · {data.branches.find(b => b.id === item.branch)?.name || 'Sin sucursal'}</option>)}</select></label>
      <label>Nombre del Empleado *<input required maxLength={160} value={employeeName} readOnly={!manual} onChange={event => setEmployeeName(event.target.value)} placeholder="Ej: Juan Pérez" /></label>
      <label>Sucursal *<select required value={branch} disabled={!manual || Boolean(payment)} onChange={event => setBranch(event.target.value)}><option value="">Selecciona una sucursal</option>{branchOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Tipo de Pago *<select required value={paymentType} onChange={event => setPaymentType(event.target.value)}>{paymentTypes.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>{employee && autoPayType ? 'Monto calculado (Bs.) *' : 'Monto ganado bruto (Bs.) *'}<input required type="number" min="0.01" max="10000000" step="0.01" value={grossAmount} readOnly={Boolean(payment) || Boolean(employee && autoPayType)} onChange={event => setGrossAmount(event.target.value)} placeholder="0.00" />{employee && <small>{autoPayType ? payDescription : 'Para bonos u horas extra, ingresa el monto manualmente.'}</small>}</label>
      <label>Fecha del Pago *<span className="staff-payment-date"><CalendarDays size={16} /><input required type="date" value={date} disabled={Boolean(payment)} onChange={event => setDate(event.target.value)} /></span></label>
      <label className={`staff-payment-status ${status === 'Pagado' ? 'is-paid' : ''}`}>Estado del Registro *<select value={status} onChange={event => setStatus(event.target.value)}><option value="Pagado">✅ Ya se entregó (Pagado)</option><option value="Pendiente">Pendiente de entrega</option></select></label>
      <label className="staff-payment-wide">Concepto / Descripción *<input required maxLength={500} value={concept} onChange={event => setConcept(event.target.value)} placeholder="Ej: Sueldo semanal, Horas extra, Bono por productividad…" /></label>
      <label className="staff-payment-wide">Observaciones (opcional)<textarea maxLength={1000} rows={3} value={observations} onChange={event => setObservations(event.target.value)} placeholder="Notas adicionales…" /></label>
    </div>
    {employee && <section className="staff-payment-deduction" aria-live="polite">
      <div><strong>Descuento automático por tardanzas</strong><small>{checking ? 'Consultando multas pendientes…' : preview ? `${preview.count} tardanza(s) pendiente(s)${preview.minutes ? ` · ${preview.minutes} minutos acumulados` : ''}` : 'Esperando cálculo de asistencia'}</small></div>
      <strong>{preview ? money(discount) : '—'}</strong>
      {preview && <div className="staff-payment-net"><span>Monto neto a pagar</span><strong>{money(netAmount)}</strong></div>}
    </section>}
    {previewError && <p className="error-banner" role="alert">{previewError}</p>}
    {data.employees.length === 0 && <p className="staff-payment-hint">No hay empleados vinculados; puedes escribir el nombre manualmente. Para elegir cuentas del sistema, asígnales una sucursal y ejecuta la migración 09 de nómina.</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="staff-payment-footer"><button type="button" className="button" onClick={cancel} disabled={saving}>Cancelar</button><button type="submit" className="button primary" disabled={!canSave}><Plus size={17} />{saving ? 'Guardando…' : payment ? 'Guardar cambios' : 'Registrar Pago'}</button></div>
  </form>;
}
