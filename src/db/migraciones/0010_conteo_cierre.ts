import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Recrea `conteos`: `evento_id` pasa a ser opcional (mismo motivo que
 * migracion0006VentasSinEvento — todavía no se pidió gestión de
 * empresas/eventos, ver docs/03-decisiones/0002-ventas-sin-evento.md) y se
 * agrega `promotor_id`, ausente en el esquema original, para poder listar
 * los conteos de un promotor sin depender de un evento que no existe.
 * La tabla nunca se usó (sin filas que preservar). SQLite no permite tocar
 * NOT NULL/REFERENCES con ALTER TABLE.
 */
export const migracion0010ConteoCierre: Migracion = {
  version: 10,
  nombre: 'conteo_cierre',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      DROP TABLE conteos;

      CREATE TABLE conteos (
        id TEXT PRIMARY KEY NOT NULL,
        evento_id TEXT REFERENCES eventos(id),
        promotor_id TEXT NOT NULL REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('ABIERTO', 'PENDIENTE_APROBACION', 'CERRADO')),
        firmado_por TEXT REFERENCES usuarios(id),
        dispositivo_id TEXT NOT NULL
      );
    `);
  },
};
