import type { SQLiteDatabase } from 'expo-sqlite';

import { obtenerSaldosBodega } from './inventario';
import { registrarMovimiento } from './movimientos';
import { obtenerOCrearUbicacionBodega, obtenerOCrearUbicacionPromotor } from './ubicaciones';

interface ItemCargue {
  productoId: string;
  cantidad: number;
}

/**
 * El cargue nunca puede superar lo que hay en bodega — ver
 * docs/03-decisiones/0003-stock-de-bodega.md. La UI ya tope los contadores,
 * esto es la validación de verdad: si algo se cuela, no se escribe nada.
 */
export class StockInsuficienteError extends Error {
  constructor() {
    super('No hay suficiente stock en bodega para completar este cargue.');
    this.name = 'StockInsuficienteError';
  }
}

/**
 * El admin le asigna cargue a un promotor: una RECARGA por producto, con
 * origen real en la bodega — el saldo de bodega baja, el del promotor sube.
 */
export async function registrarCargue(
  db: SQLiteDatabase,
  datos: {
    promotorId: string;
    promotorNombre: string;
    adminId: string;
    items: ItemCargue[];
  },
  dispositivoId: string
): Promise<void> {
  const itemsConCantidad = datos.items.filter((item) => item.cantidad > 0);
  if (itemsConCantidad.length === 0) return;

  const saldosBodega = await obtenerSaldosBodega(db);
  for (const item of itemsConCantidad) {
    if (item.cantidad > (saldosBodega.get(item.productoId) ?? 0)) {
      throw new StockInsuficienteError();
    }
  }

  await db.withTransactionAsync(async () => {
    const ubicacionBodega = await obtenerOCrearUbicacionBodega(db, dispositivoId);
    const ubicacionPromotor = await obtenerOCrearUbicacionPromotor(
      db,
      datos.promotorId,
      datos.promotorNombre,
      dispositivoId
    );

    for (const item of itemsConCantidad) {
      await registrarMovimiento(
        db,
        {
          tipo: 'RECARGA',
          productoId: item.productoId,
          cantidad: item.cantidad,
          ubicacionOrigenId: ubicacionBodega,
          ubicacionDestinoId: ubicacionPromotor,
          usuarioId: datos.adminId,
        },
        dispositivoId
      );
    }
  });
}
