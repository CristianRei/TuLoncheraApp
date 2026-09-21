import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Cargue en dos pasos: admin PLANEA (sin tocar inventario) y bodega
 * EJECUTA línea por línea (genera el RECARGA real vía registrarCargue, ya
 * existente en src/db/cargue.ts). Mismo espíritu que conteos/conteo_lineas
 * — cabecera + líneas, `estado` es metadata de proceso, no un movimiento
 * de inventario, R1/R2 no aplican aquí.
 *
 * `cargue_lineas.estado`: PENDIENTE (bodega no la ha tocado), ENTREGADA
 * (bodega confirmó y ya generó su RECARGA), REVISAR (bodega encontró que
 * la realidad física no alcanza lo planeado — sin RECARGA completo,
 * admin debe resolverlo). Reducir un cargue (bajar cantidad_planeada o
 * quitar una línea) solo aplica mientras sigue PENDIENTE, porque esa
 * línea nunca generó ningún movimiento que revertir.
 */
export const migracion0017CarguesPendientes: Migracion = {
  version: 17,
  nombre: 'cargues_pendientes',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE cargues (
        id TEXT PRIMARY KEY NOT NULL,
        promotor_id TEXT NOT NULL REFERENCES usuarios(id),
        estado TEXT NOT NULL CHECK (estado IN ('PLANEADO', 'ENTREGADO', 'CANCELADO')),
        creado_por TEXT NOT NULL REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_cargues_promotor_estado ON cargues(promotor_id, estado);

      CREATE TABLE cargue_lineas (
        id TEXT PRIMARY KEY NOT NULL,
        cargue_id TEXT NOT NULL REFERENCES cargues(id),
        producto_id TEXT NOT NULL REFERENCES productos(id),
        cantidad_planeada INTEGER NOT NULL,
        cantidad_entregada INTEGER NOT NULL DEFAULT 0,
        estado TEXT NOT NULL CHECK (estado IN ('PENDIENTE', 'ENTREGADA', 'REVISAR')) DEFAULT 'PENDIENTE',
        motivo_revision TEXT,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_cargue_lineas_cargue ON cargue_lineas(cargue_id);
    `);
  },
};
