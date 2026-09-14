import type { SQLiteDatabase } from 'expo-sqlite';

import { registrarMovimiento } from './movimientos';
import { obtenerOCrearUbicacionBodega } from './ubicaciones';

interface ItemEntrada {
  productoId: string;
  cantidad: number;
}

/**
 * Entrada de inventario a bodega: un COMPRA_PROVEEDOR por producto. Es la
 * única forma en que aparece stock de bodega — el cargue (ver
 * src/db/cargue.ts) solo puede salir de lo que entró por aquí.
 */
export async function registrarEntradaBodega(
  db: SQLiteDatabase,
  datos: { adminId: string; items: ItemEntrada[] },
  dispositivoId: string
): Promise<void> {
  const itemsConCantidad = datos.items.filter((item) => item.cantidad > 0);
  if (itemsConCantidad.length === 0) return;

  await db.withTransactionAsync(async () => {
    const ubicacionBodega = await obtenerOCrearUbicacionBodega(db, dispositivoId);

    for (const item of itemsConCantidad) {
      await registrarMovimiento(
        db,
        {
          tipo: 'COMPRA_PROVEEDOR',
          productoId: item.productoId,
          cantidad: item.cantidad,
          ubicacionOrigenId: null,
          ubicacionDestinoId: ubicacionBodega,
          usuarioId: datos.adminId,
        },
        dispositivoId
      );
    }
  });
}
