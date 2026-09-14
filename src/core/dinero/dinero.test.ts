import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatearPesos, parsearPesos } from './index.ts';

test('formatearPesos separa miles con punto', () => {
  assert.equal(formatearPesos(12500), '$ 12.500');
  assert.equal(formatearPesos(1000000), '$ 1.000.000');
});

test('formatearPesos maneja cero y montos sin miles', () => {
  assert.equal(formatearPesos(0), '$ 0');
  assert.equal(formatearPesos(500), '$ 500');
});

test('formatearPesos antepone signo a negativos sin duplicar el símbolo', () => {
  assert.equal(formatearPesos(-12500), '-$ 12.500');
});

test('formatearPesos redondea decimales antes de formatear', () => {
  assert.equal(formatearPesos(12500.6), '$ 12.501');
  assert.equal(formatearPesos(12500.4), '$ 12.500');
});

test('parsearPesos descarta símbolos y separadores', () => {
  assert.equal(parsearPesos('$ 12.500'), 12500);
  assert.equal(parsearPesos('12500'), 12500);
});

test('parsearPesos trata texto vacío o sin dígitos como cero', () => {
  assert.equal(parsearPesos(''), 0);
  assert.equal(parsearPesos('$ '), 0);
});

test('parsearPesos y formatearPesos son inversos para enteros positivos', () => {
  for (const monto of [0, 500, 12500, 999999, 1000000]) {
    assert.equal(parsearPesos(formatearPesos(monto)), monto);
  }
});
