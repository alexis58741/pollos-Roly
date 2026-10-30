export type Product = { id: string; name: string; category: string; price: number; active: boolean; description?: string; salePrice?: number | null; onSale?: boolean; photoPath?: string; sortOrder?: number; requiresChoices?: boolean; pieceType?: 'leg_thigh' | 'breast_wing' | 'all' };
export type Category = { id: string; name: string; active: boolean };
export type Stock = { id: string; name: string; branch: string; quantity: number; minimum: number; unit: string };
export type Employee = { id: string; name: string; role: string; branch: string; phone: string; active: boolean };
export type Branch = { id: string; name: string; address: string; phone: string; active: boolean };
export type Order = { id: string; ticket?: string; shift?: string; payments?: { method: string; amount: number }[]; customer: string; branch: string; total: number; payment: string; status: string; date: string; items: string };
export type Supplier = { id: string; name: string; contact: string; phone: string; nit: string; active: boolean };
export type Purchase = { id: string; supplier: string; branch: string; stock: string; quantity: number; unitCost: number; date: string; notes: string; status: 'Registrada' | 'Anulada'; document?: string; receipt?: string };
export type SnackStock = { id: string; product: string; branch: string; quantity: number; minimum: number };
export type Notice = { id: string; title: string; body: string; branch: string; priority: string; active: boolean; date: string };
export type SystemUser = { id: string; name: string; email: string; branch: string; role: string; active: boolean };
export type StaffPayment = { id: string; employee: string; employeeName: string; branch: string; amount: number; concept: string; observations: string; paymentType: string; period: string; date: string; method: string; status: string };
export type Finance = { id: string; type: string; amount: number; category: string; description: string; date: string; method: string; branch: string };
export type Shift = { id: string; branch: string; cashier: string; opening: number; openedAt: string; closedAt: string | null; counted: number | null; expected?: number | null; notes: string };
export type CashMovement = { id: string; shift: string; type: string; amount: number; concept: string; date: string };
export type Profile = { name: string; surname: string; email: string; phone: string };
export type Data = { currentUserId?: string; categories?: string[]; categoryRecords?: Category[]; products: Product[]; stock: Stock[]; employees: Employee[]; branches: Branch[]; orders: Order[]; settings: { name: string; phone: string; address: string; message: string }; suppliers: Supplier[]; purchases: Purchase[]; snackStocks: SnackStock[]; notices: Notice[]; users: SystemUser[]; staffPayments: StaffPayment[]; finances: Finance[]; shifts: Shift[]; cashMovements: CashMovement[]; profile: Profile };
export const extraDefaults = () => ({ suppliers: [] as Supplier[], purchases: [] as Purchase[], snackStocks: [] as SnackStock[], notices: [] as Notice[], users: [] as SystemUser[], staffPayments: [] as StaffPayment[], finances: [] as Finance[], shifts: [] as Shift[], cashMovements: [] as CashMovement[], profile: { name: 'Administrador', surname: '', email: '', phone: '' } });
export function hydrateData(raw: string | null): Data {
  if (!raw) return initialData();
  const parsed = JSON.parse(raw);
  if (!parsed || !['products', 'stock', 'employees', 'branches', 'orders'].every(k => Array.isArray(parsed[k])) || !parsed.settings) throw new Error('Datos inválidos');
  const defaults = extraDefaults();
  for (const key of Object.keys(defaults)) if (key !== 'profile' && parsed[key] !== undefined && !Array.isArray(parsed[key])) throw new Error('Datos inválidos');
  return { ...defaults, ...parsed, profile: { ...defaults.profile, ...parsed.profile } };
}
export const STORAGE_KEY = 'pollos-roly-admin-v1';
export function localDate(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(date); }
export function initialData(): Data {
  const today = localDate();
  return {
    ...extraDefaults(),
    products: [
      { id: 'p1', name: 'Pollo entero', category: 'Pollos', price: 95, active: true },
      { id: 'p2', name: 'Medio pollo', category: 'Pollos', price: 50, active: true },
      { id: 'p3', name: 'Cuarto de pollo', category: 'Pollos', price: 28, active: true },
      { id: 'p4', name: 'Pollo personal', category: 'Pollos', price: 22, active: true },
      { id: 'p5', name: 'Papas familiares', category: 'Acompañamientos', price: 18, active: true },
      { id: 'p6', name: 'Coca-Cola 2 L', category: 'Bebidas', price: 15, active: true },
      { id: 'p7', name: 'Hamburguesa Roly', category: 'Snacks', price: 20, active: true },
      { id: 'p8', name: 'Alitas BBQ', category: 'Snacks', price: 32, active: false },
    ],
    branches: [{ id: 'b1', name: 'Sucursal Central', address: 'Dirección de ejemplo · por configurar', phone: '', active: true }],
    employees: [
      { id: 'e1', name: 'Administrador de ejemplo', role: 'Administrador', branch: 'b1', phone: '', active: true },
      { id: 'e2', name: 'Cajero de ejemplo', role: 'Cajero', branch: 'b1', phone: '', active: true },
      { id: 'e3', name: 'Cocinero de ejemplo', role: 'Cocinero', branch: 'b1', phone: '', active: true },
    ],
    stock: [
      { id: 'i1', name: 'Pollo fresco', branch: 'b1', quantity: 42, minimum: 15, unit: 'unidades' },
      { id: 'i2', name: 'Papa', branch: 'b1', quantity: 8, minimum: 10, unit: 'kg' },
      { id: 'i3', name: 'Arroz', branch: 'b1', quantity: 25, minimum: 10, unit: 'kg' },
      { id: 'i4', name: 'Aceite', branch: 'b1', quantity: 4, minimum: 5, unit: 'litros' },
      { id: 'i5', name: 'Coca-Cola 2 L', branch: 'b1', quantity: 36, minimum: 12, unit: 'unidades' },
      { id: 'i6', name: 'Envases para llevar', branch: 'b1', quantity: 180, minimum: 50, unit: 'unidades' },
    ],
    orders: Array.from({ length: 24 }, (_, i) => ({ id: `R-${String(1024 - i).padStart(4, '0')}`, customer: ['Cliente de mostrador', 'Pedido para llevar', 'Mesa 04', 'Mesa 02'][i % 4], branch: 'b1', total: [95, 56, 65, 110, 28, 50, 43, 95][i % 8], payment: ['Efectivo', 'QR', 'Efectivo', 'Tarjeta'][i % 4], status: i < 2 ? 'En preparación' : i === 2 ? 'Listo para entregar' : 'Entregado', date: `${today}T${String(18 - Math.floor(i / 3)).padStart(2, '0')}:${String(52 - (i % 3) * 17).padStart(2, '0')}:00-04:00`, items: ['1 × Pollo entero', '2 × Cuarto de pollo', '1 × Medio pollo · 1 × Coca-Cola 2 L', '1 × Pollo entero · 1 × Coca-Cola 2 L'][i % 4] })),
    settings: { name: 'Pollos Roly', phone: '', address: '', message: '¡Gracias por elegir Pollos Roly!' },
  };
}
