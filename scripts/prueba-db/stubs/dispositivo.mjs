import { randomUUID } from 'node:crypto';

// Sin caché a propósito: en la prueba hay varios "dispositivos" (bases) en un
// mismo proceso, y cada uno necesita su propio id — como en la vida real.
export async function getDispositivoId(db) {
  const fila = await db.getFirstAsync('SELECT id FROM _dispositivo LIMIT 1');
  if (fila) return fila.id;
  const id = randomUUID();
  await db.runAsync('INSERT INTO _dispositivo (id, creado_ts) VALUES (?, ?)', [id, new Date().toISOString()]);
  return id;
}
