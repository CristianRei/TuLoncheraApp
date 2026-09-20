import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Activa `empresas`/`eventos` (sin usar desde el esquema inicial, ver ADR
 * 0002) como el mecanismo de "punto de venta": una empresa cliente (ej.
 * Falabella) tiene varios `puntos` (sedes: Norte, Sur, Centro). `eventos`
 * se recrea con `punto_id` y pasa a representar la asignación vigente de un
 * promotor a un punto (no un evento con calendario todavía — ver ADR 0005).
 *
 * `eventos` nunca se usó (tabla vacía) — se recrea sin migrar filas, mismo
 * criterio que `conteos` en la 0010. `productos.marca` y `ventas.punto_id`
 * son columnas nuevas opcionales: ALTER TABLE ADD COLUMN alcanza, no
 * requieren recrear esas tablas.
 */
export const migracion0011PuntosYMarca: Migracion = {
  version: 11,
  nombre: 'puntos_y_marca',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE puntos (
        id TEXT PRIMARY KEY NOT NULL,
        empresa_id TEXT NOT NULL REFERENCES empresas(id),
        nombre TEXT NOT NULL,
        direccion TEXT,
        activo INTEGER NOT NULL DEFAULT 1,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_puntos_empresa ON puntos(empresa_id);

      DROP TABLE eventos;

      CREATE TABLE eventos (
        id TEXT PRIMARY KEY NOT NULL,
        empresa_id TEXT NOT NULL REFERENCES empresas(id),
        punto_id TEXT NOT NULL REFERENCES puntos(id),
        fecha TEXT NOT NULL,
        promotor_id TEXT REFERENCES usuarios(id),
        conductor_id TEXT REFERENCES usuarios(id),
        camion_id TEXT REFERENCES ubicaciones(id),
        estado TEXT NOT NULL CHECK (estado IN ('PLANEADO', 'EN_CURSO', 'CERRADO')),
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_eventos_promotor_estado ON eventos(promotor_id, estado);

      ALTER TABLE productos ADD COLUMN marca TEXT;
      ALTER TABLE ventas ADD COLUMN punto_id TEXT REFERENCES puntos(id);
    `);
  },
};
