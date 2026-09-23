import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Estado de la sincronización de BAJADA de datos operativos (ventas,
 * movimientos, cargues): un cursor por tipo de dato — el `subido_ts` más
 * reciente ya descargado de Supabase — para no volver a traer todo el
 * historial en cada descarga. Clave/valor genérico (no una tabla por
 * cursor) porque el cursor de movimientos depende del ámbito
 * (`movimientos:BODEGA`, `movimientos:PROMOTOR:<id>`).
 */
export const migracion0026SyncEstado: Migracion = {
  version: 26,
  nombre: 'sync_estado',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE _sync_estado (
        clave TEXT PRIMARY KEY NOT NULL,
        valor TEXT NOT NULL
      );
    `);
  },
};
