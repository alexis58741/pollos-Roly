import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { signOut } from '../auth/actions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile, error } = await db.from('perfiles').select('rol,activo').eq('id', user.id).single();
  if (error || !profile?.activo || profile.rol !== 'Administrador') return <div className="login-page"><section className="login-card"><h1>Acceso pendiente</h1><p>Tu sesión es válida, pero necesitas un perfil de administrador activo para entrar.</p><p>Comprueba que ejecutaste el archivo del primer administrador en tu proyecto de Supabase con el correo de esta cuenta.</p><form action={signOut}><button className="button primary">Cerrar sesión</button></form><Link href="/login">Volver al inicio de sesión</Link></section></div>;
  return children;
}
