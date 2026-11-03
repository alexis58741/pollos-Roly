import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { localDate } from '../data';

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Falta configurar la conexión a Supabase en .env.local.');
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Los componentes de servidor solo leen; proxy.ts renueva las cookies. */ }
      },
    },
  });
}

export async function requireAdmin() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error('Tu sesión terminó. Vuelve a iniciar sesión.');
  const { data: profile, error: profileError } = await db.from('perfiles').select('id,nombre,apellido,correo_contacto,telefono,rol,activo,sucursal_id').eq('id', user.id).single();
  if (profileError) throw new Error('No se pudo consultar tu perfil. Comprueba que ejecutaste los scripts de la base de datos.');
  if (!profile?.activo || profile.rol !== 'Administrador') throw new Error('Tu cuenta no tiene un perfil de administrador activo. Ejecuta el script del primer administrador si corresponde.');
  return { db, user, profile };
}

export async function requireCashier() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error('Tu sesión terminó. Vuelve a iniciar sesión.');
  const { data: profile, error: profileError } = await db.from('perfiles').select('id,nombre,apellido,rol,activo,sucursal_id').eq('id', user.id).single();
  if (profileError || !profile?.activo || profile.rol !== 'Cajero' || !profile.sucursal_id) throw new Error('Esta cuenta no tiene un perfil de cajero activo con sucursal asignada.');
  const { data: attendance, error: attendanceError } = await db.from('asistencias').select('id').eq('empleado_id', user.id).eq('fecha', localDate()).maybeSingle();
  if (attendanceError) throw new Error('No se pudo validar tu asistencia. Comprueba que estén configuradas las migraciones de asistencia 06 y 07 en Supabase.');
  if (!attendance) throw new Error('Marca tu asistencia con reconocimiento facial antes de abrir la caja.');
  return { db, user, profile };
}
