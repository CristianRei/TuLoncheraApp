import assert from 'node:assert/strict';
import { test } from 'node:test';

import { modoPinParaRol, pinDesdeCedula, pinDesdeDescarga, pinManualValido, pinParaSincronizar } from './index.ts';

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

test('pinParaSincronizar: nunca sube el PIN derivado de cédula, se puede recalcular remoto', () => {
  assert.equal(pinParaSincronizar('PROMOTOR', '1234567890', '7890'), null);
  assert.equal(pinParaSincronizar('BODEGA', '1234567890', '7890'), null);
});

test('pinParaSincronizar: sí sube el PIN si es un override de colisión (no coincide con el derivado)', () => {
  assert.equal(pinParaSincronizar('PROMOTOR', '1234567890', '9999'), '9999');
});

test('pinParaSincronizar: ADMIN siempre sube su PIN manual (no es derivable)', () => {
  assert.equal(pinParaSincronizar('ADMIN', null, '000000'), '000000');
});

test('pinParaSincronizar: sin PIN o persona desactivada, no hay nada que subir', () => {
  assert.equal(pinParaSincronizar('PROMOTOR', '1234567890', null), null);
});

test('pinDesdeDescarga: si no viajó PIN, lo deriva de la cédula para roles DESDE_CEDULA', () => {
  assert.equal(pinDesdeDescarga('PROMOTOR', '1234567890', null), '7890');
  assert.equal(pinDesdeDescarga('CONDUCTOR', '1234567890', null), '7890');
});

test('pinDesdeDescarga: si sí viajó PIN (ADMIN o colisión), lo usa tal cual', () => {
  assert.equal(pinDesdeDescarga('ADMIN', null, '000000'), '000000');
  assert.equal(pinDesdeDescarga('PROMOTOR', '1234567890', '9999'), '9999');
});

test('pinDesdeDescarga: sin PIN remoto ni cédula, no hay PIN que asignar', () => {
  assert.equal(pinDesdeDescarga('PROMOTOR', null, null), null);
});
