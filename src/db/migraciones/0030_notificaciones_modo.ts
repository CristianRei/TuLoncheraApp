import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Agrega `DESBLOQUEO_PIN` al CHECK de `notificaciones.tipo` y una columna
 * `modo` — necesarios para el nuevo tipo de notificación evento-puntual que
 * se genera al desbloquear un dispositivo (ver src/db/notificaciones.ts,
 * `registrarNotificacionDesbloqueo`): a diferencia de STOCK_BAJO/
 * LOTE_POR_VENCER/CARGUE_REVISAR, un desbloqueo no tiene producto_id ni
 * lote_id — necesita dejar constancia de qué dispositivo+modo se
 * desbloqueó (`dispositivo_id` ya existía desde 0013; falta `modo`).
 * SQLite no permite ALTER sobre un CHECK, así que se recrea la tabla —
 * mismo patrón que la migración 0018 (agregó CARGUE_REVISAR).
 */
export const migracion0030NotificacionesModo: Migracion = {
  version: 30,
  nombre: 'notificaciones_modo',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE notificaciones_nueva (
        id TEXT PRIMARY KEY NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('STOCK_BAJO', 'LOTE_POR_VENCER', 'CARGUE_REVISAR', 'DESBLOQUEO_PIN')),
        nivel TEXT NOT NULL CHECK (nivel IN ('INFO', 'ALERTA', 'CRITICO')),
        titulo TEXT NOT NULL,
        detalle TEXT NOT NULL,
        producto_id TEXT REFERENCES productos(id),
        lote_id TEXT REFERENCES lotes(id),
        modo TEXT,
        clave_deduplicacion TEXT NOT NULL,
        leida INTEGER NOT NULL DEFAULT 0,
        resuelta INTEGER NOT NULL DEFAULT 0,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      INSERT INTO notificaciones_nueva
        (id, tipo, nivel, titulo, detalle, producto_id, lote_id, clave_deduplicacion, leida, resuelta, ts_cliente, dispositivo_id)
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
