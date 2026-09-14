import type { SQLiteDatabase } from 'expo-sqlite';

import { registrarMovimiento } from './movimientos';
import { obtenerOCrearUbicacionPromotor } from './ubicaciones';

interface ItemCargue {
  productoId: string;
  cantidad: number;
}

/**
 * El admin le asigna cargue a un promotor: una RECARGA por producto. Origen
 * NULL a propósito — ver docs/03-decisiones/0002-ventas-sin-evento.md (no
 * se rastrea todavía el stock propio de la bodega).
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

  await db.withTransactionAsync(async () => {
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
          ubicacionOrigenId: null,
          ubicacionDestinoId: ubicacionPromotor,
          usuarioId: datos.adminId,
        },
        dispositivoId
      );
    }
  });
}
