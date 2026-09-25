import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Descuento por PROMOTOR: "Cristian hoy de 8 am a 4 pm tiene 10 % en sus
 * productos". `promotor_id` NULL = aplica a cualquier promotor, igual que
 * `producto_id`/`punto_id` (migración 0012). El horario NO necesita columnas
 * nuevas: `desde`/`hasta` ya son instantes completos (fecha + hora) y el
 * horario es continuo — del primer día a la hora de inicio hasta el último
 * día a la hora de fin (decisión del negocio, 2026-09-24).
 */
export const migracion0031DescuentosPromotor: Migracion = {
  version: 31,
  nombre: 'descuentos_promotor',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      ALTER TABLE descuentos ADD COLUMN promotor_id TEXT REFERENCES usuarios(id);
      CREATE INDEX idx_descuentos_promotor ON descuentos(promotor_id);
    `);
  },
};
