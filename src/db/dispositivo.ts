import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

let dispositivoIdCache: string | null = null;

/**
 * UUID estable del dispositivo (R6), generado una sola vez y persistido en
 * `_dispositivo`. Necesario para el `dispositivo_id` que lleva cada fila.
 */
export async function getDispositivoId(db: SQLiteDatabase): Promise<string> {
  if (dispositivoIdCache) return dispositivoIdCache;

  const fila = await db.getFirstAsync<{ id: string }>('SELECT id FROM _dispositivo LIMIT 1');
  if (fila) {
    dispositivoIdCache = fila.id;
    return fila.id;
  }

  const id = Crypto.randomUUID();
  await db.runAsync('INSERT INTO _dispositivo (id, creado_ts) VALUES (?, ?)', [
    id,
    new Date().toISOString(),
  ]);
  dispositivoIdCache = id;
  return id;
}
