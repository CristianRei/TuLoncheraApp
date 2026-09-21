import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type TablaSync = 'turnos' | 'comprobantes_venta';
export type TipoTareaSync = 'FILA' | 'FOTO';

/**
 * Encola una tarea de subida a Supabase. Se llama SIEMPRE dentro de la misma
 * transacción SQLite que ya crea la entidad local (`iniciarTurno`, registrar
 * venta con comprobante) — la cola nunca debe quedar inconsistente con el
 * dato que describe. El motor de sync (`src/sync/motor.ts`) es quien
 * consume estas filas en background; esta función nunca toca la red.
 */
export async function encolarSync(
  db: SQLiteDatabase,
  datos: { tabla: TablaSync; entidadId: string; tipoTarea: TipoTareaSync }
): Promise<void> {
  await db.runAsync(
    `INSERT INTO _sync_pendiente (id, tabla, entidad_id, tipo_tarea, creado_ts) VALUES (?, ?, ?, ?, ?)`,
    [Crypto.randomUUID(), datos.tabla, datos.entidadId, datos.tipoTarea, new Date().toISOString()]
  );
}
