import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Agrega CARGUE_REVISAR al CHECK de `notificaciones.tipo` — una línea de
 * cargue en REVISAR (descuadre físico de bodega, ver ADR 0007) no generaba
 * ninguna alerta, admin solo la veía si entraba manualmente al detalle del
 * cargue. Mismo patrón que la migración 0008 recreando `movimientos`:
 * SQLite no permite ALTER sobre un CHECK.
 */
export const migracion0018NotificacionCargueRevisar: Migracion = {
  version: 18,
  nombre: 'notificacion_cargue_revisar',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE notificaciones_nueva (
        id TEXT PRIMARY KEY NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('STOCK_BAJO', 'LOTE_POR_VENCER', 'CARGUE_REVISAR')),
        nivel TEXT NOT NULL CHECK (nivel IN ('INFO', 'ALERTA', 'CRITICO')),
        titulo TEXT NOT NULL,
        detalle TEXT NOT NULL,
        producto_id TEXT REFERENCES productos(id),
        lote_id TEXT REFERENCES lotes(id),
        clave_deduplicacion TEXT NOT NULL,
        leida INTEGER NOT NULL DEFAULT 0,
        resuelta INTEGER NOT NULL DEFAULT 0,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      INSERT INTO notificaciones_nueva
      SELECT id, tipo, nivel, titulo, detalle, producto_id, lote_id, clave_deduplicacion, leida, resuelta, ts_cliente, dispositivo_id
      FROM notificaciones;

      DROP TABLE notificaciones;
      ALTER TABLE notificaciones_nueva RENAME TO notificaciones;

      CREATE UNIQUE INDEX idx_notificaciones_dedup
        ON notificaciones(clave_deduplicacion) WHERE resuelta = 0;
      CREATE INDEX idx_notificaciones_leida ON notificaciones(leida);
    `);
  },
};
