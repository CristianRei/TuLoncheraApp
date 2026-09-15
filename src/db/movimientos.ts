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

export interface MovimientoExportable {
  tipo: string;
  productoNombre: string;
  cantidad: number;
  ubicacionOrigen: string | null;
  ubicacionDestino: string | null;
  usuarioNombre: string;
  motivo: string | null;
  tsCliente: string;
}

/** Libro completo de movimientos, con nombres legibles — solo para exportar/reportes. */
export async function listarTodosLosMovimientos(
  db: SQLiteDatabase
): Promise<MovimientoExportable[]> {
  return db.getAllAsync<MovimientoExportable>(
    `SELECT
       m.tipo,
       p.nombre as productoNombre,
       m.cantidad,
       uo.nombre as ubicacionOrigen,
       ud.nombre as ubicacionDestino,
       u.nombre as usuarioNombre,
       m.motivo,
       m.ts_cliente as tsCliente
     FROM movimientos m
     JOIN productos p ON p.id = m.producto_id
     JOIN usuarios u ON u.id = m.usuario_id
     LEFT JOIN ubicaciones uo ON uo.id = m.ubicacion_origen_id
     LEFT JOIN ubicaciones ud ON ud.id = m.ubicacion_destino_id
     ORDER BY m.ts_cliente DESC`
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
