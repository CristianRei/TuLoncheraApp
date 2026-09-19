import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UMBRAL_BACKOFF,
  UMBRAL_BLOQUEO,
  calcularEsperaSegundos,
  calcularEstadoIntentos,
} from './index.ts';

test('sin fallos suficientes para backoff, la espera es cero', () => {
  assert.equal(calcularEsperaSegundos(0), 0);
  assert.equal(calcularEsperaSegundos(UMBRAL_BACKOFF - 1), 0);
});

test('la escalera de espera sigue 3, 8, 20, 45, 90 y se mantiene en el techo', () => {
  assert.equal(calcularEsperaSegundos(3), 3);
  assert.equal(calcularEsperaSegundos(4), 8);
  assert.equal(calcularEsperaSegundos(5), 20);
  assert.equal(calcularEsperaSegundos(6), 45);
  assert.equal(calcularEsperaSegundos(7), 90);
  assert.equal(calcularEsperaSegundos(100), 90);
});

test('con menos de 3 fallos el estado siempre es NORMAL', () => {
  assert.deepEqual(calcularEstadoIntentos(0, null), { estado: 'NORMAL' });
  assert.deepEqual(calcularEstadoIntentos(2, 0), { estado: 'NORMAL' });
});

test('al llegar a 8 fallos el estado es BLOQUEADO sin importar el tiempo transcurrido', () => {
  assert.deepEqual(calcularEstadoIntentos(UMBRAL_BLOQUEO, 0), { estado: 'BLOQUEADO' });
  assert.deepEqual(calcularEstadoIntentos(UMBRAL_BLOQUEO, 999_999), { estado: 'BLOQUEADO' });
  assert.deepEqual(calcularEstadoIntentos(50, null), { estado: 'BLOQUEADO' });
});

test('entre 3 y 7 fallos, recién ocurrido el intento, el estado es ESPERANDO', () => {
  const estado = calcularEstadoIntentos(3, 0);
  assert.equal(estado.estado, 'ESPERANDO');
  if (estado.estado === 'ESPERANDO') {
    assert.equal(estado.segundosRestantes, 3);
  }
});

test('pasado el tiempo de espera, el estado vuelve a NORMAL sin resetear el contador', () => {
  assert.deepEqual(calcularEstadoIntentos(3, 3_000), { estado: 'NORMAL' });
  assert.deepEqual(calcularEstadoIntentos(3, 10_000), { estado: 'NORMAL' });
});

test('justo en el borde 7/8, un fallo más pasa de ESPERANDO a BLOQUEADO', () => {
  const estado7 = calcularEstadoIntentos(7, 0);
  assert.equal(estado7.estado, 'ESPERANDO');

  const estado8 = calcularEstadoIntentos(8, 0);
  assert.equal(estado8.estado, 'BLOQUEADO');
});
