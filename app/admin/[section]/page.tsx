import AdminApp from '../../../components/AdminApp';
import { notFound } from 'next/navigation';
import { navigation } from '../../../lib/navigation';
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section: route } = await params;
  if (!navigation.some(n => n.id === route)) notFound();
  return <AdminApp key={route} section={route} />;
}
