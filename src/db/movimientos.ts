import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { MovimientoParaSaldo } from '@/core/inventario';
import type { TipoMovimiento } from '@/core/tipos';

interface DatosMovimiento {
  tipo: TipoMovimiento;
  productoId: string;
  loteId?: string | null;
  cantidad: number;
  ubicacionOrigenId: string | null;
  ubicacionDestinoId: string | null;
  usuarioId: string;
  motivo?: string | null;
}

/**
 * Inserta un movimiento. Nunca UPDATE ni DELETE sobre esta tabla (R2) — un
 * error se corrige con un movimiento compensatorio, no editando este.
 */
export async function registrarMovimiento(
  db: SQLiteDatabase,
  datos: DatosMovimiento,
  dispositivoId: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO movimientos (
       id, tipo, producto_id, lote_id, cantidad, ubicacion_origen_id, ubicacion_destino_id,
       usuario_id, motivo, ts_cliente, dispositivo_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Crypto.randomUUID(),
      datos.tipo,
      datos.productoId,
      datos.loteId ?? null,
      datos.cantidad,
      datos.ubicacionOrigenId,
      datos.ubicacionDestinoId,
      datos.usuarioId,
      datos.motivo ?? null,
      new Date().toISOString(),
      dispositivoId,
    ]
  );
}

export async function listarMovimientosPorUbicacion(
  db: SQLiteDatabase,
  ubicacionId: string
): Promise<MovimientoParaSaldo[]> {
  const filas = await db.getAllAsync<{
    producto_id: string;
    cantidad: number;
    ubicacion_origen_id: string | null;
    ubicacion_destino_id: string | null;
  }>(
    `SELECT producto_id, cantidad, ubicacion_origen_id, ubicacion_destino_id
     FROM movimientos
     WHERE ubicacion_origen_id = ? OR ubicacion_destino_id = ?`,
    [ubicacionId, ubicacionId]
  );
  return filas.map((fila) => ({
    productoId: fila.producto_id,
    cantidad: fila.cantidad,
    ubicacionOrigenId: fila.ubicacion_origen_id,
    ubicacionDestinoId: fila.ubicacion_destino_id,
  }));
}
