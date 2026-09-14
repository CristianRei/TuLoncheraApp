import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Cada promotor tiene una `ubicacion` de tipo PROMOTOR donde vive su saldo
 * (R1, R4). Se crea perezosamente la primera vez que se le asigna cargue —
 * ver docs/03-decisiones/0002-ventas-sin-evento.md.
 */
export async function obtenerOCrearUbicacionPromotor(
  db: SQLiteDatabase,
  usuarioId: string,
  nombre: string,
  dispositivoId: string
): Promise<string> {
  const existente = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM ubicaciones WHERE tipo = 'PROMOTOR' AND responsable_id = ?",
    [usuarioId]
  );
  if (existente) return existente.id;

  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO ubicaciones (id, tipo, nombre, responsable_id, ts_cliente, dispositivo_id)
     VALUES (?, 'PROMOTOR', ?, ?, ?, ?)`,
    [id, nombre, usuarioId, new Date().toISOString(), dispositivoId]
  );
  return id;
}
