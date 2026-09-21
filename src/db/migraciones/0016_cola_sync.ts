import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Cola de sincronización hacia Supabase — primera rebanada de Fase 5, solo
 * turnos y comprobantes de transferencia (ver
 * docs/03-decisiones/0006-sincronizacion-turnos-comprobantes.md).
 *
 * Una tabla de cola en vez de un flag `sincronizado` en `turnos`/`ventas`:
 * una entidad puede fallar "a medias" (sube la fila de datos pero falla la
 * foto, o al revés) — un solo booleano no puede representar ese estado
 * intermedio. Una fila de cola por sub-tarea (`FILA` vs `FOTO`) sí puede, y
 * cada una se reintenta de forma independiente. `completado_ts IS NULL` es
 * la cola pendiente real; nunca se borra una tarea completada (se deja como
 * rastro, mismo espíritu de nunca borrar hechos que ya ocurrieron).
 *
 * Esta migración también hace backfill: encola cada turno y cada venta con
 * comprobante que ya exista localmente al momento de aplicarse, para que el
 * histórico se suba solo con el mismo motor incremental — sin script aparte.
 */
export const migracion0016ColaSync: Migracion = {
  version: 16,
  nombre: 'cola_sync',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE _sync_pendiente (
        id TEXT PRIMARY KEY NOT NULL,
        tabla TEXT NOT NULL CHECK (tabla IN ('turnos', 'comprobantes_venta')),
        entidad_id TEXT NOT NULL,
        tipo_tarea TEXT NOT NULL CHECK (tipo_tarea IN ('FILA', 'FOTO')),
        intentos INTEGER NOT NULL DEFAULT 0,
        ultimo_error TEXT,
        creado_ts TEXT NOT NULL,
        completado_ts TEXT
      );
      CREATE INDEX idx_sync_pendiente_estado
        ON _sync_pendiente(tabla, entidad_id, tipo_tarea) WHERE completado_ts IS NULL;
    `);

    const ahora = new Date().toISOString();

    const turnos = await db.getAllAsync<{ id: string }>('SELECT id FROM turnos');
    for (const turno of turnos) {
      await db.runAsync(
        `INSERT INTO _sync_pendiente (id, tabla, entidad_id, tipo_tarea, creado_ts) VALUES (?, 'turnos', ?, 'FILA', ?)`,
        [Crypto.randomUUID(), turno.id, ahora]
      );
      await db.runAsync(
        `INSERT INTO _sync_pendiente (id, tabla, entidad_id, tipo_tarea, creado_ts) VALUES (?, 'turnos', ?, 'FOTO', ?)`,
        [Crypto.randomUUID(), turno.id, ahora]
      );
    }

    const ventasConComprobante = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM ventas WHERE comprobante_uri IS NOT NULL"
    );
    for (const venta of ventasConComprobante) {
      await db.runAsync(
        `INSERT INTO _sync_pendiente (id, tabla, entidad_id, tipo_tarea, creado_ts) VALUES (?, 'comprobantes_venta', ?, 'FILA', ?)`,
        [Crypto.randomUUID(), venta.id, ahora]
      );
      await db.runAsync(
        `INSERT INTO _sync_pendiente (id, tabla, entidad_id, tipo_tarea, creado_ts) VALUES (?, 'comprobantes_venta', ?, 'FOTO', ?)`,
        [Crypto.randomUUID(), venta.id, ahora]
      );
    }
  },
};
