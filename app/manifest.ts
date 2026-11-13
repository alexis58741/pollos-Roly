import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Pollos Roly · Administración',
    short_name: 'Pollos Roly',
    description: 'Sistema de administración y punto de venta de Pollos Roly.',
    start_url: '/admin/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#f8f9fb',
    theme_color: '#e30613',
    icons: [
      { src: '/icons/pollos-roly-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/pollos-roly-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
