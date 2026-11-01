import type { Data } from '../data';
export type Mutation = { collection: string; create: boolean; record: Record<string, unknown> };
// Traducir una edición de pantalla a una sola operación de negocio.
// Compras tiene prioridad: el servidor actualiza sus existencias en la misma transacción.
export function planMutation(before: Data, after: Data): Mutation {
  const keys = ['purchases', 'shifts', 'cashMovements', 'orders', 'products', 'stock', 'employees', 'branches', 'suppliers', 'snackStocks', 'beverageStocks', 'notices', 'users', 'staffPayments', 'finances'] as const;
  for (const collection of keys) {
    const previous = before[collection];
    const changed = after[collection].filter(row => JSON.stringify(row) !== JSON.stringify(previous.find(p => p.id === row.id)));
    if (changed.length > 1 || after[collection].length < previous.length) throw new Error('Guarda un registro a la vez. No se permiten borrados.');
    if (changed[0]) return { collection, create: !previous.some(p => p.id === changed[0].id), record: { ...changed[0] } };
  }
  const previousCategories = before.categoryRecords || [];
  const nextCategories = after.categoryRecords || [];
  const changedCategories = nextCategories.filter(row => JSON.stringify(row) !== JSON.stringify(previousCategories.find(p => p.id === row.id)));
  if (nextCategories.length < previousCategories.length || changedCategories.length > 1) throw new Error('Guarda una categoría a la vez. Archívala para conservar el historial.');
  if (changedCategories[0]) return { collection: 'categories', create: !previousCategories.some(c => c.id === changedCategories[0].id), record: { ...changedCategories[0] } };
  for (const collection of ['profile', 'settings'] as const) if (JSON.stringify(before[collection]) !== JSON.stringify(after[collection])) return { collection, create: false, record: { ...after[collection] } };
  throw new Error('No hay cambios para guardar.');
}
