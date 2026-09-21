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
