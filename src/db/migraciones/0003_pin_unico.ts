import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Ver docs/03-decisiones/0001-metodo-autenticacion.md: el PIN es el único
 * mecanismo de login, así que no puede repetirse entre usuarios.
 */
export const migracion0003PinUnico: Migracion = {
  version: 3,
  nombre: 'pin_unico',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE UNIQUE INDEX idx_usuarios_pin ON usuarios(pin);
    `);
  },
};
