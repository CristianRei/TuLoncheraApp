import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Reglas de descuento con vigencia — ver ADR 0005. `producto_id`/`punto_id`
 * opcionales: NULL en uno significa "aplica a todos" en esa dimensión.
 * Igual que `descuentos.activo` no es un libro contable (no aplica R1/R2):
 * se puede desactivar antes de tiempo, pero nunca se edita el valor o la
 * vigencia de una regla ya creada — para cambiarla se desactiva y se crea
 * una nueva (mismo espíritu de "nunca editar un hecho" que ADR 0004).
 */
export const migracion0012Descuentos: Migracion = {
  version: 12,
  nombre: 'descuentos',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE descuentos (
        id TEXT PRIMARY KEY NOT NULL,
        producto_id TEXT REFERENCES productos(id),
        punto_id TEXT REFERENCES puntos(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('PORCENTAJE', 'MONTO_FIJO')),
        valor INTEGER NOT NULL,
        desde TEXT NOT NULL,
        hasta TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1,
        creado_por TEXT NOT NULL REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_descuentos_producto ON descuentos(producto_id);
      CREATE INDEX idx_descuentos_punto ON descuentos(punto_id);
    `);
  },
};
