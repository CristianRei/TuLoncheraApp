import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UMBRAL_BACKOFF,
  UMBRAL_BLOQUEO,
  calcularEsperaSegundos,
  calcularEstadoIntentos,
  calcularResumenIntentosPin,
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

test('calcularResumenIntentosPin: cuenta solo fallos posteriores al último desbloqueo o login', () => {
  const resumen = calcularResumenIntentosPin(
    [
      { dispositivoId: 'd1', modo: 'PROMOTOR', tsCliente: '2026-01-01T00:00:00Z' },
      { dispositivoId: 'd1', modo: 'PROMOTOR', tsCliente: '2026-01-02T00:00:00Z' },
      { dispositivoId: 'd1', modo: 'PROMOTOR', tsCliente: '2026-01-03T00:00:00Z' },
    ],
    [{ dispositivoId: 'd1', modo: 'PROMOTOR', tsCliente: '2026-01-02T12:00:00Z' }],
    []
  );
  assert.equal(resumen.length, 1);
  assert.equal(resumen[0].fallosConsecutivos, 1);
  assert.equal(resumen[0].ultimoIntentoTs, '2026-01-03T00:00:00Z');
  assert.equal(resumen[0].bloqueado, false);
});

test('calcularResumenIntentosPin: distingue dispositivo+modo, y marca bloqueado al llegar al umbral', () => {
  const fallosDispositivoA = Array.from({ length: UMBRAL_BLOQUEO }, (_, i) => ({
    dispositivoId: 'a',
    modo: 'PROMOTOR' as const,
    tsCliente: `2026-01-01T00:0${i}:00Z`,
  }));
  const resumen = calcularResumenIntentosPin(
    [
      ...fallosDispositivoA,
      { dispositivoId: 'b', modo: 'BODEGA', tsCliente: '2026-01-01T00:00:00Z' },
    ],
    [],
    []
  );
  assert.equal(resumen.length, 2);
  const filaA = resumen.find((r) => r.dispositivoId === 'a');
  const filaB = resumen.find((r) => r.dispositivoId === 'b');
  assert.equal(filaA?.bloqueado, true);
  assert.equal(filaA?.fallosConsecutivos, UMBRAL_BLOQUEO);
  assert.equal(filaB?.bloqueado, false);
  assert.equal(filaB?.fallosConsecutivos, 1);
});

test('calcularResumenIntentosPin: sin fallos para una combinación, no aparece en el resumen', () => {
  const resumen = calcularResumenIntentosPin(
    [],
    [{ dispositivoId: 'd1', modo: 'PROMOTOR', tsCliente: '2026-01-01T00:00:00Z' }],
    [{ dispositivoId: 'd2', modo: 'ADMIN', tsCliente: '2026-01-01T00:00:00Z' }]
  );
  assert.deepEqual(resumen, []);
});
