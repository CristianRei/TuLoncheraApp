import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Anular una venta nunca borra nada (R2): se marca la venta y se revierte
 * su efecto en el inventario con un movimiento compensatorio nuevo — ver
 * docs/03-decisiones/0004-anulacion-de-ventas.md.
 *
 * `ventas` gana dos columnas simples (sin CHECK de por medio, no hace falta
 * recrear la tabla). `movimientos` sí hay que recrearla: el nuevo tipo
 * ANULACION_VENTA va en un CHECK, y SQLite no permite tocar un CHECK con
 * ALTER TABLE.
 */
export const migracion0008AnulacionVentas: Migracion = {
  version: 8,
  nombre: 'anulacion_ventas',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      ALTER TABLE ventas ADD COLUMN anulada INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ventas ADD COLUMN motivo_anulacion TEXT;

      CREATE TABLE movimientos_nueva (
        id TEXT PRIMARY KEY NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN (
          'COMPRA_PROVEEDOR', 'RECARGA', 'VENTA', 'TRASLADO', 'RETIRO_ADMIN',
          'AJUSTE_CONTEO', 'AVERIA', 'DEGUSTACION', 'OBSEQUIO',
          'DEVOLUCION_VENCIMIENTO', 'ANULACION_VENTA'
        )),
        producto_id TEXT NOT NULL REFERENCES productos(id),
        lote_id TEXT REFERENCES lotes(id),
        cantidad INTEGER NOT NULL,
        ubicacion_origen_id TEXT REFERENCES ubicaciones(id),
        ubicacion_destino_id TEXT REFERENCES ubicaciones(id),
        evento_id TEXT REFERENCES eventos(id),
        usuario_id TEXT NOT NULL REFERENCES usuarios(id),
        motivo TEXT,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      INSERT INTO movimientos_nueva (
        id, tipo, producto_id, lote_id, cantidad, ubicacion_origen_id,
        ubicacion_destino_id, evento_id, usuario_id, motivo, ts_cliente, dispositivo_id
      )
      SELECT
        id, tipo, producto_id, lote_id, cantidad, ubicacion_origen_id,
        ubicacion_destino_id, evento_id, usuario_id, motivo, ts_cliente, dispositivo_id
      FROM movimientos;

      DROP TABLE movimientos;
      ALTER TABLE movimientos_nueva RENAME TO movimientos;

      CREATE INDEX idx_movimientos_producto ON movimientos(producto_id);
      CREATE INDEX idx_movimientos_evento ON movimientos(evento_id);
    `);
  },
};
