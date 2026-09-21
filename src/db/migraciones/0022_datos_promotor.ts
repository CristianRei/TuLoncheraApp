import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Datos de contacto para la gestión de promotores desde admin (contratar/dar
 * de baja, ver app/admin/promotores/): cédula (de donde se deriva el PIN,
 * ver src/db/promotores.ts), celular y dirección. Nullable — los usuarios ya
 * existentes (Admin, Cristian, Bodega, los del demo) no tienen esta
 * información capturada.
 */
export const migracion0022DatosPromotor: Migracion = {
  version: 22,
  nombre: 'datos_promotor',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      ALTER TABLE usuarios ADD COLUMN cedula TEXT;
      ALTER TABLE usuarios ADD COLUMN celular TEXT;
      ALTER TABLE usuarios ADD COLUMN direccion TEXT;
    `);
  },
};
