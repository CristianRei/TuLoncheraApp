import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Backoff y bloqueo duro de PIN por dispositivo+modo, para frenar intentos
 * de adivinar el PIN de otro rol (ver conversación con el usuario, 2026-09-17).
 *
 * Nunca se guarda el PIN tecleado, ni en claro ni hasheado: solo interesa el
 * hecho de que hubo un intento fallido, no qué se tecleó.
 *
 * El "contador" de fallos consecutivos nunca es una columna mutable (mismo
 * espíritu de R1): siempre se deriva contando filas de `intentos_pin_fallidos`
 * posteriores al evento más reciente entre `desbloqueos_pin` y
 * `logins_exitosos_pin` para esa combinación dispositivo+modo. Tres tablas
 * separadas porque cada una tiene una columna obligatoria distinta
 * (`admin_id` solo aplica a un desbloqueo) — una sola tabla de "eventos"
 * obligaría a columnas opcionales confusas.
 */
export const migracion0009SeguridadPin: Migracion = {
  version: 9,
  nombre: 'seguridad_pin',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE intentos_pin_fallidos (
        id TEXT PRIMARY KEY NOT NULL,
        dispositivo_id TEXT NOT NULL,
        modo TEXT NOT NULL CHECK (modo IN ('PROMOTOR', 'ADMIN', 'BODEGA')),
        ts_cliente TEXT NOT NULL
      );
      CREATE INDEX idx_intentos_pin_dispositivo_modo
        ON intentos_pin_fallidos(dispositivo_id, modo, ts_cliente);

      CREATE TABLE desbloqueos_pin (
        id TEXT PRIMARY KEY NOT NULL,
        dispositivo_id TEXT NOT NULL,
        modo TEXT NOT NULL CHECK (modo IN ('PROMOTOR', 'ADMIN', 'BODEGA')),
        admin_id TEXT NOT NULL REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL
      );
      CREATE INDEX idx_desbloqueos_pin_dispositivo_modo
        ON desbloqueos_pin(dispositivo_id, modo, ts_cliente);

      CREATE TABLE logins_exitosos_pin (
        id TEXT PRIMARY KEY NOT NULL,
        dispositivo_id TEXT NOT NULL,
        modo TEXT NOT NULL CHECK (modo IN ('PROMOTOR', 'ADMIN', 'BODEGA')),
        ts_cliente TEXT NOT NULL
      );
      CREATE INDEX idx_logins_exitosos_pin_dispositivo_modo
        ON logins_exitosos_pin(dispositivo_id, modo, ts_cliente);
    `);
  },
};
