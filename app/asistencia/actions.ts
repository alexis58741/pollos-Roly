'use server';

import { createClient } from '../../lib/supabase/server';
import { revalidatePath } from 'next/cache';

const EMBEDDING_SIZE = 1024;

function validDescriptor(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === EMBEDDING_SIZE && value.every((item) => typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= 10);
}

export type KioskAttendanceResult = {
  error?: string;
  success?: boolean;
  name?: string;
  role?: string;
  registeredAt?: string;
  alreadyMarked?: boolean;
};

/**
 * Shared attendance kiosk. Face templates stay inside the SECURITY DEFINER
 * database function; the browser only receives the matched employee and time.
 */
export async function markAttendance(form: FormData): Promise<KioskAttendanceResult> {
  let descriptor: unknown;
  try { descriptor = JSON.parse(String(form.get('descriptor') || '')); }
  catch { return { error: 'No se pudo leer el escaneo facial. Repite la verificación.' }; }
  if (!validDescriptor(descriptor)) return { error: 'El escaneo no tiene suficiente información. Repite la verificación.' };

  try {
    const db = await createClient();
    const { data, error } = await db.rpc('marcar_asistencia_kiosco', { p_descriptor: descriptor });
    if (error) {
      if (error.code === '42883' || error.code === 'PGRST202') return { error: 'Falta habilitar el modo de tablet. Ejecuta database/24_asistencia_kiosco.sql en Supabase.' };
      if (error.code === '42501') return { error: 'Supabase aún no permite registrar desde esta tablet. Ejecuta database/24_asistencia_kiosco.sql.' };
      return { error: 'No se pudo consultar la asistencia. Comprueba la conexión e inténtalo otra vez.' };
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) return { error: result?.message || 'No encontramos un rostro registrado. Pide al administrador que registre la plantilla facial.' };
    revalidatePath('/asistencia');
    revalidatePath('/admin/asistencia');
    revalidatePath('/cajero');
    return {
      success: true,
      name: result.employee_name,
      role: result.employee_role,
      registeredAt: result.registered_at,
      alreadyMarked: Boolean(result.already_marked),
    };
  } catch {
    return { error: 'No se pudo conectar con el sistema de asistencia. Inténtalo de nuevo.' };
  }
}

/** One-time template enrollment remains account-bound; daily check-in uses the shared kiosk. */
export async function enrollFaceAndMarkAttendance(form: FormData): Promise<KioskAttendanceResult> {
  if (form.get('consent') !== 'accepted') return { error: 'Confirma que autorizas guardar tu plantilla facial para usar la asistencia.' };
  let descriptor: unknown;
  try { descriptor = JSON.parse(String(form.get('descriptor') || '')); }
  catch { return { error: 'No se pudo leer el escaneo facial. Repite la verificación.' }; }
  if (!validDescriptor(descriptor)) return { error: 'El escaneo no tiene suficiente información. Repite la verificación.' };
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { error: 'Para registrar el rostro por primera vez, inicia sesión una vez con tu cuenta de empleado.' };
    const { data: profile, error: profileError } = await db.from('perfiles').select('rol,activo').eq('id', user.id).single();
    if (profileError || !profile?.activo || !['Cajero', 'Supervisor', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza'].includes(profile.rol)) return { error: 'La cuenta no puede registrar una plantilla de asistencia.' };
    const { error } = await db.from('plantillas_faciales').upsert({ empleado_id: user.id, descriptor }, { onConflict: 'empleado_id', ignoreDuplicates: true });
    if (error) return { error: 'No se pudo guardar la plantilla facial. Verifica la migración biométrica 07.' };
    return markAttendance(form);
  } catch {
    return { error: 'No se pudo guardar el rostro. Comprueba la conexión e inténtalo otra vez.' };
  }
}
