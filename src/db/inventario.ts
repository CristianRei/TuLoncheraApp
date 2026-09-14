import type { SQLiteDatabase } from 'expo-sqlite';

import { calcularSaldosPorProducto } from '@/core/inventario';
import type { Producto } from '@/core/tipos';

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
