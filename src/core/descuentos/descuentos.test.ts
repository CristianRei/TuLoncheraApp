import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aplicarDescuento, elegirMayorDescuento } from './index.ts';

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

test('elegirMayorDescuento: entre varias reglas gana la que más descuenta, nunca se suman', () => {
  const diez = { tipo: 'PORCENTAJE' as const, valor: 10, id: 'diez' };
  const quince = { tipo: 'PORCENTAJE' as const, valor: 15, id: 'quince' };
  assert.equal(elegirMayorDescuento(10000, [diez, quince])?.id, 'quince');
  assert.equal(elegirMayorDescuento(10000, [quince, diez])?.id, 'quince');
});

test('elegirMayorDescuento: compara en pesos, así un porcentaje puede ganarle o perder contra un monto fijo', () => {
  const diezPorciento = { tipo: 'PORCENTAJE' as const, valor: 10, id: 'porcentaje' };
  const quinientos = { tipo: 'MONTO_FIJO' as const, valor: 500, id: 'fijo' };
  assert.equal(elegirMayorDescuento(10000, [quinientos, diezPorciento])?.id, 'porcentaje'); // $1.000 > $500
  assert.equal(elegirMayorDescuento(3000, [diezPorciento, quinientos])?.id, 'fijo'); // $300 < $500
});

test('elegirMayorDescuento: sin reglas, o reglas que no descuentan nada, devuelve null', () => {
  assert.equal(elegirMayorDescuento(10000, []), null);
  assert.equal(elegirMayorDescuento(10000, [{ tipo: 'PORCENTAJE' as const, valor: 0 }]), null);
});

test('elegirMayorDescuento: en empate gana la primera (quien llama ordena de la más reciente a la más vieja)', () => {
  const reciente = { tipo: 'MONTO_FIJO' as const, valor: 1000, id: 'reciente' };
  const vieja = { tipo: 'PORCENTAJE' as const, valor: 10, id: 'vieja' };
  assert.equal(elegirMayorDescuento(10000, [reciente, vieja])?.id, 'reciente');
});
