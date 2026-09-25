import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatearHora, formatearRangoHoras, parsearHora } from './index.ts';

test('parsearHora acepta 8, 8:00, 08:00 y 16:30', () => {
  assert.equal(parsearHora('8'), '08:00');
  assert.equal(parsearHora('8:00'), '08:00');
  assert.equal(parsearHora(' 08:00 '), '08:00');
  assert.equal(parsearHora('16:30'), '16:30');
  assert.equal(parsearHora('0'), '00:00');
});

test('parsearHora rechaza horas imposibles o mal escritas', () => {
  for (const malo of ['', '24', '7:60', '8:5', 'ocho', '8.00', '123']) assert.equal(parsearHora(malo), null, malo);
});

test('formatearHora usa a. m. / p. m. con las 12 como p. m.', () => {
  assert.equal(formatearHora('08:00'), '8:00 a. m.');
  assert.equal(formatearHora('16:30'), '4:30 p. m.');
  assert.equal(formatearHora('12:00'), '12:00 p. m.');
  assert.equal(formatearHora('00:15'), '12:15 a. m.');
});

test('formatearRangoHoras une inicio y fin, o null si falta alguno', () => {
  assert.equal(formatearRangoHoras('08:00', '16:00'), '8:00 a. m. – 4:00 p. m.');
  assert.equal(formatearRangoHoras('08:00', null), null);
  assert.equal(formatearRangoHoras(null, null), null);
});
