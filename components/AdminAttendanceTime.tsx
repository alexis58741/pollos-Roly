'use client';

import { useEffect, useState } from 'react';
import { Banknote, Check, Clock3, Save, Users } from 'lucide-react';
import { SystemUser } from '../lib/data';
import { loadAttendanceTimeSettings, saveAttendanceTimeSettings } from '../app/admin/actions';

export default function AdminAttendanceTime({ users }: { users: SystemUser[] }) {
  const [time, setTime] = useState('');
  const [toleranceMinutes, setToleranceMinutes] = useState('0');
  const [fineAmount, setFineAmount] = useState('');
  const [fineEnabled, setFineEnabled] = useState(false);
  const [showFineSettings, setShowFineSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const employeeCount = users.filter(user => user.active && user.role !== 'Administrador').length;

  useEffect(() => {
    let active = true;
    loadAttendanceTimeSettings().then(result => {
      if (!active) return;
      if (result.error) setError(result.error);
      if (result.settings) {
        setTime(result.settings.time);
        setToleranceMinutes(String(result.settings.toleranceMinutes));
        setFineAmount(result.settings.fineAmount ? String(result.settings.fineAmount) : '');
        setFineEnabled(result.settings.fineAmount > 0);
        setConfigured(Boolean(result.settings.time));
      }
      setLoading(false);
    }).catch(() => { if (active) { setError('No se pudo cargar la configuración general.'); setLoading(false); } });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice(''); setSaving(true);
    try {
      const result = await saveAttendanceTimeSettings({ time, toleranceMinutes: Number(toleranceMinutes), fineAmount: fineEnabled ? Number(fineAmount) : 0 });
      if (!result.ok) { setError(result.error || 'No se pudo guardar el horario general.'); return; }
      setConfigured(true);
      setNotice(fineEnabled ? 'Horario y multa automática guardados para todos los empleados activos.' : 'Horario general guardado. La multa automática quedó desactivada.');
    } catch {
      setError('No se pudo guardar el horario general.');
    } finally { setSaving(false); }
  }

  return <section className="attendance-time-section">
    <div className="info-note">Coloca una sola hora de entrada y una sola tolerancia. Se aplicarán a todo el personal activo de todas las sucursales, incluidos cajeros, cocineros y demás roles.</div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {notice && <p className="attendance-time-success" role="status"><Check size={15}/>{notice}</p>}
    <form className="panel attendance-general-form" onSubmit={save}>
      <div className="attendance-general-heading"><span className="attendance-general-icon"><Clock3 size={22}/></span><div><h2>Horario general de asistencia</h2><p>Un mismo horario para todos los empleados</p></div><span className={`badge ${configured ? 'success' : 'neutral'}`}>{configured ? 'Configurado' : 'Pendiente'}</span></div>
      <div className="attendance-general-fields">
        <label>Hora esperada de entrada<input type="time" required value={time} disabled={loading} onChange={event => setTime(event.target.value)}/></label>
        <label>Tolerancia para todos (minutos)<input type="number" required min="0" max="180" step="1" value={toleranceMinutes} disabled={loading} onChange={event => setToleranceMinutes(event.target.value)}/><small>Minutos permitidos después de la hora de entrada.</small></label>
      </div>
      <div className="attendance-fine-toolbar"><div><strong>Multa por tardanza</strong><small>Se aplica al registrar asistencia después de la hora y la tolerancia.</small></div><button type="button" className="button" aria-expanded={showFineSettings} disabled={loading} onClick={() => setShowFineSettings(value => !value)}><Banknote size={16}/>{showFineSettings ? 'Ocultar multa' : fineEnabled ? 'Multa · Activada' : 'Multa'}</button></div>
      {showFineSettings && <div className="attendance-fine-settings"><label className="attendance-fine-enable"><input type="checkbox" checked={fineEnabled} onChange={event => setFineEnabled(event.target.checked)}/> Activar multa automática para todos los empleados</label><label htmlFor="attendance-fine-amount">Monto de la multa (Bs.)</label><div><span>Bs.</span><input id="attendance-fine-amount" type="number" min="0.01" max="1000000" step="0.01" required={fineEnabled} disabled={loading || !fineEnabled} value={fineAmount} onChange={event => setFineAmount(event.target.value)} placeholder="0.00"/></div><small>La multa se registrará como pendiente por cada llegada tardía. Desactiva esta opción para registrar tardanzas sin cobrar multa.</small></div>}
      <div className="attendance-general-footer"><span><Users size={16}/>{employeeCount} empleados activos · Todas las sucursales</span><button className="button primary" type="submit" disabled={loading || saving || !time}><Save size={16}/>{loading ? 'Cargando…' : saving ? 'Guardando…' : 'Guardar para todos'}</button></div>
    </form>
  </section>;
}
