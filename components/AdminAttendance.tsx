'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Search } from 'lucide-react';
import { loadAttendanceRecords, type AttendanceRecord } from '../app/admin/actions';
import { Branch, localDate } from '../lib/data';

export default function AdminAttendance({ branches }: { branches: Branch[] }) {
  const [date, setDate] = useState(localDate());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [query, setQuery] = useState('');
  const [branch, setBranch] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async (selectedDate: string) => {
    setLoading(true);
    setError('');
    const result = await loadAttendanceRecords(selectedDate);
    if (result.error) {
      setError(result.error);
      setRecords([]);
    } else setRecords(result.records || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    loadAttendanceRecords(date).then(result => {
      if (!active) return;
      if (result.error) { setError(result.error); setRecords([]); }
      else setRecords(result.records || []);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('No se pudieron cargar las asistencias.');
      setRecords([]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [date]);

  const filtered = useMemo(() => records.filter(record => {
    const matchesBranch = branch === 'all' || record.branch === branch;
    const haystack = `${record.name} ${record.role} ${branches.find(item => item.id === record.branch)?.name || ''}`.toLocaleLowerCase('es');
    return matchesBranch && haystack.includes(query.trim().toLocaleLowerCase('es'));
  }), [records, branch, query, branches]);

  const branchName = (id: string) => branches.find(item => item.id === id)?.name || 'Sin sucursal';
  const formatTime = (value: string) => new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

  return <section className="attendance-admin">
    <div className="attendance-admin-toolbar">
      <label className="attendance-admin-date"><CalendarDays size={17} /><span>Fecha</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="attendance-admin-branch"><span>Sucursal</span><select value={branch} onChange={event => setBranch(event.target.value)}><option value="all">Todas las sucursales</option>{branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="search-field attendance-admin-search"><Search size={17} /><input placeholder="Buscar por nombre o rol…" aria-label="Buscar asistencias" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <button className="button" type="button" onClick={() => void refresh(date)} disabled={loading}>Actualizar</button>
    </div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section className="panel attendance-admin-panel">
      <div className="panel-heading"><div><h2>Personal que marcó</h2><p>{new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'long' }).format(new Date(`${date}T12:00:00-04:00`))}</p></div><span className="attendance-admin-count"><Clock3 size={16} />{filtered.length} registros</span></div>
      <div className="table-scroll"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Sucursal</th><th>Hora de entrada</th><th>Hora de salida</th></tr></thead><tbody>{filtered.map(record => <tr key={record.id}><td className="record-name">{record.name}</td><td>{record.role}</td><td>{branchName(record.branch)}</td><td><span className="attendance-time"><Clock3 size={15} />{formatTime(record.timestamp)}</span></td><td>{record.exitTimestamp ? <span className="attendance-exit-time"><Clock3 size={15} />{formatTime(record.exitTimestamp)}</span> : <span className="attendance-exit-pending">Pendiente</span>}</td></tr>)}</tbody></table>
        {!loading && !error && filtered.length === 0 && <div className="empty-state">No hay asistencias registradas para esta fecha y sucursal.</div>}
        {loading && <div className="empty-state">Cargando asistencias…</div>}
      </div>
    </section>
  </section>;
}
