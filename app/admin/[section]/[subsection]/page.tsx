import AdminApp from '../../../../components/AdminApp';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ section: string; subsection: string }> }) {
  const { section, subsection } = await params;
  if (section !== 'inventario' || !['insumos', 'proveedores', 'compras'].includes(subsection)) notFound();
  const view = subsection === 'insumos' ? 'inventario' : subsection;
  return <AdminApp key={view} section={view} />;
}
