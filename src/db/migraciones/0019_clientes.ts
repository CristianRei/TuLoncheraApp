import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Clientes finales (persona natural) que un promotor puede registrar en
 * campo, para poder asignarles después la factura de una venta (ej. si
 * quieren el recibo electrónico). No es parte del libro de inventario —
 * R1/R2 no aplican aquí, por eso `eliminarCliente` (src/db/clientes.ts)
 * hace un DELETE real en vez del patrón `activo=0` de productos.
 *
 * `ventas.cliente_id` es opcional y nullable, mismo patrón que
 * `ventas.punto_id` en la 0011: ALTER TABLE ADD COLUMN alcanza.
 */
export const migracion0019Clientes: Migracion = {
  version: 19,
  nombre: 'clientes',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE clientes (
        id TEXT PRIMARY KEY NOT NULL,
        nombre_completo TEXT NOT NULL,
        telefono TEXT,
        direccion TEXT,
        ciudad TEXT,
        empresa TEXT,
        nota TEXT,
        creado_por TEXT NOT NULL REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_clientes_nombre ON clientes(nombre_completo);

      ALTER TABLE ventas ADD COLUMN cliente_id TEXT REFERENCES clientes(id);
    `);
  },
};
