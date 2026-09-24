import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { mensajeDeError } from '@/core/errores';
import type { MensajeRecibido, TipoMensaje } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

export interface EnvioMensaje {
  cuerpo: string;
  tipo: TipoMensaje;
  /** Mismo cuerpo para todos estos destinatarios — para un mensaje personalizado por persona, un envío por persona. */
  destinatarios: { id: string; nombre: string }[];
}

/**
 * Crea uno o varios mensajes en Supabase (fan-out a `mensaje_destinatarios`,
 * uno por persona). La notificación push NO la envía este dispositivo: la
 * envía Supabase con un trigger apenas se guardan los destinatarios
 * (supabase/migraciones/0013_push_desde_servidor.sql) — desde el navegador
 * la llamada directa a Expo la bloqueaba CORS, y ningún mensaje enviado desde
 * el computador llegaba. Requiere conexión (el admin está enviando algo a
 * otro dispositivo, no tiene sentido encolar esto para "después" como el
 * resto de la sincronización, R5 no aplica a una acción explícitamente
 * en línea). Si falla, el admin ve el error y puede reintentar — no hay cola.
 */
export async function enviarMensajes(
  envios: EnvioMensaje[],
  remitente: { id: string; nombre: string }
): Promise<void> {
  const supabase = await getSupabaseClient();
  const ahora = new Date().toISOString();

  for (const envio of envios) {
    const id = Crypto.randomUUID();
    const { error: errorMensaje } = await supabase.from('mensajes').insert({
      id,
      cuerpo: envio.cuerpo,
      tipo: envio.tipo,
      creado_por: remitente.id,
      creado_por_nombre: remitente.nombre,
      ts_cliente: ahora,
    });
    if (errorMensaje) throw errorMensaje;

    const { error: errorDestinatarios } = await supabase.from('mensaje_destinatarios').insert(
      envio.destinatarios.map((d) => ({ mensaje_id: id, destinatario_id: d.id }))
    );
    if (errorDestinatarios) throw errorDestinatarios;
  }
}

interface FilaMensajeRemoto {
  id: string;
  cuerpo: string;
  tipo: TipoMensaje;
  creado_por_nombre: string;
  ts_cliente: string;
}

/**
 * Trae de Supabase los mensajes dirigidos a `usuarioId` que todavía no están
 * en el espejo local (`mensajes_recibidos`, migración 0023) y los guarda ahí
 * — para que la pantalla de Notificaciones funcione sin conexión después.
 * Se llama al hacer login y al enfocar la pantalla de Notificaciones; nunca
 * bloquea nada más si falla (sin red, por ejemplo).
 */
export async function descargarMensajesNuevos(db: SQLiteDatabase, usuarioId: string): Promise<void> {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('mensaje_destinatarios')
      .select('mensaje_id, mensajes(id, cuerpo, tipo, creado_por_nombre, ts_cliente)')
      .eq('destinatario_id', usuarioId)
      .returns<{ mensaje_id: string; mensajes: FilaMensajeRemoto | FilaMensajeRemoto[] }[]>();
    if (error) throw error;

    for (const fila of data) {
      const mensaje = Array.isArray(fila.mensajes) ? fila.mensajes[0] : fila.mensajes;
      if (!mensaje) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO mensajes_recibidos (id, destinatario_id, cuerpo, tipo, remitente_nombre, ts_cliente, leida)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [mensaje.id, usuarioId, mensaje.cuerpo, mensaje.tipo, mensaje.creado_por_nombre, mensaje.ts_cliente]
      );
    }
  } catch (error) {
    console.log('[mensajes] no se pudo descargar mensajes nuevos:', mensajeDeError(error));
  }
}

interface FilaMensajeLocal {
  id: string;
  cuerpo: string;
  tipo: TipoMensaje;
  remitente_nombre: string;
  ts_cliente: string;
  leida: number;
}

/** Mensajes ya descargados para `usuarioId`, más reciente primero — de solo el espejo local (funciona sin conexión). */
export async function listarMensajesRecibidos(db: SQLiteDatabase, usuarioId: string): Promise<MensajeRecibido[]> {
  const filas = await db.getAllAsync<FilaMensajeLocal>(
    `SELECT id, cuerpo, tipo, remitente_nombre, ts_cliente, leida
     FROM mensajes_recibidos WHERE destinatario_id = ? ORDER BY ts_cliente DESC`,
    [usuarioId]
  );
  return filas.map((f) => ({
    id: f.id,
    cuerpo: f.cuerpo,
    tipo: f.tipo,
    remitenteNombre: f.remitente_nombre,
    tsCliente: f.ts_cliente,
    leida: f.leida === 1,
  }));
}

export async function contarMensajesNoLeidos(db: SQLiteDatabase, usuarioId: string): Promise<number> {
  const fila = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) as total FROM mensajes_recibidos WHERE destinatario_id = ? AND leida = 0',
    [usuarioId]
  );
  return fila?.total ?? 0;
}

/** Marca leído local (funciona sin conexión) y remoto best-effort (para que el admin pueda ver "leído" algún día). */
export async function marcarMensajeLeido(db: SQLiteDatabase, mensajeId: string, usuarioId: string): Promise<void> {
  await db.runAsync('UPDATE mensajes_recibidos SET leida = 1 WHERE id = ? AND destinatario_id = ?', [
    mensajeId,
    usuarioId,
  ]);
  try {
    const supabase = await getSupabaseClient();
    await supabase
      .from('mensaje_destinatarios')
      .update({ leida: true })
      .eq('mensaje_id', mensajeId)
      .eq('destinatario_id', usuarioId);
  } catch (error) {
    console.log('[mensajes] no se pudo marcar leído en remoto:', mensajeDeError(error));
  }
}
