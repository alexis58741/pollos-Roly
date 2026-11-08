'use server';
import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function signIn(_previous: { error: string }, form: FormData) {
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  if (!email || !password || email.length > 254 || password.length > 1024) return { error: 'Introduce tu correo y contraseña.' };
  let destination = '';
  try {
    const db = await createClient();
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { error: error?.code === 'email_not_confirmed' ? 'Confirma tu correo en Supabase antes de entrar.' : error?.status === 429 ? 'Demasiados intentos. Espera un momento y vuelve a intentar.' : 'No se pudo iniciar sesión. Comprueba tu correo y contraseña.' };
    const { data: profile, error: profileError } = await db.from('perfiles').select('rol,activo').eq('id', data.user.id).single();
    if (profileError || !profile?.activo) {
      await db.auth.signOut({ scope: 'local' });
      return { error: 'Tu cuenta no tiene un perfil activo. Pide al administrador que revise tu usuario.' };
    }
    if (profile.rol === 'Administrador') {
      destination = '/admin/dashboard';
    } else if (profile.rol === 'Cajero') {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());
      const { data: attendance } = await db.from('asistencias').select('id').eq('empleado_id', data.user.id).eq('fecha', today).maybeSingle();
      destination = attendance ? '/cajero' : '/asistencia';
    } else if (['Supervisor', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza'].includes(profile.rol)) {
      destination = '/asistencia';
    } else {
      await db.auth.signOut({ scope: 'local' });
      return { error: 'El acceso de Cajero aún no está habilitado en este sistema.' };
    }
  } catch { return { error: 'No se pudo conectar con Supabase. Revisa tu conexión y vuelve a intentar.' }; }
  revalidatePath('/', 'layout');
  redirect(destination);
}
export async function signOut() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (user) {
    const { data: profile } = await db.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
    if (profile && ['Supervisor', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza'].includes(profile.rol)) {
      // Mark the current day's attendance before clearing the session.
      // Logout still completes if the optional attendance migration is pending.
      await db.rpc('registrar_salida_asistencia');
      revalidatePath('/admin/asistencia');
    }
  }
  await db.auth.signOut({ scope: 'local' });
  revalidatePath('/', 'layout');
  redirect('/login');
}
