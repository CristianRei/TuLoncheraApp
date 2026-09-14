import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Dos productos no pueden compartir código de barras. Los NULL (todavía
 * todos los productos del catálogo inicial) no chocan entre sí en un índice
 * UNIQUE de SQLite, así que esto no rompe nada existente.
 */
export const migracion0007CodigoBarrasUnico: Migracion = {
  version: 7,
  nombre: 'codigo_barras_unico',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE UNIQUE INDEX idx_productos_codigo_barras ON productos(codigo_barras);
    `);
  },
};
