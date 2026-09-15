import type { SQLiteDatabase } from 'expo-sqlite';

import { listarProductos } from './productos';
import { registrarMovimiento } from './movimientos';
import { obtenerOCrearUbicacionBodega, obtenerOCrearUbicacionPromotor } from './ubicaciones';

const MOTIVO_SEED = 'seed-dev';

const SKUS_BODEGA: { sku: string; cantidad: number }[] = [
  { sku: 'TL001', cantidad: 80 },
  { sku: 'TL002', cantidad: 60 },
  { sku: 'TL003', cantidad: 100 },
  { sku: 'TL004', cantidad: 45 },
  { sku: 'TL005', cantidad: 70 },
  { sku: 'TL006', cantidad: 50 },
  { sku: 'TL007', cantidad: 30 },
  { sku: 'TL008', cantidad: 65 },
  { sku: 'TL009', cantidad: 40 },
  { sku: 'TL010', cantidad: 90 },
  { sku: 'TL011', cantidad: 55 },
  { sku: 'TL012', cantidad: 35 },
];

const SKUS_PROMOTOR: { sku: string; cantidad: number }[] = [
  { sku: 'TL001', cantidad: 15 },
  { sku: 'TL002', cantidad: 10 },
  { sku: 'TL003', cantidad: 20 },
  { sku: 'TL004', cantidad: 8 },
  { sku: 'TL005', cantidad: 12 },
  { sku: 'TL010', cantidad: 6 },
];

/**
 * Solo para desarrollo (ver app/_layout.tsx, se llama bajo __DEV__).
 * Puebla bodega y el inventario del promotor de prueba con COMPRA_PROVEEDOR
 * y RECARGA reales sobre el catálogo ya cargado (migración 0005) — nunca
 * inventa productos nuevos. Idempotente: revisa si ya existe un movimiento
 * marcado con MOTIVO_SEED antes de insertar de nuevo.
 */
export async function sembrarInventarioDePrueba(
  db: SQLiteDatabase,
  adminId: string,
  promotorId: string,
  promotorNombre: string,
  dispositivoId: string
): Promise<void> {
  const yaSembrado = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM movimientos WHERE motivo = ? LIMIT 1",
    [MOTIVO_SEED]
  );
  if (yaSembrado) return;

  const productos = await listarProductos(db);
  const productoPorSku = new Map(productos.map((p) => [p.sku, p]));

  const ubicacionBodega = await obtenerOCrearUbicacionBodega(db, dispositivoId);

  for (const { sku, cantidad } of SKUS_BODEGA) {
    const producto = productoPorSku.get(sku);
    if (!producto) continue;
    await registrarMovimiento(
      db,
      {
        tipo: 'COMPRA_PROVEEDOR',
        productoId: producto.id,
        cantidad,
        ubicacionOrigenId: null,
        ubicacionDestinoId: ubicacionBodega,
        usuarioId: adminId,
        motivo: MOTIVO_SEED,
      },
      dispositivoId
    );
  }

  const ubicacionPromotor = await obtenerOCrearUbicacionPromotor(
    db,
    promotorId,
    promotorNombre,
    dispositivoId
  );

  for (const { sku, cantidad } of SKUS_PROMOTOR) {
    const producto = productoPorSku.get(sku);
    if (!producto) continue;
    await registrarMovimiento(
      db,
      {
        tipo: 'RECARGA',
        productoId: producto.id,
        cantidad,
        ubicacionOrigenId: ubicacionBodega,
        ubicacionDestinoId: ubicacionPromotor,
        usuarioId: adminId,
        motivo: MOTIVO_SEED,
      },
      dispositivoId
    );
  }
}
