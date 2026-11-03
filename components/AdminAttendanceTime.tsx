'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Save, Search } from 'lucide-react';
import { Branch, SystemUser } from '../lib/data';
import { AttendanceSchedule, loadAttendanceSchedules, saveAttendanceSchedule } from '../app/admin/actions';

type Draft = { time: string; toleranceMinutes: string };

export default function AdminAttendanceTime({ users, branches, query }: { users: SystemUser[]; branches: Branch[]; query: string }) {
  const [schedules, setSchedules] = useState<Record<string, AttendanceSchedule>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [branch, setBranch] = useState('all');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    loadAttendanceSchedules().then(result => {
      if (!active) return;
      if (result.error) { setError(result.error); setLoading(false); return; }
      const next: Record<string, AttendanceSchedule> = {};
      for (const schedule of result.schedules || []) next[schedule.employeeId] = schedule;
      setSchedules(next);
      setDrafts(Object.fromEntries(Object.entries(next).map(([id, schedule]) => [id, { time: schedule.time, toleranceMinutes: String(schedule.toleranceMinutes) }])));
      setLoading(false);
    }).catch(() => { if (active) { setError('No se pudieron cargar los horarios.'); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const employees = useMemo(() => users
    .filter(user => user.active && user.role !== 'Administrador')
    .filter(user => branch === 'all' || user.branch === branch)
    .filter(user => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query.toLowerCase())), [users, branch, query]);

  function draftFor(user: SystemUser): Draft {
    return drafts[user.id] || { time: '', toleranceMinutes: '0' };
  }

  async function save(user: SystemUser) {
    const draft = draftFor(user);
    setError(''); setNotice('');
    const result = await saveAttendanceSchedule({ employeeId: user.id, time: draft.time, toleranceMinutes: Number(draft.toleranceMinutes) });
    if (!result.ok) { setError(result.error || 'No se pudo guardar el horario.'); return; }
    const schedule: AttendanceSchedule = { employeeId: user.id, time: draft.time, toleranceMinutes: Number(draft.toleranceMinutes), updatedAt: new Date().toISOString() };
    setSchedules(current => ({ ...current, [user.id]: schedule }));
    setNotice(`Horario de ${user.name} guardado.`);
  }

  return <section className="attendance-time-section">
    <div className="info-note">Configura la hora de entrada esperada y el tiempo de tolerancia para cada empleado activo. Por ahora estos horarios quedan guardados como referencia administrativa.</div>
    <div className="attendance-time-toolbar">
      <div className="attendance-time-filter"><Search size={16}/><span>{query ? `Filtro: ${query}` : 'Empleados con acceso activo'}</span></div>
      <label className="attendance-time-branch">Sucursal<select value={branch} onChange={event => setBranch(event.target.value)}><option value="all">Todas las sucursales</option>{branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <span className="muted">{employees.length} empleados</span>
    </div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {notice && <p className="attendance-time-success" role="status"><Check size={15}/>{notice}</p>}
    <div className="panel attendance-time-panel"><div className="table-scroll"><table><thead><tr><th>Empleado</th><th>Rol</th><th>Sucursal</th><th>Hora esperada</th><th>Tolerancia (min)</th><th>Horario</th><th>Acción</th></tr></thead><tbody>
      {employees.map(user => {
        const draft = draftFor(user);
        const configured = Boolean(schedules[user.id]);
        return <tr key={user.id}><td className="record-name">{user.name || user.email}</td><td>{user.role}</td><td>{branches.find(item => item.id === user.branch)?.name || 'Sin sucursal'}</td><td><label className="sr-only" htmlFor={`attendance-time-${user.id}`}>Hora esperada para {user.name}</label><input id={`attendance-time-${user.id}`} className="attendance-time-input" type="time" value={draft.time} onChange={event => setDrafts(current => ({ ...current, [user.id]: { ...draft, time: event.target.value } }))}/></td><td><label className="sr-only" htmlFor={`attendance-grace-${user.id}`}>Minutos de tolerancia para {user.name}</label><input id={`attendance-grace-${user.id}`} className="attendance-time-input grace" type="number" min="0" max="180" step="1" value={draft.toleranceMinutes} onChange={event => setDrafts(current => ({ ...current, [user.id]: { ...draft, toleranceMinutes: event.target.value } }))}/></td><td><span className={`badge ${configured ? 'success' : 'neutral'}`}>{configured ? 'Configurado' : 'Sin horario'}</span></td><td><button className="button primary attendance-save-button" disabled={savingId === user.id || !draft.time} onClick={async () => { setSavingId(user.id); try { await save(user); } finally { setSavingId(''); } }}><Save size={15}/>{savingId === user.id ? 'Guardando…' : 'Guardar'}</button></td></tr>;
      })}
    </tbody></table>{!loading && employees.length === 0 && <div className="empty-state">No hay empleados activos que coincidan con los filtros.</div>}{loading && <div className="empty-state"><Clock3 size={17}/> Cargando horarios…</div>}</div></div>
  </section>;
}
