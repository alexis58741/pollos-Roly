import AttendanceCaptureClient from '../../components/AttendanceCaptureClient';
import { createClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Shared, walk-up attendance screen for the fixed staff tablet. */
export default async function AttendancePage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (user) {
    const { data: profile } = await db.from('perfiles').select('nombre,apellido,rol,activo').eq('id', user.id).maybeSingle();
    if (profile?.activo && ['Cajero', 'Supervisor', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza'].includes(profile.rol)) {
      const { data: template } = await db.from('plantillas_faciales').select('empleado_id').eq('empleado_id', user.id).maybeSingle();
      if (!template) {
        const name = [profile.nombre, profile.apellido].filter(Boolean).join(' ').trim() || 'Integrante';
        return <AttendanceCaptureClient enrollmentName={name} enrollmentRole={profile.rol} />;
      }
    }
  }
  return <AttendanceCaptureClient />;
}
