import { LayoutDashboard, ShoppingBag, Wallet, Bell, UtensilsCrossed, Cookie, CupSoda, Package, Truck, ShoppingBasket, BarChart3, UserCog, HandCoins, TrendingUp, Store, UserRound, Settings, Clock3, Timer } from 'lucide-react';
export const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/admin/dashboard', child: false },
  { id: 'ventas', label: 'Ventas', icon: ShoppingBag, href: '/admin/ventas', child: false },
  { id: 'caja', label: 'Caja', icon: Wallet, href: '/admin/caja', child: false },
  { id: 'comunicados', label: 'Avisos', icon: Bell, href: '/admin/comunicados', child: false },
  { id: 'menu', label: 'Menú', icon: UtensilsCrossed, href: '/admin/menu', child: false },
  { id: 'snacks', label: 'Snacks', icon: Cookie, href: '/admin/snacks', child: false },
  { id: 'bebidas', label: 'Bebidas', icon: CupSoda, href: '/admin/bebidas', child: false },
  { id: 'inventario', label: 'Insumos', icon: Package, href: '/admin/inventario/insumos', child: true },
  { id: 'proveedores', label: 'Proveedores', icon: Truck, href: '/admin/inventario/proveedores', child: true },
  { id: 'compras', label: 'Compras', icon: ShoppingBasket, href: '/admin/inventario/compras', child: true },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, href: '/admin/reportes', child: false },
  { id: 'empleados', label: 'Usuarios del Sistema', icon: UserCog, href: '/admin/empleados', child: true },
  { id: 'asistencia', label: 'Asistencia', icon: Clock3, href: '/admin/asistencia', child: true },
  { id: 'tiempo-asistencia', label: 'Tiempo asistencia', icon: Timer, href: '/admin/tiempo-asistencia', child: true },
  { id: 'pagos-personal', label: 'Pagos al Personal', icon: HandCoins, href: '/admin/pagos-personal', child: true },
  { id: 'finanzas-personales', label: 'Ingreso / Egreso', icon: TrendingUp, href: '/admin/finanzas-personales', child: false },
  { id: 'sucursales', label: 'Sucursales', icon: Store, href: '/admin/sucursales', child: false },
  { id: 'perfil', label: 'Mi Perfil', icon: UserRound, href: '/admin/perfil', child: false },
  { id: 'configuracion', label: 'Configuración', icon: Settings, href: '/admin/configuracion', child: false },
];
export const advancedSections = ['caja', 'comunicados', 'snacks', 'bebidas', 'proveedores', 'compras', 'reportes', 'empleados', 'asistencia', 'tiempo-asistencia', 'pagos-personal', 'finanzas-personales', 'perfil'];
