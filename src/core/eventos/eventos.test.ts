import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calcularOcurrencias, DemasiadasOcurrenciasError, MAX_OCURRENCIAS_SERIE } from './index.ts';

test('cada 15 días desde 2026-01-01 hasta 2026-03-01', () => {
  const ocurrencias = calcularOcurrencias('DIAS', 15, '2026-01-01', '2026-03-01');
  assert.deepEqual(ocurrencias, ['2026-01-01', '2026-01-16', '2026-01-31', '2026-02-15']);
});

test('cada mes desde 2026-01-31 respeta el fin de mes corto', () => {
  const ocurrencias = calcularOcurrencias('MESES', 1, '2026-01-31', '2026-04-30');
  // setUTCMonth normaliza: 31 ene + 1 mes -> 3 marzo (feb no tiene 31), etc.
  assert.equal(ocurrencias[0], '2026-01-31');
  assert.ok(ocurrencias.every((f) => f >= '2026-01-31' && f <= '2026-04-30'));
});

test('un solo día cuando desde === hasta', () => {
  assert.deepEqual(calcularOcurrencias('SEMANAS', 2, '2026-05-01', '2026-05-01'), ['2026-05-01']);
});

test('intervalo debe ser positivo', () => {
  assert.throws(() => calcularOcurrencias('DIAS', 0, '2026-01-01', '2026-02-01'));
  assert.throws(() => calcularOcurrencias('DIAS', -1, '2026-01-01', '2026-02-01'));
  assert.throws(() => calcularOcurrencias('DIAS', 1.5, '2026-01-01', '2026-02-01'));
});

test('fecha límite anterior a la fecha de inicio falla', () => {
  assert.throws(() => calcularOcurrencias('DIAS', 1, '2026-02-01', '2026-01-01'));
});

test('tope duro de ocurrencias generadas', () => {
  assert.throws(
    () => calcularOcurrencias('DIAS', 1, '2026-01-01', '2027-01-01'),
    DemasiadasOcurrenciasError
  );
});

test('propiedad: cada ocurrencia respeta el intervalo exacto en días', () => {
  const ocurrencias = calcularOcurrencias('DIAS', 7, '2026-01-01', '2026-06-01');
  for (let i = 1; i < ocurrencias.length; i++) {
    const anterior = new Date(`${ocurrencias[i - 1]}T00:00:00.000Z`).getTime();
    const actual = new Date(`${ocurrencias[i]}T00:00:00.000Z`).getTime();
    assert.equal((actual - anterior) / (1000 * 60 * 60 * 24), 7);
  }
  assert.ok(ocurrencias.length <= MAX_OCURRENCIAS_SERIE);
});

test('propiedad: nunca excede la fecha límite', () => {
  const ocurrencias = calcularOcurrencias('SEMANAS', 3, '2026-01-01', '2026-12-31');
  assert.ok(ocurrencias.every((f) => f <= '2026-12-31'));
});
