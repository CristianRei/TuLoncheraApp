import type { SQLiteDatabase } from 'expo-sqlite';

import { crearLote } from './lotes';
import { registrarMovimiento } from './movimientos';
import { obtenerOCrearUbicacionBodega } from './ubicaciones';

interface ItemEntrada {
  productoId: string;
  cantidad: number;
  /** ISO 8601 (solo fecha). Si no viene, el producto entra sin lote. */
  fechaVencimiento?: string | null;
}

/**
 * Entrada de inventario a bodega ("ingresar pedido"): un COMPRA_PROVEEDOR
 * por producto. Es la única forma en que aparece stock de bodega — el
 * cargue (ver src/db/cargue.ts) solo puede salir de lo que entró por aquí.
 * La usan tanto Bodega como Admin (src/ui/PantallaIngresarPedido.tsx).
 */
export async function registrarEntradaBodega(
  db: SQLiteDatabase,
  datos: { usuarioId: string; items: ItemEntrada[] },
  dispositivoId: string
): Promise<void> {
  const itemsConCantidad = datos.items.filter((item) => item.cantidad > 0);
  if (itemsConCantidad.length === 0) return;

  await db.withTransactionAsync(async () => {
    const ubicacionBodega = await obtenerOCrearUbicacionBodega(db, dispositivoId);

    for (const item of itemsConCantidad) {
      const loteId = item.fechaVencimiento
        ? await crearLote(db, item.productoId, item.fechaVencimiento, dispositivoId)
        : null;

      await registrarMovimiento(
        db,
        {
          tipo: 'COMPRA_PROVEEDOR',
          productoId: item.productoId,
          loteId,
          cantidad: item.cantidad,
          ubicacionOrigenId: null,
          ubicacionDestinoId: ubicacionBodega,
          usuarioId: datos.usuarioId,
        },
        dispositivoId
      );
    }
  });
}
