'use client';

import { useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { Branch, Data, localDate, StaffPayment } from '../lib/data';

const paymentTypes = ['Pago Diario', 'Pago Semanal', 'Pago Quincenal', 'Pago Mensual', 'Horas Extra', 'Bono', 'Otro'];

type Draft = Omit<StaffPayment, 'id'>;
type Props = {
  data: Data;
  payment?: StaffPayment;
  saving: boolean;
  error: string;
  cancel: () => void;
  save: (record: Draft) => Promise<boolean>;
};

export default function StaffPaymentEditor({ data, payment, saving, error, cancel, save }: Props) {
  const [employee, setEmployee] = useState(payment?.employee || '');
  const [employeeName, setEmployeeName] = useState(payment?.employeeName || data.employees.find(item => item.id === payment?.employee)?.name || '');
  const [branch, setBranch] = useState(payment?.branch || data.branches.find(item => item.active)?.id || '');
  const [paymentType, setPaymentType] = useState(payment?.paymentType || 'Pago Diario');
  const [amount, setAmount] = useState(payment?.amount ? String(payment.amount) : '');
  const [date, setDate] = useState(payment?.date || localDate());
  const [status, setStatus] = useState(payment?.status || 'Pagado');
  const [concept, setConcept] = useState(payment?.concept || '');
  const [observations, setObservations] = useState(payment?.observations || '');

  const employeeOptions = data.employees.filter(item => item.active || item.id === employee);
  const branchOptions: Branch[] = data.branches.filter(item => item.active || item.id === branch);
  const manual = !employee;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!employeeName.trim()) return;
    if (!branch) return;
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    const period = date.slice(0, 7);
    await save({
      employee,
      employeeName: employeeName.trim(),
      branch,
      paymentType,
      amount: numericAmount,
      date,
      status,
      concept: concept.trim(),
      observations: observations.trim(),
      period,
      method: payment?.method || 'Efectivo',
    });
  }

  return <form className="staff-payment-editor" onSubmit={submit}>
    <div className="staff-payment-fields">
      <label>Empleado<select value={employee} onChange={event => {
        const selected = event.target.value;
        setEmployee(selected);
        const person = data.employees.find(item => item.id === selected);
        if (person) { setEmployeeName(person.name); setBranch(person.branch); }
      }}><option value="">— Escribir nombre manualmente —</option>{employeeOptions.map(item => <option key={item.id} value={item.id}>{item.name} · {data.branches.find(b => b.id === item.branch)?.name || 'Sin sucursal'}</option>)}</select></label>
      <label>Nombre del Empleado *<input required maxLength={160} value={employeeName} readOnly={!manual} onChange={event => setEmployeeName(event.target.value)} placeholder="Ej: Juan Pérez" /></label>
      <label>Sucursal *<select required value={branch} disabled={!manual && Boolean(employee)} onChange={event => setBranch(event.target.value)}><option value="">Selecciona una sucursal</option>{branchOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Tipo de Pago *<select required value={paymentType} onChange={event => setPaymentType(event.target.value)}>{paymentTypes.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Monto (Bs.) *<input required type="number" min="0.01" max="10000000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
      <label>Fecha del Pago *<span className="staff-payment-date"><CalendarDays size={16} /><input required type="date" value={date} onChange={event => setDate(event.target.value)} /></span></label>
      <label className={`staff-payment-status ${status === 'Pagado' ? 'is-paid' : ''}`}>Estado del Registro *<select value={status} onChange={event => setStatus(event.target.value)}><option value="Pagado">✅ Ya se entregó (Pagado)</option><option value="Pendiente">Pendiente de entrega</option></select></label>
      <label className="staff-payment-wide">Concepto / Descripción *<input required maxLength={500} value={concept} onChange={event => setConcept(event.target.value)} placeholder="Ej: Sueldo semanal, Horas extra, Bono por productividad…" /></label>
      <label className="staff-payment-wide">Observaciones (opcional)<textarea maxLength={1000} rows={3} value={observations} onChange={event => setObservations(event.target.value)} placeholder="Notas adicionales…" /></label>
    </div>
    {data.employees.length === 0 && <p className="staff-payment-hint">No hay empleados vinculados; puedes escribir el nombre manualmente. Para elegir cuentas del sistema, asígnales una sucursal y ejecuta la migración 09 de nómina.</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="staff-payment-footer"><button type="button" className="button" onClick={cancel} disabled={saving}>Cancelar</button><button type="submit" className="button primary" disabled={saving}><Plus size={17} />{saving ? 'Guardando…' : payment ? 'Guardar cambios' : 'Registrar Pago'}</button></div>
  </form>;
}
