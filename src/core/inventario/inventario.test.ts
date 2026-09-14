import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calcularSaldosPorProducto, type MovimientoParaSaldo } from './index.ts';

const PROMOTOR = 'ubicacion-promotor-1';
const PRODUCTO_A = 'producto-a';
const PRODUCTO_B = 'producto-b';

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
