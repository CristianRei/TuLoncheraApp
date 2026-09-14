import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Recrea `ventas` (SQLite no permite tocar NOT NULL ni CHECK con ALTER
 * TABLE):
 * - `evento_id` pasa a ser opcional — ver
 *   docs/03-decisiones/0002-ventas-sin-evento.md.
 * - El CHECK de `metodo_pago` cambia a los medios de pago reales del
 *   negocio (Efectivo, Transferencia, Libranza), reemplazando la suposición
 *   inicial (Nequi/Daviplata/Datáfono).
 */
export const migracion0006VentasSinEvento: Migracion = {
  version: 6,
  nombre: 'ventas_sin_evento',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE ventas_nueva (
        id TEXT PRIMARY KEY NOT NULL,
        numero_recibo TEXT NOT NULL UNIQUE,
        evento_id TEXT REFERENCES eventos(id),
        promotor_id TEXT NOT NULL REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('EFECTIVO', 'TRANSFERENCIA', 'LIBRANZA')),
        total INTEGER NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      INSERT INTO ventas_nueva (
        id, numero_recibo, evento_id, promotor_id, ts_cliente, metodo_pago, total, dispositivo_id
      )
      SELECT id, numero_recibo, evento_id, promotor_id, ts_cliente, metodo_pago, total, dispositivo_id
      FROM ventas;

      DROP TABLE ventas;
      ALTER TABLE ventas_nueva RENAME TO ventas;
    `);
  },
};
