/**
 * Cálculo de saldos. TypeScript puro, sin Expo — ver CLAUDE.md sección 6.
 *
 * R1: el saldo nunca es una columna, siempre una suma sobre `movimientos`.
 * Esta función es esa suma. Es conmutativa por construcción: el resultado
 * no depende del orden en que lleguen los movimientos (ver
 * inventario.test.ts, CLAUDE.md sección 9.4).
 */

export interface MovimientoParaSaldo {
  productoId: string;
  cantidad: number;
  ubicacionOrigenId: string | null;
  ubicacionDestinoId: string | null;
}

export interface MovimientoParaSaldoLote {
  loteId: string | null;
  cantidad: number;
  ubicacionOrigenId: string | null;
  ubicacionDestinoId: string | null;
}

export function calcularSaldosPorProducto(
  movimientos: MovimientoParaSaldo[],
  ubicacionId: string
): Map<string, number> {
  const saldos = new Map<string, number>();

  for (const movimiento of movimientos) {
    if (movimiento.ubicacionDestinoId === ubicacionId) {
      saldos.set(
        movimiento.productoId,
        (saldos.get(movimiento.productoId) ?? 0) + movimiento.cantidad
      );
    }
    if (movimiento.ubicacionOrigenId === ubicacionId) {
      saldos.set(
        movimiento.productoId,
        (saldos.get(movimiento.productoId) ?? 0) - movimiento.cantidad
      );
    }
  }

  return saldos;
}

/**
 * Saldo total por lote, sin importar en qué ubicación esté cada unidad —
 * un lote se agota independientemente de si sus unidades están en bodega o
 * repartidas entre promotores. Mismo principio de R1 que
 * `calcularSaldosPorProducto`: nunca una columna, siempre una suma sobre
 * `movimientos`. Movimientos sin `loteId` (producto sin fecha de
 * vencimiento conocida) se ignoran — no hay lote que vencer.
 */
export function calcularSaldosPorLote(movimientos: MovimientoParaSaldoLote[]): Map<string, number> {
  const saldos = new Map<string, number>();

  for (const movimiento of movimientos) {
    if (!movimiento.loteId) continue;
    if (movimiento.ubicacionDestinoId) {
      saldos.set(movimiento.loteId, (saldos.get(movimiento.loteId) ?? 0) + movimiento.cantidad);
    }
    if (movimiento.ubicacionOrigenId) {
      saldos.set(movimiento.loteId, (saldos.get(movimiento.loteId) ?? 0) - movimiento.cantidad);
    }
  }

  return saldos;
}
