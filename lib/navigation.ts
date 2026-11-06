import { LayoutDashboard, ShoppingBag, Wallet, Bell, UtensilsCrossed, Cookie, CupSoda, Package, Truck, ShoppingBasket, BarChart3, UserCog, HandCoins, TrendingUp, Store, UserRound, Settings, Clock3, Timer } from 'lucide-react';
export const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/admin/dashboard', group: 'principal' },
  { id: 'ventas', label: 'Ventas', icon: ShoppingBag, href: '/admin/ventas', group: 'principal' },
  { id: 'caja', label: 'Caja', icon: Wallet, href: '/admin/caja', group: 'principal' },
  { id: 'comunicados', label: 'Avisos', icon: Bell, href: '/admin/comunicados', group: 'principal' },
  { id: 'menu', label: 'Menú', icon: UtensilsCrossed, href: '/admin/menu', group: 'catalogo' },
  { id: 'snacks', label: 'Snacks', icon: Cookie, href: '/admin/snacks', group: 'catalogo' },
  { id: 'bebidas', label: 'Bebidas', icon: CupSoda, href: '/admin/bebidas', group: 'catalogo' },
  { id: 'inventario', label: 'Insumos', icon: Package, href: '/admin/inventario/insumos', group: 'inventario' },
  { id: 'proveedores', label: 'Proveedores', icon: Truck, href: '/admin/inventario/proveedores', group: 'inventario' },
  { id: 'compras', label: 'Compras', icon: ShoppingBasket, href: '/admin/inventario/compras', group: 'inventario' },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, href: '/admin/reportes', group: 'analisis' },
  { id: 'empleados', label: 'Usuarios del Sistema', icon: UserCog, href: '/admin/empleados', group: 'personal' },
  { id: 'asistencia', label: 'Asistencia', icon: Clock3, href: '/admin/asistencia', group: 'personal' },
  { id: 'tiempo-asistencia', label: 'Tiempo asistencia', icon: Timer, href: '/admin/tiempo-asistencia', group: 'personal' },
  { id: 'pagos-personal', label: 'Pagos al Personal', icon: HandCoins, href: '/admin/pagos-personal', group: 'personal' },
  { id: 'finanzas-personales', label: 'Ingreso / Egreso', icon: TrendingUp, href: '/admin/finanzas-personales', group: 'negocio' },
  { id: 'sucursales', label: 'Sucursales', icon: Store, href: '/admin/sucursales', group: 'negocio' },
  { id: 'control-sucursales', label: 'Control de sucursales', icon: Store, href: '/admin/control-sucursales', group: 'negocio' },
  { id: 'perfil', label: 'Mi Perfil', icon: UserRound, href: '/admin/perfil', group: 'sistema' },
  { id: 'configuracion', label: 'Configuración', icon: Settings, href: '/admin/configuracion', group: 'sistema' },
];
export const navigationGroups = [
  { id: 'principal', label: 'Principal' },
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'analisis', label: 'Análisis' },
  { id: 'personal', label: 'Personal' },
  { id: 'negocio', label: 'Negocio' },
  { id: 'sistema', label: 'Administración' },
].map(group => ({ ...group, items: navigation.filter(item => item.group === group.id) }));
export const advancedSections = ['caja', 'comunicados', 'snacks', 'bebidas', 'proveedores', 'compras', 'reportes', 'empleados', 'asistencia', 'tiempo-asistencia', 'pagos-personal', 'finanzas-personales', 'perfil', 'control-sucursales'];
