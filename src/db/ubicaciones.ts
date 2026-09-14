import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

const NOMBRE_BODEGA = 'Bodega principal';

/**
 * Búsquedas de solo lectura — no crean nada. Para listar/mostrar saldos sin
 * dejar una fila de `ubicaciones` solo por haber mirado.
 */
export async function buscarUbicacionPromotor(
  db: SQLiteDatabase,
  usuarioId: string
): Promise<string | null> {
  const fila = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM ubicaciones WHERE tipo = 'PROMOTOR' AND responsable_id = ?",
    [usuarioId]
  );
  return fila?.id ?? null;
}

export async function buscarUbicacionBodega(db: SQLiteDatabase): Promise<string | null> {
  const fila = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM ubicaciones WHERE tipo = 'BODEGA' LIMIT 1"
  );
  return fila?.id ?? null;
}

/**
 * Cada promotor tiene una `ubicacion` de tipo PROMOTOR donde vive su saldo
 * (R1, R4). Se crea perezosamente la primera vez que se le asigna cargue.
 */
export async function obtenerOCrearUbicacionPromotor(
  db: SQLiteDatabase,
  usuarioId: string,
  nombre: string,
  dispositivoId: string
): Promise<string> {
  const existente = await buscarUbicacionPromotor(db, usuarioId);
  if (existente) return existente;

  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO ubicaciones (id, tipo, nombre, responsable_id, ts_cliente, dispositivo_id)
     VALUES (?, 'PROMOTOR', ?, ?, ?, ?)`,
    [id, nombre, usuarioId, new Date().toISOString(), dispositivoId]
  );
  return id;
}

/**
 * La bodega (una sola, R1 del negocio: "una bodega y dos camiones"). Se
 * crea perezosamente la primera vez que entra inventario — ver
 * docs/03-decisiones/0003-stock-de-bodega.md.
 */
export async function obtenerOCrearUbicacionBodega(
  db: SQLiteDatabase,
  dispositivoId: string
): Promise<string> {
  const existente = await buscarUbicacionBodega(db);
  if (existente) return existente;

  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO ubicaciones (id, tipo, nombre, responsable_id, ts_cliente, dispositivo_id)
     VALUES (?, 'BODEGA', ?, NULL, ?, ?)`,
    [id, NOMBRE_BODEGA, new Date().toISOString(), dispositivoId]
  );
  return id;
}
