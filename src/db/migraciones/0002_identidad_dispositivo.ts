import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Una sola fila con el UUID del dispositivo (R6). Se genera la primera vez
 * que arranca la app y se reutiliza siempre — ver src/db/dispositivo.ts.
 */
export const migracion0002IdentidadDispositivo: Migracion = {
  version: 2,
  nombre: 'identidad_dispositivo',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE _dispositivo (
        id TEXT PRIMARY KEY NOT NULL,
        creado_ts TEXT NOT NULL
      );
    `);
  },
};
