import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

export default async function CashierLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await db.from('perfiles').select('rol,activo,sucursal_id').eq('id', user.id).maybeSingle();
  if (profile?.rol === 'Administrador' && profile.activo) redirect('/admin/dashboard');
  if (profile?.rol !== 'Cajero' || !profile.activo) redirect('/asistencia');
  return children;
}
