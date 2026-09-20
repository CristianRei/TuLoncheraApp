import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aplicarDescuento } from './index.ts';

test('sin descuento devuelve el precio sin cambios', () => {
  assert.equal(aplicarDescuento(10000, null), 10000);
});

test('MONTO_FIJO resta el valor exacto', () => {
  assert.equal(aplicarDescuento(10000, { tipo: 'MONTO_FIJO', valor: 1500 }), 8500);
});

test('MONTO_FIJO nunca deja el precio negativo', () => {
  assert.equal(aplicarDescuento(1000, { tipo: 'MONTO_FIJO', valor: 5000 }), 0);
});

test('PORCENTAJE calcula y redondea a entero', () => {
  assert.equal(aplicarDescuento(10000, { tipo: 'PORCENTAJE', valor: 10 }), 9000);
  assert.equal(aplicarDescuento(999, { tipo: 'PORCENTAJE', valor: 33 }), 669);
});

test('PORCENTAJE de 100 deja el precio en cero', () => {
  assert.equal(aplicarDescuento(10000, { tipo: 'PORCENTAJE', valor: 100 }), 0);
});
