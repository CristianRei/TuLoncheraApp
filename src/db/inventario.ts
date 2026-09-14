import type { SQLiteDatabase } from 'expo-sqlite';

import { calcularSaldosPorProducto } from '@/core/inventario';
import type { Producto } from '@/core/tipos';

import { listarMovimientosPorUbicacion } from './movimientos';
import { obtenerProducto } from './productos';

export interface ItemInventario {
  producto: Producto;
  saldo: number;
}

/**
 * Inventario actual de un promotor: solo lo que tiene saldo > 0. Si nunca le
 * han asignado cargue, no tiene ubicación propia todavía — inventario vacío.
 */
export async function listarInventarioPromotor(
  db: SQLiteDatabase,
  promotorId: string
): Promise<ItemInventario[]> {
  const ubicacion = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM ubicaciones WHERE tipo = 'PROMOTOR' AND responsable_id = ?",
    [promotorId]
  );
  if (!ubicacion) return [];

  const movimientos = await listarMovimientosPorUbicacion(db, ubicacion.id);
  const saldos = calcularSaldosPorProducto(movimientos, ubicacion.id);

  const items: ItemInventario[] = [];
  for (const [productoId, saldo] of saldos) {
    if (saldo <= 0) continue;
    const producto = await obtenerProducto(db, productoId);
    if (!producto) continue;
    items.push({ producto, saldo });
  }

  items.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
  return items;
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
  const ubicacion = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM ubicaciones WHERE tipo = 'PROMOTOR' AND responsable_id = ?",
    [promotorId]
  );
  if (!ubicacion) return 0;

  const movimientos = await listarMovimientosPorUbicacion(db, ubicacion.id);
  const saldos = calcularSaldosPorProducto(movimientos, ubicacion.id);
  return saldos.get(productoId) ?? 0;
}
