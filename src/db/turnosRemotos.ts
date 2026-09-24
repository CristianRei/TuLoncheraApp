import { fechaHoyBogota } from '@/core/analitica';
import type { Turno } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

interface FilaTurnoRemoto {
  id: string;
  promotor_id: string;
  promotor_nombre: string;
  selfie_path: string;
  latitud: number | null;
  longitud: number | null;
  hora_inicio: string;
  hora_fin: string | null;
}

const DURACION_URL_FIRMADA_SEGUNDOS = 60 * 60; // 1 hora — coherente con "sync periódica, no tiempo real"

/**
 * ¿Ese promotor tiene un turno abierto hoy, en CUALQUIER dispositivo? El turno
 * vive en el celular del promotor — el de bodega nunca lo tiene localmente,
 * así que para entregarle un cargue hay que preguntarle a Supabase. Lanza si
 * no hay conexión (el llamador decide qué hacer).
 */
export async function hayTurnoAbiertoHoyRemoto(promotorId: string): Promise<boolean> {
  const supabase = await getSupabaseClient();
  const desde = new Date(`${fechaHoyBogota()}T00:00:00-05:00`).toISOString();
  const { data, error } = await supabase
    .from('turnos')
    .select('id')
    .eq('promotor_id', promotorId)
    .is('hora_fin', null)
    .gte('hora_inicio', desde)
    .limit(1)
    .returns<{ id: string }[]>();
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * El turno abierto de hoy de ESE promotor, en cualquier dispositivo — con
 * datos completos (no solo el booleano de `hayTurnoAbiertoHoyRemoto`), para
 * poder reconstruir la fila local cuando el check-in ocurre en un
 * dispositivo distinto al que abrió el turno (ver `iniciarTurno`,
 * src/db/turnos.ts). `selfieUri` queda como la ruta cruda del bucket
 * (`selfie_path`), sin resolver a URL firmada — nadie en el celular del
 * propio promotor necesita ver de vuelta su selfie de inicio, solo subirla.
 * Best-effort: `null` también si falla la consulta (sin red) — nunca debe
 * bloquear el check-in real (R5).
 */
export async function obtenerTurnoAbiertoHoyRemoto(promotorId: string): Promise<Turno | null> {
  try {
    const supabase = await getSupabaseClient();
    const desde = new Date(`${fechaHoyBogota()}T00:00:00-05:00`).toISOString();
    const { data, error } = await supabase
      .from('turnos')
      .select('id, promotor_nombre, selfie_path, latitud, longitud, hora_inicio, hora_fin')
      .eq('promotor_id', promotorId)
      .is('hora_fin', null)
      .gte('hora_inicio', desde)
      .order('hora_inicio', { ascending: false })
      .limit(1)
      .returns<
        {
          id: string;
          promotor_nombre: string;
          selfie_path: string;
          latitud: number | null;
          longitud: number | null;
          hora_inicio: string;
          hora_fin: string | null;
        }[]
      >();
    if (error) throw error;
    const fila = data?.[0];
    if (!fila) return null;
    return {
      id: fila.id,
      promotorId,
      promotorNombre: fila.promotor_nombre,
      selfieUri: fila.selfie_path,
      latitud: fila.latitud,
      longitud: fila.longitud,
      horaInicio: fila.hora_inicio,
      horaFin: fila.hora_fin,
    };
  } catch {
    return null;
  }
}

/**
 * Turnos subidos desde CUALQUIER dispositivo (incluido este). Resuelve la
 * selfie a una URL firmada de corta duración — el bucket es privado, no hay
 * URL pública permanente que guardar. Para fusionar con `listarTurnos(db)`
 * local en las pantallas de admin (ver app/admin/turnos/index.tsx).
 */
export async function listarTurnosRemotos(): Promise<Turno[]> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('turnos')
    .select('id, promotor_id, promotor_nombre, selfie_path, latitud, longitud, hora_inicio, hora_fin')
    .order('hora_inicio', { ascending: false })
    .returns<FilaTurnoRemoto[]>();
  if (error) throw error;

  const turnos = await Promise.all(
    data.map(async (fila): Promise<Turno> => {
      const { data: firmada } = await supabase.storage
        .from('selfies-turnos')
        .createSignedUrl(fila.selfie_path, DURACION_URL_FIRMADA_SEGUNDOS);
      return {
        id: fila.id,
        promotorId: fila.promotor_id,
        promotorNombre: fila.promotor_nombre,
        selfieUri: firmada?.signedUrl ?? '',
        latitud: fila.latitud,
        longitud: fila.longitud,
        horaInicio: fila.hora_inicio,
        horaFin: fila.hora_fin,
      };
    })
  );
  return turnos;
}
