import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Bitácora de auditoría administrativa — registra quién hizo qué sobre
 * personal, clientes, categorías y eventos de calendario (ver
 * app/admin/auditoria/, src/db/auditoria.ts). Append-only, igual que
 * `movimientos` (R1/R2 de CLAUDE.md): nunca UPDATE ni DELETE, un error se
 * corrige con una entrada nueva, no editando esta.
 *
 * No duplica movimientos de inventario (ya inmutables en `movimientos`) ni
 * intentos de PIN (ya en `intentos_pin_fallidos`/`logins_exitosos_pin`,
 * migración 0009) — la pantalla de auditoría lee ambas tablas por separado
 * y arma la línea de tiempo combinada en la capa de aplicación.
 */
export const migracion0027BitacoraAuditoria: Migracion = {
  version: 27,
  nombre: 'bitacora_auditoria',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE bitacora_auditoria (
        id TEXT PRIMARY KEY NOT NULL,
        usuario_id TEXT NOT NULL REFERENCES usuarios(id),
        entidad TEXT NOT NULL CHECK (entidad IN ('PERSONA', 'CLIENTE', 'CATEGORIA', 'EVENTO')),
        entidad_id TEXT NOT NULL,
        accion TEXT NOT NULL CHECK (accion IN ('CREAR', 'ACTUALIZAR', 'ELIMINAR', 'CAMBIAR_ROL', 'CANCELAR')),
        detalles TEXT,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_bitacora_auditoria_ts ON bitacora_auditoria(ts_cliente);
    `);
  },
};
