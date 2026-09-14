import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Recrea `productos` (SQLite no permite quitar NOT NULL con ALTER TABLE):
 * - `categoria` y `costo` pasan a ser opcionales — el catálogo real que
 *   compartió el cliente solo trae nombre y precio, y CLAUDE.md sección 8
 *   prohíbe inventar datos en vez de dejarlos vacíos.
 * - `activo` (mismo patrón que `usuarios.activo`): "eliminar" un producto
 *   desde la app es desactivarlo, nunca un DELETE — productos va a tener FKs
 *   desde movimientos/ventas en fases futuras.
 * - `foto_uri`: ruta a la imagen guardada localmente (ver src/db/fotos.ts).
 */
export const migracion0004CatalogoEditable: Migracion = {
  version: 4,
  nombre: 'catalogo_editable',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE productos_nuevo (
        id TEXT PRIMARY KEY NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        codigo_barras TEXT,
        nombre TEXT NOT NULL,
        categoria TEXT,
        es_licor INTEGER NOT NULL DEFAULT 0,
        es_perecedero INTEGER NOT NULL DEFAULT 0,
        precio INTEGER NOT NULL,
        costo INTEGER,
        unidad_empaque INTEGER NOT NULL DEFAULT 1,
        foto_uri TEXT,
        activo INTEGER NOT NULL DEFAULT 1,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      INSERT INTO productos_nuevo (
        id, sku, codigo_barras, nombre, categoria, es_licor, es_perecedero,
        precio, costo, unidad_empaque, foto_uri, activo, ts_cliente, dispositivo_id
      )
      SELECT
        id, sku, codigo_barras, nombre, categoria, es_licor, es_perecedero,
        precio, costo, unidad_empaque, NULL, 1, ts_cliente, dispositivo_id
      FROM productos;

      DROP TABLE productos;
      ALTER TABLE productos_nuevo RENAME TO productos;
    `);
  },
};
