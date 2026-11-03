import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import AttendanceCaptureClient from '../../components/AttendanceCaptureClient';

export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await db.from('perfiles').select('nombre,apellido,rol,activo').eq('id', user.id).single();
  if (!profile?.activo) redirect('/login');
  if (profile.rol === 'Administrador') redirect('/admin/dashboard');
  if (!['Cajero', 'Supervisor', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza'].includes(profile.rol)) redirect('/login');

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());
  const { data: attendance, error } = await db.from('asistencias').select('registrada_en').eq('empleado_id', user.id).eq('fecha', today).maybeSingle();
  if (profile.rol === 'Cajero' && attendance && !error) redirect('/cajero');
  const { data: faceTemplate, error: templateError } = await db.from('plantillas_faciales').select('empleado_id').eq('empleado_id', user.id).maybeSingle();
  const name = [profile.nombre, profile.apellido].filter(Boolean).join(' ') || user.email || 'Integrante';
  return <AttendanceCaptureClient name={name} role={profile.rol} registeredAt={attendance?.registrada_en ?? null} hasTemplate={Boolean(faceTemplate)} setupMissing={Boolean(error || templateError)} />;
}
