import type { Product } from './data';

export const pieceOptions = [
  { value: 'leg_thigh', label: 'Pierna y Contra', icon: '🍗' },
  { value: 'breast_wing', label: 'Pecho y Ala', icon: '🍗' },
  { value: 'all', label: 'Todas', icon: '🍽️' },
] as const;
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
export function isChickenCategory(category: string) { return /^pollos?$/i.test(category.trim()); }
export function effectivePrice(product: Product) { return product.onSale && product.salePrice != null ? product.salePrice : product.price; }
export function productPhotoUrl(path?: string) {
  return path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/productos/${path}` : '';
}

// Validación compartida con el servidor; las presas nunca dependen del precio.
export function productDetails(r: Record<string, unknown>) {
  const price = r.price;
  const validMoney = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= .01 && value <= 100000 && Math.abs(value * 100 - Math.round(value * 100)) < .000001;
  if (!validMoney(price)) throw new Error('El precio regular debe ser mayor a cero y tener hasta dos decimales.');
  if (r.onSale !== undefined && typeof r.onSale !== 'boolean') throw new Error('Revisa la opción de oferta.');
  const onSale = r.onSale === true;
  if (onSale && (!validMoney(r.salePrice) || r.salePrice >= price)) throw new Error('El precio de oferta debe ser mayor a cero y menor al precio regular.');
  const description = r.description ?? '';
  if (typeof description !== 'string' || description.length > 2000) throw new Error('La descripción admite hasta 2000 caracteres.');
  const sortOrder = r.sortOrder ?? 1;
  if (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 9999) throw new Error('El orden debe ser un número entero entre 1 y 9999.');
  const pieceType = r.pieceType ?? 'all';
  if (!pieceOptions.some(p => p.value === pieceType)) throw new Error('Selecciona un tipo de presas válido.');
  if (r.requiresChoices !== undefined && typeof r.requiresChoices !== 'boolean') throw new Error('Revisa la selección de presas y acompañamientos.');
  const chicken = isChickenCategory(String(r.category));
  return { descripcion: description.trim(), precio: price, en_oferta: onSale, precio_oferta: onSale ? r.salePrice as number : null, orden: sortOrder, requiere_seleccion: chicken && r.requiresChoices === true, tipo_presas: chicken ? pieceType : 'all' };
}

export function photoExtension(bytes: Uint8Array, mime: string) {
  if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (mime === 'image/png' && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return 'png';
  if (mime === 'image/webp' && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'webp';
  throw new Error('Selecciona una fotografía JPG, PNG o WebP válida.');
}
