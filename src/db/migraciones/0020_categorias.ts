import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * `productos.categoria` (TEXT libre, desde la 0001) nunca se pobló — ninguna
 * pantalla del catálogo llegó a exponerlo — así que no hay datos que migrar.
 * En vez de seguir usándolo como texto libre (que permitiría "Galleta" y
 * "galleta" como dos categorías distintas), se reemplaza por una tabla
 * `categorias` administrable: los admins pueden crear categorías en
 * cualquier momento (ver src/db/categorias.ts, `crearCategoria` es
 * idempotente por nombre normalizado), pero el catálogo solo permite
 * *elegir* entre las que ya existen — nunca texto libre.
 *
 * La columna vieja `productos.categoria` queda sin uso (siempre NULL) en vez
 * de recrear la tabla para quitarla — no vale la pena el riesgo sobre una
 * tabla con datos reales por una columna que de todas formas nunca se leyó.
 */
export const migracion0020Categorias: Migracion = {
  version: 20,
  nombre: 'categorias',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE categorias (
        id TEXT PRIMARY KEY NOT NULL,
        nombre TEXT NOT NULL,
        nombre_normalizado TEXT NOT NULL UNIQUE,
        activo INTEGER NOT NULL DEFAULT 1,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_categorias_activo ON categorias(activo);

      ALTER TABLE productos ADD COLUMN categoria_id TEXT REFERENCES categorias(id);
    `);

    const CATEGORIAS_INICIALES = [
      'Galletas',
      'Cereales',
      'Ponqués',
      'Jugos',
      'Dulces',
      'Lácteos',
      'Paquetes de fritos',
    ];
    const ahora = new Date().toISOString();
    for (const nombre of CATEGORIAS_INICIALES) {
      await db.runAsync(
        `INSERT INTO categorias (id, nombre, nombre_normalizado, activo, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, 1, ?, 'migracion-0020')`,
        [Crypto.randomUUID(), nombre, nombre.trim().toLowerCase(), ahora]
      );
    }
  },
};
