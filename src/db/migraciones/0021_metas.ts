import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Metas de venta mensuales por promotor o por punto (Fase 6, "recomendador
 * de recarga" queda para después — esto es solo la meta comercial, ver
 * CLAUDE.md sección 10). Una sola meta por (tipo, entidad, mes): admin la
 * crea o la actualiza, nunca hay dos filas para el mismo mes de la misma
 * entidad — ver `establecerMeta` en src/db/metas.ts (upsert).
 */
export const migracion0021Metas: Migracion = {
  version: 21,
  nombre: 'metas',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE metas (
        id TEXT PRIMARY KEY NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('PROMOTOR', 'PUNTO')),
        entidad_id TEXT NOT NULL,
        mes TEXT NOT NULL,
        monto_objetivo INTEGER NOT NULL,
        creado_por TEXT NOT NULL REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_metas_entidad_mes ON metas(tipo, entidad_id, mes);
    `);
  },
};
