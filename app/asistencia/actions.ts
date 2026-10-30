'use server';

import { createClient } from '../../lib/supabase/server';
import { revalidatePath } from 'next/cache';

const ATTENDANCE_ROLES = ['Supervisor', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza'];
const EMBEDDING_SIZE = 1024;
const MATCH_THRESHOLD = 0.5;

function validDescriptor(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === EMBEDDING_SIZE && value.every((item) => typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= 10);
}

function faceSimilarity(left: number[], right: number[]) {
  if (left.length !== EMBEDDING_SIZE || right.length !== EMBEDDING_SIZE) return 0;
  let squaredDistance = 0;
  for (let i = 0; i < EMBEDDING_SIZE; i++) squaredDistance += (left[i] - right[i]) ** 2;
  const distance = Math.round(100 * 25 * squaredDistance) / 100;
  const normalized = (1 - Math.sqrt(distance) / 100 - 0.2) / (0.8 - 0.2);
  return Math.round(100 * Math.max(0, Math.min(1, normalized))) / 100;
}

export async function markAttendance(form: FormData): Promise<{ error?: string; success?: boolean; enrolled?: boolean }> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: 'Tu sesión terminó. Inicia sesión de nuevo.' };

  const { data: profile, error: profileError } = await db.from('perfiles').select('rol,activo').eq('id', user.id).single();
  if (profileError || !profile?.activo || !ATTENDANCE_ROLES.includes(profile.rol)) return { error: 'Tu cuenta no tiene permiso para marcar asistencia.' };

  let descriptor: unknown;
  try { descriptor = JSON.parse(String(form.get('descriptor') || '')); } catch { return { error: 'No se pudo leer el escaneo facial. Repite la verificación.' }; }
  if (!validDescriptor(descriptor)) return { error: 'El escaneo no tiene suficiente información. Repite la verificación.' };

  const { data: template, error: templateReadError } = await db.from('plantillas_faciales').select('descriptor').eq('empleado_id', user.id).maybeSingle();
  if (templateReadError) return { error: 'Falta configurar las plantillas faciales. Ejecuta database/07_asistencia_biometrica.sql en Supabase.' };

  let enrolled = false;
  if (!template) {
    if (form.get('consent') !== 'accepted') return { error: 'Confirma que autorizas guardar tu plantilla facial para verificar la asistencia.' };
    const { error } = await db.from('plantillas_faciales').insert({ empleado_id: user.id, descriptor });
    if (error) return { error: error.code === '23505' ? 'La plantilla se acaba de registrar en otra sesión. Repite para verificar tu rostro.' : 'No se pudo guardar tu plantilla facial. Comprueba que ejecutaste database/07_asistencia_biometrica.sql.' };
    enrolled = true;
  } else {
    if (!validDescriptor(template.descriptor)) return { error: 'La plantilla facial guardada no es válida. Contacta al administrador para restablecerla.' };
    if (faceSimilarity(descriptor, template.descriptor) < MATCH_THRESHOLD) return { error: 'El rostro no coincide con la plantilla registrada. Intenta de nuevo con buena iluminación y mirando al frente.' };
  }

  const { error: insertError } = await db.from('asistencias').insert({ empleado_id: user.id });
  if (insertError) return { error: insertError.code === '23505' ? 'La asistencia de hoy ya está registrada.' : 'No se pudo registrar la asistencia. Verifica que ejecutaste database/07_asistencia_biometrica.sql.' };

  revalidatePath('/asistencia');
  return { success: true, enrolled };
}
