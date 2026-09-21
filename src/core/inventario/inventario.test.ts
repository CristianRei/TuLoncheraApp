import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calcularSaldosPorLote,
  calcularSaldosPorProducto,
  type MovimientoParaSaldo,
  type MovimientoParaSaldoLote,
} from './index.ts';

const PROMOTOR = 'ubicacion-promotor-1';
const BODEGA = 'ubicacion-bodega';
const PRODUCTO_A = 'producto-a';
const PRODUCTO_B = 'producto-b';
const LOTE_1 = 'lote-1';
const LOTE_2 = 'lote-2';

function mezclar<T>(items: T[]): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

test('recarga menos venta da el saldo esperado', () => {
  const movimientos: MovimientoParaSaldo[] = [
    { productoId: PRODUCTO_A, cantidad: 10, ubicacionOrigenId: null, ubicacionDestinoId: PROMOTOR },
    { productoId: PRODUCTO_A, cantidad: 3, ubicacionOrigenId: PROMOTOR, ubicacionDestinoId: null },
  ];

  const saldos = calcularSaldosPorProducto(movimientos, PROMOTOR);

  assert.equal(saldos.get(PRODUCTO_A), 7);
});

test('movimientos de otra ubicación no afectan el saldo', () => {
  const movimientos: MovimientoParaSaldo[] = [
    { productoId: PRODUCTO_A, cantidad: 10, ubicacionOrigenId: null, ubicacionDestinoId: PROMOTOR },
    { productoId: PRODUCTO_A, cantidad: 100, ubicacionOrigenId: null, ubicacionDestinoId: 'otra-ubicacion' },
  ];

  const saldos = calcularSaldosPorProducto(movimientos, PROMOTOR);

  assert.equal(saldos.get(PRODUCTO_A), 10);
});

test('propiedad: el saldo no depende del orden de los movimientos', () => {
  const movimientos: MovimientoParaSaldo[] = [
    { productoId: PRODUCTO_A, cantidad: 20, ubicacionOrigenId: null, ubicacionDestinoId: PROMOTOR },
    { productoId: PRODUCTO_A, cantidad: 5, ubicacionOrigenId: PROMOTOR, ubicacionDestinoId: null },
    { productoId: PRODUCTO_A, cantidad: 15, ubicacionOrigenId: null, ubicacionDestinoId: PROMOTOR },
    { productoId: PRODUCTO_A, cantidad: 8, ubicacionOrigenId: PROMOTOR, ubicacionDestinoId: null },
    { productoId: PRODUCTO_B, cantidad: 12, ubicacionOrigenId: null, ubicacionDestinoId: PROMOTOR },
    { productoId: PRODUCTO_B, cantidad: 12, ubicacionOrigenId: PROMOTOR, ubicacionDestinoId: null },
  ];

  const saldoEnOrdenOriginal = calcularSaldosPorProducto(movimientos, PROMOTOR);

  for (let intento = 0; intento < 50; intento++) {
    const saldoMezclado = calcularSaldosPorProducto(mezclar(movimientos), PROMOTOR);
    assert.equal(saldoMezclado.get(PRODUCTO_A), saldoEnOrdenOriginal.get(PRODUCTO_A));
    assert.equal(saldoMezclado.get(PRODUCTO_B), saldoEnOrdenOriginal.get(PRODUCTO_B));
  }

  assert.equal(saldoEnOrdenOriginal.get(PRODUCTO_A), 22);
  assert.equal(saldoEnOrdenOriginal.get(PRODUCTO_B), 0);
});

test('calcularSaldosPorLote: suma sin importar en qué ubicación estén las unidades', () => {
  const movimientos: MovimientoParaSaldoLote[] = [
    { loteId: LOTE_1, cantidad: 20, ubicacionOrigenId: null, ubicacionDestinoId: BODEGA },
    { loteId: LOTE_1, cantidad: 8, ubicacionOrigenId: BODEGA, ubicacionDestinoId: PROMOTOR },
    { loteId: LOTE_1, cantidad: 3, ubicacionOrigenId: PROMOTOR, ubicacionDestinoId: null },
  ];

  const saldos = calcularSaldosPorLote(movimientos);

  // 20 entraron a bodega, 8 salieron de bodega hacia el promotor (bodega neta: 12),
  // de esos 8 el promotor vendió 3 (promotor neto: 5) → total del lote: 17
  assert.equal(saldos.get(LOTE_1), 17);
});

test('calcularSaldosPorLote: ignora movimientos sin loteId (producto sin vencimiento conocido)', () => {
  const movimientos: MovimientoParaSaldoLote[] = [
    { loteId: null, cantidad: 50, ubicacionOrigenId: null, ubicacionDestinoId: BODEGA },
    { loteId: LOTE_2, cantidad: 10, ubicacionOrigenId: null, ubicacionDestinoId: BODEGA },
  ];

  const saldos = calcularSaldosPorLote(movimientos);

  assert.equal(saldos.size, 1);
  assert.equal(saldos.get(LOTE_2), 10);
});
