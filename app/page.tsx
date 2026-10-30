import { redirect } from 'next/navigation';
import { createClient } from '../lib/supabase/server';
export default async function Home() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await db.from('perfiles').select('rol,activo').eq('id', user.id).maybeSingle();
  if (!profile?.activo) redirect('/login');
  if (profile.rol === 'Administrador') redirect('/admin/dashboard');
  if (profile.rol === 'Cajero') redirect('/cajero');
  redirect('/asistencia');
}
