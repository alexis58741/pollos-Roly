import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Pollos Roly · Administración', description: 'Panel de administración de Pollos Roly' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
