import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * `desbloqueos_pin.admin_id` nació con `REFERENCES usuarios(id)` (migración
 * 0009) — seguro mientras la tabla fuera 100% local: el admin que desbloqueaba
 * siempre existía en SU PROPIO `usuarios` local. Al sincronizar esta tabla
 * (ver `supabase/migraciones/0010_seguridad_pin.sql`, `app/index.tsx`
 * auto-desbloqueo remoto), un desbloqueo hecho por un admin EN OTRO
 * dispositivo llega con un `admin_id` que no existe en el `usuarios` local
 * del dispositivo que lo recibe (cada dispositivo tiene su propio conjunto de
 * ids de usuario — ver CLAUDE.md sección 10 "Sincronización de bajada"). El
 * INSERT fallaba con "FOREIGN KEY constraint failed" y el celular bloqueado
 * nunca se destrababa solo. `admin_id` nunca se lee para calcular el estado
 * de bloqueo (`contarFallosConsecutivos` solo usa `ts_cliente`) — es solo
 * trazabilidad de quién autorizó, así que no necesita ser una FK real.
 *
 * SQLite no permite quitar una FK con ALTER TABLE, así que se recrea la tabla
 * (copiando las filas que ya existan) sin esa restricción.
 */
export const migracion0028DesbloqueosPinSinFk: Migracion = {
  version: 28,
  nombre: 'desbloqueos_pin_sin_fk',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE desbloqueos_pin_nueva (
        id TEXT PRIMARY KEY NOT NULL,
        dispositivo_id TEXT NOT NULL,
        modo TEXT NOT NULL CHECK (modo IN ('PROMOTOR', 'ADMIN', 'BODEGA')),
        admin_id TEXT NOT NULL,
        ts_cliente TEXT NOT NULL
      );

      INSERT INTO desbloqueos_pin_nueva (id, dispositivo_id, modo, admin_id, ts_cliente)
      SELECT id, dispositivo_id, modo, admin_id, ts_cliente FROM desbloqueos_pin;

      DROP TABLE desbloqueos_pin;
      ALTER TABLE desbloqueos_pin_nueva RENAME TO desbloqueos_pin;

      CREATE INDEX idx_desbloqueos_pin_dispositivo_modo
        ON desbloqueos_pin(dispositivo_id, modo, ts_cliente);
    `);
  },
};
