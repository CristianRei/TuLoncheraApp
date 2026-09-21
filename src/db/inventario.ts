import type { SQLiteDatabase } from 'expo-sqlite';

import { calcularSaldosPorLote, calcularSaldosPorProducto } from '@/core/inventario';
import type { Producto, TipoMovimiento } from '@/core/tipos';

import { listarMovimientosPorUbicacion } from './movimientos';
import { obtenerProductosPorIds } from './productos';
import { buscarUbicacionBodega, buscarUbicacionPromotor } from './ubicaciones';

export interface ItemInventario {
  producto: Producto;
  saldo: number;
}

async function calcularSaldosUbicacion(
  db: SQLiteDatabase,
  ubicacionId: string
): Promise<Map<string, number>> {
  const movimientos = await listarMovimientosPorUbicacion(db, ubicacionId);
  return calcularSaldosPorProducto(movimientos, ubicacionId);
}

async function listarInventarioUbicacion(
  db: SQLiteDatabase,
  ubicacionId: string
): Promise<ItemInventario[]> {
  const saldos = await calcularSaldosUbicacion(db, ubicacionId);
  const idsConSaldo = [...saldos.entries()].filter(([, saldo]) => saldo > 0).map(([id]) => id);
  const productos = await obtenerProductosPorIds(db, idsConSaldo);

  const items: ItemInventario[] = [];
  for (const [productoId, saldo] of saldos) {
    if (saldo <= 0) continue;
    const producto = productos.get(productoId);
    if (!producto) continue;
    items.push({ producto, saldo });
  }

  items.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
  return items;
}

/**
 * Inventario actual de un promotor: solo lo que tiene saldo > 0. Si nunca le
 * han asignado cargue, no tiene ubicación propia todavía — inventario vacío.
 */
export async function listarInventarioPromotor(
  db: SQLiteDatabase,
  promotorId: string
): Promise<ItemInventario[]> {
  const ubicacion = await buscarUbicacionPromotor(db, promotorId);
  if (!ubicacion) return [];
  return listarInventarioUbicacion(db, ubicacion);
}

/**
 * Saldo de un solo producto para un promotor — usado antes de agregar algo
 * al ticket por escáner, para no dejar vender lo que no tiene.
 */
export async function obtenerSaldoProducto(
  db: SQLiteDatabase,
  promotorId: string,
  productoId: string
): Promise<number> {
  const ubicacion = await buscarUbicacionPromotor(db, promotorId);
  if (!ubicacion) return 0;
  const saldos = await calcularSaldosUbicacion(db, ubicacion);
  return saldos.get(productoId) ?? 0;
}

/**
 * Todos los saldos del promotor (incluye ceros, a diferencia de
 * `listarInventarioPromotor`) — para el conteo de cierre, que necesita
 * poder contradecir el teórico incluso en productos que ya llegaron a 0.
 */
export async function obtenerSaldosPromotor(
  db: SQLiteDatabase,
  promotorId: string
): Promise<Map<string, number>> {
  const ubicacion = await buscarUbicacionPromotor(db, promotorId);
  if (!ubicacion) return new Map();
  return calcularSaldosUbicacion(db, ubicacion);
}

/** Stock de bodega, solo lo que tiene saldo > 0 — para la pantalla de Inventario. */
export async function listarInventarioBodega(db: SQLiteDatabase): Promise<ItemInventario[]> {
  const ubicacion = await buscarUbicacionBodega(db);
  if (!ubicacion) return [];
  return listarInventarioUbicacion(db, ubicacion);
}

/**
 * Todos los saldos de bodega (incluye ceros, a diferencia de
 * `listarInventarioBodega`) — para topar el cargue producto por producto,
 * incluso los que hoy no tienen nada.
 */
export async function obtenerSaldosBodega(db: SQLiteDatabase): Promise<Map<string, number>> {
  const ubicacion = await buscarUbicacionBodega(db);
  if (!ubicacion) return new Map();
  return calcularSaldosUbicacion(db, ubicacion);
}

/**
 * Saldo por lote, sin importar en qué ubicación estén sus unidades — para
 * detectar lotes con saldo > 0 próximos a vencer (ver src/db/notificaciones.ts).
 */
export async function obtenerSaldosPorLote(db: SQLiteDatabase): Promise<Map<string, number>> {
  const filas = await db.getAllAsync<{
    lote_id: string | null;
    cantidad: number;
    ubicacion_origen_id: string | null;
    ubicacion_destino_id: string | null;
  }>(
    `SELECT lote_id, cantidad, ubicacion_origen_id, ubicacion_destino_id
     FROM movimientos
     WHERE lote_id IS NOT NULL`
  );
  return calcularSaldosPorLote(
    filas.map((fila) => ({
      loteId: fila.lote_id,
      cantidad: fila.cantidad,
      ubicacionOrigenId: fila.ubicacion_origen_id,
      ubicacionDestinoId: fila.ubicacion_destino_id,
    }))
  );
}

export interface MovimientoBodegaDetallado {
  id: string;
  tipo: TipoMovimiento;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  /** true si bodega es el destino (entrada, ej. COMPRA_PROVEEDOR); false si es el origen (salida, ej. RECARGA). */
  entrada: boolean;
  tsCliente: string;
}

/**
 * Movimientos de bodega dentro de un rango, con tipo/fecha/producto — a
 * diferencia de `listarMovimientosPorUbicacion` (solo trae lo mínimo para
 * calcular saldo, sin fecha ni tipo, R1). Usada por la pantalla de detalle
 * de "Saldo en bodega" del Dashboard para el listado crudo y la serie
 * temporal de entradas/salidas.
 */
export async function obtenerMovimientosBodegaDetallados(
  db: SQLiteDatabase,
  rango: { desde: string; hasta: string }
): Promise<MovimientoBodegaDetallado[]> {
  const ubicacion = await buscarUbicacionBodega(db);
  if (!ubicacion) return [];

  const filas = await db.getAllAsync<{
    id: string;
    tipo: TipoMovimiento;
    producto_id: string;
    producto_nombre: string;
    cantidad: number;
    ubicacion_destino_id: string | null;
    ts_cliente: string;
  }>(
    `SELECT m.id, m.tipo, m.producto_id, p.nombre as producto_nombre, m.cantidad,
            m.ubicacion_destino_id, m.ts_cliente
     FROM movimientos m
     JOIN productos p ON p.id = m.producto_id
     WHERE (m.ubicacion_origen_id = ? OR m.ubicacion_destino_id = ?)
       AND m.ts_cliente BETWEEN ? AND ?
     ORDER BY m.ts_cliente DESC`,
    [ubicacion, ubicacion, rango.desde, rango.hasta]
  );

  return filas.map((fila) => ({
    id: fila.id,
    tipo: fila.tipo,
    productoId: fila.producto_id,
    productoNombre: fila.producto_nombre,
    cantidad: fila.cantidad,
    entrada: fila.ubicacion_destino_id === ubicacion,
    tsCliente: fila.ts_cliente,
  }));
}
