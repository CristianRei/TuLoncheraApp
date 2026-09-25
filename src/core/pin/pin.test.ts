import assert from 'node:assert/strict';
import { test } from 'node:test';

import { modoPinParaRol, pinDesdeCedula, pinManualValido } from './index.ts';

test('modoPinParaRol: ADMIN es manual de 6 dígitos, el resto se deriva de cédula', () => {
  assert.equal(modoPinParaRol('ADMIN'), 'MANUAL_6_DIGITOS');
  assert.equal(modoPinParaRol('PROMOTOR'), 'DESDE_CEDULA');
  assert.equal(modoPinParaRol('CONDUCTOR'), 'DESDE_CEDULA');
  assert.equal(modoPinParaRol('BODEGA'), 'DESDE_CEDULA');
});

test('pinDesdeCedula: toma los últimos 4 dígitos', () => {
  assert.equal(pinDesdeCedula('1234567890'), '7890');
  assert.equal(pinDesdeCedula('1234'), '1234');
});

test('pinDesdeCedula: ignora espacios y guiones escritos por error', () => {
  assert.equal(pinDesdeCedula('123-456-789'), '6789');
  assert.equal(pinDesdeCedula('12 34 56 78'), '5678');
});

test('pinDesdeCedula: cédula más corta que 4 dígitos devuelve lo que haya', () => {
  assert.equal(pinDesdeCedula('12'), '12');
  assert.equal(pinDesdeCedula(''), '');
});

test('pinManualValido: exactamente 6 dígitos', () => {
  assert.equal(pinManualValido('123456'), true);
  assert.equal(pinManualValido('12345'), false); // 5 dígitos
  assert.equal(pinManualValido('1234567'), false); // 7 dígitos
  assert.equal(pinManualValido('12345a'), false); // no numérico
  assert.equal(pinManualValido(''), false);
});

