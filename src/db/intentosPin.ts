import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { UMBRAL_BLOQUEO, calcularEstadoIntentos } from '@/core/seguridadPin';
import type { EstadoIntentosPin, ModoLogin, ResumenIntentosPin } from '@/core/tipos';

const CORTE_SIN_EVENTOS = '0000-00-00';

/**
 * Fallos consecutivos de una combinación dispositivo+modo: cuenta filas de
 * `intentos_pin_fallidos` posteriores al evento más reciente entre
 * `desbloqueos_pin` y `logins_exitosos_pin`. Es una cuenta derivada (R1),
 * nunca una columna mutable.
 */
export async function contarFallosConsecutivos(
  db: SQLiteDatabase,
  dispositivoId: string,
  modo: ModoLogin
): Promise<{ fallos: number; ultimoIntentoTs: string | null }> {
  const fila = await db.getFirstAsync<{ fallos: number; ultimo: string | null }>(
    `SELECT COUNT(*) as fallos, MAX(ts_cliente) as ultimo
     FROM intentos_pin_fallidos
     WHERE dispositivo_id = ? AND modo = ?
       AND ts_cliente > COALESCE(
         (SELECT MAX(ts_cliente) FROM (
           SELECT ts_cliente FROM desbloqueos_pin WHERE dispositivo_id = ? AND modo = ?
           UNION ALL
           SELECT ts_cliente FROM logins_exitosos_pin WHERE dispositivo_id = ? AND modo = ?
         )),
         ?
       )`,
    [dispositivoId, modo, dispositivoId, modo, dispositivoId, modo, CORTE_SIN_EVENTOS]
  );
  return { fallos: fila?.fallos ?? 0, ultimoIntentoTs: fila?.ultimo ?? null };
}

/** Registra un intento fallido. Nunca guarda el PIN tecleado. */
export async function registrarIntentoFallido(
  db: SQLiteDatabase,
  dispositivoId: string,
  modo: ModoLogin
): Promise<void> {
  await db.runAsync(
    'INSERT INTO intentos_pin_fallidos (id, dispositivo_id, modo, ts_cliente) VALUES (?, ?, ?, ?)',
    [Crypto.randomUUID(), dispositivoId, modo, new Date().toISOString()]
  );
}

/** Un login correcto resetea el contador de fallos consecutivos. */
export async function registrarLoginExitoso(
  db: SQLiteDatabase,
  dispositivoId: string,
  modo: ModoLogin
): Promise<void> {
  await db.runAsync(
    'INSERT INTO logins_exitosos_pin (id, dispositivo_id, modo, ts_cliente) VALUES (?, ?, ?, ?)',
    [Crypto.randomUUID(), dispositivoId, modo, new Date().toISOString()]
  );
}

/** Un admin desbloquea una combinación dispositivo+modo, reseteando el contador. */
export async function registrarDesbloqueo(
  db: SQLiteDatabase,
  dispositivoId: string,
  modo: ModoLogin,
  adminId: string
): Promise<void> {
  await db.runAsync(
    'INSERT INTO desbloqueos_pin (id, dispositivo_id, modo, admin_id, ts_cliente) VALUES (?, ?, ?, ?, ?)',
    [Crypto.randomUUID(), dispositivoId, modo, adminId, new Date().toISOString()]
  );
}

/** Combina el conteo persistido con el reloj actual para decidir qué mostrar en el login. */
export async function obtenerEstadoIntentos(
  db: SQLiteDatabase,
  dispositivoId: string,
  modo: ModoLogin
): Promise<EstadoIntentosPin> {
  const { fallos, ultimoIntentoTs } = await contarFallosConsecutivos(db, dispositivoId, modo);
  const msDesdeUltimoIntento = ultimoIntentoTs
    ? Date.now() - new Date(ultimoIntentoTs).getTime()
    : null;
  return calcularEstadoIntentos(fallos, msDesdeUltimoIntento);
}

/** Para el panel de admin: una fila por cada dispositivo+modo con historial de fallos. */
export async function listarResumenIntentosPin(
  db: SQLiteDatabase
): Promise<ResumenIntentosPin[]> {
  const combinaciones = await db.getAllAsync<{ dispositivo_id: string; modo: ModoLogin }>(
    'SELECT DISTINCT dispositivo_id, modo FROM intentos_pin_fallidos'
  );

  const resumen: ResumenIntentosPin[] = [];
  for (const { dispositivo_id: dispositivoId, modo } of combinaciones) {
    const { fallos, ultimoIntentoTs } = await contarFallosConsecutivos(db, dispositivoId, modo);
    if (fallos === 0) continue;
    resumen.push({
      dispositivoId,
      modo,
      fallosConsecutivos: fallos,
      bloqueado: fallos >= UMBRAL_BLOQUEO,
      ultimoIntentoTs,
    });
  }
  return resumen.sort((a, b) => (b.ultimoIntentoTs ?? '').localeCompare(a.ultimoIntentoTs ?? ''));
}
