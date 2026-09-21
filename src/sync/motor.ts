import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { obtenerTurno } from '@/db/turnos';
import { obtenerVenta } from '@/db/ventas';

import { getSupabaseClient } from './supabaseClient';

interface TareaPendiente {
  id: string;
  tabla: 'turnos' | 'comprobantes_venta';
  entidad_id: string;
  tipo_tarea: 'FILA' | 'FOTO';
  intentos: number;
}

let corriendo = false;

/**
 * Drena `_sync_pendiente` hacia Supabase: por cada tarea, sube la fila de
 * datos (`upsert`, idempotente por id — R3) o la foto correspondiente. Best
 * effort — una tarea que falla queda pendiente para el siguiente ciclo, sin
 * afectar a las demás. Nunca se llama desde el flujo de negocio (R5): solo
 * desde `app/_layout.tsx`, disparado por conectividad/timer/foco de app.
 */
export async function drenarColaSync(): Promise<void> {
  if (corriendo) {
    console.log('[sync] ya hay un ciclo corriendo, se omite este disparo');
    return;
  }
  corriendo = true;
  try {
    const db = await getDb();
    const pendientes = await db.getAllAsync<TareaPendiente>(
      `SELECT id, tabla, entidad_id, tipo_tarea, intentos
       FROM _sync_pendiente
       WHERE completado_ts IS NULL
       ORDER BY creado_ts ASC`
    );
    console.log(`[sync] ${pendientes.length} tarea(s) pendiente(s)`);
    if (pendientes.length === 0) return;

    let supabase;
    try {
      supabase = await getSupabaseClient();
    } catch (error) {
      console.log('[sync] no se pudo obtener sesión de Supabase, se reintenta después:', error);
      return;
    }

    for (const tarea of pendientes) {
      try {
        console.log(`[sync] subiendo ${tarea.tabla}/${tarea.tipo_tarea} (${tarea.entidad_id}), intento ${tarea.intentos + 1}`);
        if (tarea.tipo_tarea === 'FILA') {
          await subirFila(db, supabase, tarea);
        } else {
          await subirFoto(db, supabase, tarea);
        }
        await db.runAsync('UPDATE _sync_pendiente SET completado_ts = ? WHERE id = ?', [
          new Date().toISOString(),
          tarea.id,
        ]);
        console.log(`[sync] ✓ ${tarea.tabla}/${tarea.tipo_tarea} (${tarea.entidad_id})`);
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        console.log(`[sync] ✗ ${tarea.tabla}/${tarea.tipo_tarea} (${tarea.entidad_id}):`, mensaje);
        await db.runAsync(
          'UPDATE _sync_pendiente SET intentos = intentos + 1, ultimo_error = ? WHERE id = ?',
          [mensaje, tarea.id]
        );
      }
    }
  } finally {
    corriendo = false;
  }
}

async function subirFila(
  db: SQLiteDatabase,
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  tarea: TareaPendiente
): Promise<void> {
  if (tarea.tabla === 'turnos') {
    const turno = await obtenerTurno(db, tarea.entidad_id);
    if (!turno) return; // la fila local ya no existe — nada que subir
    const { error } = await supabase.from('turnos').upsert({
      id: turno.id,
      promotor_id: turno.promotorId,
      promotor_nombre: turno.promotorNombre,
      selfie_path: `${turno.id}.jpg`,
      latitud: turno.latitud,
      longitud: turno.longitud,
      hora_inicio: turno.horaInicio,
      hora_fin: turno.horaFin,
      ts_cliente: turno.horaInicio,
      dispositivo_id: await getDispositivoId(db),
    });
    if (error) throw error;
    return;
  }

  const resultado = await obtenerVenta(db, tarea.entidad_id);
  if (!resultado || !resultado.venta.comprobanteUri) return;
  const { venta } = resultado;
  const { error } = await supabase.from('comprobantes_venta').upsert({
    venta_id: venta.id,
    promotor_id: venta.promotorId,
    promotor_nombre: venta.promotorNombre,
    numero_recibo: venta.numeroRecibo,
    total: venta.total,
    comprobante_path: `${venta.id}.jpg`,
    ts_cliente: venta.tsCliente,
    dispositivo_id: await getDispositivoId(db),
  });
  if (error) throw error;
}

async function subirFoto(
  db: SQLiteDatabase,
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  tarea: TareaPendiente
): Promise<void> {
  const bucket = tarea.tabla === 'turnos' ? 'selfies-turnos' : 'comprobantes-venta';
  const path = `${tarea.entidad_id}.jpg`;

  const uriLocal =
    tarea.tabla === 'turnos'
      ? (await obtenerTurno(db, tarea.entidad_id))?.selfieUri
      : (await obtenerVenta(db, tarea.entidad_id))?.venta.comprobanteUri;
  if (!uriLocal) return; // la entidad ya no existe localmente — nada que subir

  const archivo = new File(uriLocal);
  const bytes = await archivo.arrayBuffer();

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
}
