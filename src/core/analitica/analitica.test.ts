import assert from 'node:assert/strict';
import { test } from 'node:test';

import { agruparVentasPorHora, calcularRangoHoyBogota, type VentaParaAgrupar } from './index.ts';

function mezclar<T>(items: T[]): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function venta(tsCliente: string, total: number, promotorId = 'p1', promotorNombre = 'Cristian'): VentaParaAgrupar {
  return { tsCliente, total, promotorId, promotorNombre };
}

test('una venta a las 03:00 UTC cae en las 22:00 de Bogotá del día anterior', () => {
  const ventas = [venta('2026-01-02T03:00:00.000Z', 10_000)];
  const resultado = agruparVentasPorHora(ventas);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].hora, 22);
  assert.equal(resultado[0].cantidadVentas, 1);
  assert.equal(resultado[0].totalVendido, 10_000);
});

test('una venta a mediodía UTC cae en las 07:00 de Bogotá', () => {
  const ventas = [venta('2026-01-02T12:00:00.000Z', 5_000)];
  const resultado = agruparVentasPorHora(ventas);
  assert.equal(resultado[0].hora, 7);
  assert.equal(resultado[0].totalVendido, 5_000);
});

test('varias ventas en la misma hora se suman', () => {
  const ventas = [
    venta('2026-01-02T20:00:00.000Z', 10_000),
    venta('2026-01-02T20:30:00.000Z', 20_000),
  ];
  const resultado = agruparVentasPorHora(ventas);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].hora, 15);
  assert.equal(resultado[0].cantidadVentas, 2);
  assert.equal(resultado[0].totalVendido, 30_000);
});

test('horas sin ventas no aparecen en el resultado', () => {
  const ventas = [venta('2026-01-02T20:00:00.000Z', 10_000)];
  const resultado = agruparVentasPorHora(ventas);
  assert.equal(resultado.length, 1);
});

test('el desglose por promotor de una hora suma por separado y ordena de mayor a menor', () => {
  const ventas = [
    venta('2026-01-02T20:00:00.000Z', 10_000, 'p1', 'Cristian'),
    venta('2026-01-02T20:10:00.000Z', 30_000, 'p2', 'Laura'),
    venta('2026-01-02T20:20:00.000Z', 5_000, 'p1', 'Cristian'),
  ];
  const resultado = agruparVentasPorHora(ventas);
  assert.equal(resultado[0].porPromotor.length, 2);
  assert.deepEqual(resultado[0].porPromotor[0], {
    promotorId: 'p2',
    promotorNombre: 'Laura',
    cantidadVentas: 1,
    totalVendido: 30_000,
  });
  assert.deepEqual(resultado[0].porPromotor[1], {
    promotorId: 'p1',
    promotorNombre: 'Cristian',
    cantidadVentas: 2,
    totalVendido: 15_000,
  });
});

test('propiedad: el orden de entrada no cambia el resultado agrupado', () => {
  const ventas = [
    venta('2026-01-02T13:00:00.000Z', 10_000, 'p1', 'Cristian'),
    venta('2026-01-02T13:15:00.000Z', 5_000, 'p2', 'Laura'),
    venta('2026-01-02T23:00:00.000Z', 7_000, 'p1', 'Cristian'),
    venta('2026-01-03T02:00:00.000Z', 3_000, 'p2', 'Laura'),
  ];

  const resultadoOriginal = agruparVentasPorHora(ventas);

  for (let intento = 0; intento < 50; intento++) {
    const resultadoMezclado = agruparVentasPorHora(mezclar(ventas));
    assert.deepEqual(resultadoMezclado, resultadoOriginal);
  }
});

test('calcularRangoHoyBogota: mediodía UTC cae después de medianoche Bogotá del mismo día', () => {
  const ahora = new Date('2026-01-02T12:00:00.000Z');
  const rango = calcularRangoHoyBogota(ahora);
  assert.equal(rango.desde, '2026-01-02T05:00:00.000Z');
  assert.equal(rango.hasta, ahora.toISOString());
});

test('calcularRangoHoyBogota: 03:00 UTC todavía es "ayer" en Bogotá, desde cae un día antes', () => {
  const ahora = new Date('2026-01-02T03:00:00.000Z');
  const rango = calcularRangoHoyBogota(ahora);
  assert.equal(rango.desde, '2026-01-01T05:00:00.000Z');
});
