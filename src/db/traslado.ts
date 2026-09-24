import type { SQLiteDatabase } from 'expo-sqlite';

import { obtenerSaldosPromotor } from './inventario';
import { registrarMovimiento } from './movimientos';
import { encolarSync } from './syncCola';
import { obtenerOCrearUbicacionPromotor } from './ubicaciones';

interface ItemTraslado {
  productoId: string;
  cantidad: number;
}

/**
 * Un traslado nunca puede superar lo que tiene el promotor ORIGEN — mismo
 * espíritu que `StockInsuficienteError` de `src/db/cargue.ts`, reusado aquí
 * porque la UI ya trata ambos casos igual (mensaje de "no hay suficiente").
 */
export class StockInsuficienteError extends Error {
  constructor() {
    super('No hay suficiente stock en el inventario de ese promotor para completar este traslado.');
    this.name = 'StockInsuficienteError';
  }
}

/**
 * Admin traslada inventario de un promotor a otro directamente, sin pasar
 * por bodega: un TRASLADO por producto, con origen real en el promotor que
 * entrega — su saldo baja, el del promotor que recibe sube. Tercera salida
 * del inventario de un promotor junto a VENTA y RETIRO_ADMIN (R4, CLAUDE.md
 * sección 3), exclusiva de administración.
 */
export async function registrarTraslado(
  db: SQLiteDatabase,
  datos: {
    promotorOrigenId: string;
    promotorOrigenNombre: string;
    promotorDestinoId: string;
    promotorDestinoNombre: string;
    adminId: string;
    items: ItemTraslado[];
  },
  dispositivoId: string
): Promise<void> {
  const itemsConCantidad = datos.items.filter((item) => item.cantidad > 0);
  if (itemsConCantidad.length === 0) return;

  const saldosOrigen = await obtenerSaldosPromotor(db, datos.promotorOrigenId);
  for (const item of itemsConCantidad) {
    if (item.cantidad > (saldosOrigen.get(item.productoId) ?? 0)) {
      throw new StockInsuficienteError();
    }
  }

  await db.withTransactionAsync(async () => {
    const ubicacionOrigen = await obtenerOCrearUbicacionPromotor(
      db,
      datos.promotorOrigenId,
      datos.promotorOrigenNombre,
      dispositivoId
    );
    const ubicacionDestino = await obtenerOCrearUbicacionPromotor(
      db,
      datos.promotorDestinoId,
      datos.promotorDestinoNombre,
      dispositivoId
    );

    for (const item of itemsConCantidad) {
      const movimientoId = await registrarMovimiento(
        db,
        {
          tipo: 'TRASLADO',
          productoId: item.productoId,
          cantidad: item.cantidad,
          ubicacionOrigenId: ubicacionOrigen,
          ubicacionDestinoId: ubicacionDestino,
          usuarioId: datos.adminId,
        },
        dispositivoId
      );
      await encolarSync(db, { tabla: 'movimientos', entidadId: movimientoId, tipoTarea: 'FILA' });
    }
  });
}
