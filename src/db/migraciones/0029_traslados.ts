import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Traslado directo de inventario entre dos promotores, sin pasar por
 * bodega — admin planea, bodega confirma línea por línea (mismo patrón que
 * `cargues`/`cargue_lineas`, migración 0017, ver ADR 0007). No se reusa
 * `cargues` porque su `promotor_id` es único (siempre el receptor de una
 * RECARGA desde bodega) — un traslado necesita origen Y destino.
 *
 * Sin requisito de turno abierto para confirmar (a diferencia del cargue
 * normal): es una operación administrativa, mismo espíritu que
 * `RETIRO_ADMIN` — ver R4 ampliada, CLAUDE.md sección 3.
 */
export const migracion0029Traslados: Migracion = {
  version: 29,
  nombre: 'traslados',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE traslados (
        id TEXT PRIMARY KEY NOT NULL,
        promotor_origen_id TEXT NOT NULL REFERENCES usuarios(id),
        promotor_destino_id TEXT NOT NULL REFERENCES usuarios(id),
        estado TEXT NOT NULL CHECK (estado IN ('PLANEADO', 'ENTREGADO', 'CANCELADO')),
        creado_por TEXT NOT NULL REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_traslados_origen ON traslados(promotor_origen_id, estado);
      CREATE INDEX idx_traslados_destino ON traslados(promotor_destino_id, estado);

      CREATE TABLE traslado_lineas (
        id TEXT PRIMARY KEY NOT NULL,
        traslado_id TEXT NOT NULL REFERENCES traslados(id),
        producto_id TEXT NOT NULL REFERENCES productos(id),
        cantidad_planeada INTEGER NOT NULL,
        cantidad_entregada INTEGER NOT NULL DEFAULT 0,
        estado TEXT NOT NULL CHECK (estado IN ('PENDIENTE', 'ENTREGADA', 'REVISAR')) DEFAULT 'PENDIENTE',
        motivo_revision TEXT,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_traslado_lineas_traslado ON traslado_lineas(traslado_id);
    `);
  },
};
