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
 * Devuelve el id generado para que el llamador pueda encolarlo a sincronizar
 * (`encolarSync`) — esta función no encola nada por sí misma porque también
 * la usan los seeds de `__DEV__` (seedDemo.ts, seedInventario.ts), que nunca
 * deben subir datos falsos a Supabase.
 */
export async function registrarMovimiento(
  db: SQLiteDatabase,
  datos: DatosMovimiento,
  dispositivoId: string
): Promise<string> {
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO movimientos (
       id, tipo, producto_id, lote_id, cantidad, ubicacion_origen_id, ubicacion_destino_id,
       usuario_id, motivo, ts_cliente, dispositivo_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
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
  return id;
}

export interface MovimientoParaSync {
  id: string;
  tipo: string;
  productoId: string;
  productoSku: string;
  productoNombre: string;
  cantidad: number;
  ubicacionOrigenTipo: string | null;
  ubicacionOrigenNombre: string | null;
  ubicacionOrigenResponsableId: string | null;
  ubicacionDestinoTipo: string | null;
  ubicacionDestinoNombre: string | null;
  ubicacionDestinoResponsableId: string | null;
  usuarioId: string;
  usuarioNombre: string;
  motivo: string | null;
  tsCliente: string;
}

/**
 * Un movimiento con los nombres ya resueltos, para subir a Supabase — ahí no
 * hay `productos`/`usuarios`/`ubicaciones` sincronizados todavía (ver
 * supabase/migraciones/0004_ventas_movimientos_cargues_conteos.sql), así que
 * cada fila remota lleva su propio texto legible en vez de depender de un
 * JOIN que del otro lado no se puede hacer.
 */
export async function obtenerMovimientoParaSync(
  db: SQLiteDatabase,
  id: string
): Promise<MovimientoParaSync | null> {
  const fila = await db.getFirstAsync<{
    id: string;
    tipo: string;
    producto_id: string;
    producto_sku: string;
    producto_nombre: string;
    cantidad: number;
    ubicacion_origen_tipo: string | null;
    ubicacion_origen_nombre: string | null;
    ubicacion_origen_responsable_id: string | null;
    ubicacion_destino_tipo: string | null;
    ubicacion_destino_nombre: string | null;
    ubicacion_destino_responsable_id: string | null;
    usuario_id: string;
    usuario_nombre: string;
    motivo: string | null;
    ts_cliente: string;
  }>(
    `SELECT
       m.id, m.tipo, m.producto_id, p.sku as producto_sku, p.nombre as producto_nombre, m.cantidad,
       uo.tipo as ubicacion_origen_tipo, uo.nombre as ubicacion_origen_nombre,
       uo.responsable_id as ubicacion_origen_responsable_id,
       ud.tipo as ubicacion_destino_tipo, ud.nombre as ubicacion_destino_nombre,
       ud.responsable_id as ubicacion_destino_responsable_id,
       m.usuario_id, u.nombre as usuario_nombre, m.motivo, m.ts_cliente
     FROM movimientos m
     JOIN productos p ON p.id = m.producto_id
     JOIN usuarios u ON u.id = m.usuario_id
     LEFT JOIN ubicaciones uo ON uo.id = m.ubicacion_origen_id
     LEFT JOIN ubicaciones ud ON ud.id = m.ubicacion_destino_id
     WHERE m.id = ?`,
    [id]
  );
  if (!fila) return null;
  return {
    id: fila.id,
    tipo: fila.tipo,
    productoId: fila.producto_id,
    productoSku: fila.producto_sku,
    productoNombre: fila.producto_nombre,
    cantidad: fila.cantidad,
    ubicacionOrigenTipo: fila.ubicacion_origen_tipo,
    ubicacionOrigenNombre: fila.ubicacion_origen_nombre,
    ubicacionOrigenResponsableId: fila.ubicacion_origen_responsable_id,
    ubicacionDestinoTipo: fila.ubicacion_destino_tipo,
    ubicacionDestinoNombre: fila.ubicacion_destino_nombre,
    ubicacionDestinoResponsableId: fila.ubicacion_destino_responsable_id,
    usuarioId: fila.usuario_id,
    usuarioNombre: fila.usuario_nombre,
    motivo: fila.motivo,
    tsCliente: fila.ts_cliente,
  };
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
