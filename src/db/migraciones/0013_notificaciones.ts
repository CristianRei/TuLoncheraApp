import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Sistema de notificaciones del admin (stock bajo, lote por vencer, más
 * tipos después — ver docs/03-decisiones para el ADR correspondiente).
 * `leida` (UX: "el admin ya la vio") y `resuelta` (la condición que la
 * generó ya no aplica) son mutables por diseño — esta tabla no es un libro
 * contable, R1/R2 no aplican, es más parecido a `descuentos.activo`.
 *
 * `clave_deduplicacion` (ej. "STOCK_BAJO:{productoId}") con índice único
 * parcial sobre filas activas: el generador puede correr repetidamente sin
 * duplicar la misma alerta, pero si se resuelve y la condición vuelve a
 * aparecer, se crea una fila nueva (no se reabre la vieja).
 */
export const migracion0013Notificaciones: Migracion = {
  version: 13,
  nombre: 'notificaciones',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE notificaciones (
        id TEXT PRIMARY KEY NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('STOCK_BAJO', 'LOTE_POR_VENCER')),
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
      CREATE UNIQUE INDEX idx_notificaciones_dedup
        ON notificaciones(clave_deduplicacion) WHERE resuelta = 0;
      CREATE INDEX idx_notificaciones_leida ON notificaciones(leida);
    `);
  },
};
