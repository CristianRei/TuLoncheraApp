import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  agruparVentasPorDia,
  agruparVentasPorHora,
  calcularProyeccionMes,
  calcularRangoDiaBogota,
  calcularRangoHoyBogota,
  calcularRangoMesBogota,
  diasEnMes,
  mesActualBogota,
  type VentaParaAgrupar,
} from './index.ts';

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

test('agruparVentasPorDia: una venta a las 03:00 UTC cae en el día anterior en Bogotá', () => {
  const resultado = agruparVentasPorDia([{ tsCliente: '2026-01-02T03:00:00.000Z', total: 10_000 }]);
  assert.deepEqual(resultado, [{ fecha: '2026-01-01', cantidadVentas: 1, totalVendido: 10_000 }]);
});

test('agruparVentasPorDia: varias ventas del mismo día en Bogotá se suman', () => {
  const resultado = agruparVentasPorDia([
    { tsCliente: '2026-01-02T14:00:00.000Z', total: 10_000 },
    { tsCliente: '2026-01-02T20:00:00.000Z', total: 5_000 },
  ]);
  assert.deepEqual(resultado, [{ fecha: '2026-01-02', cantidadVentas: 2, totalVendido: 15_000 }]);
});

test('agruparVentasPorDia: resultado ordenado por fecha ascendente', () => {
  const resultado = agruparVentasPorDia([
    { tsCliente: '2026-01-05T14:00:00.000Z', total: 1_000 },
    { tsCliente: '2026-01-03T14:00:00.000Z', total: 2_000 },
    { tsCliente: '2026-01-04T14:00:00.000Z', total: 3_000 },
  ]);
  assert.deepEqual(
    resultado.map((r) => r.fecha),
    ['2026-01-03', '2026-01-04', '2026-01-05']
  );
});

test('calcularRangoDiaBogota: para un día ya pasado, cubre desde medianoche Bogotá hasta medianoche del día siguiente', () => {
  const ahora = new Date('2026-01-20T12:00:00.000Z'); // varios días después del 15
  const rango = calcularRangoDiaBogota('2026-01-15', ahora);
  assert.equal(rango.desde, '2026-01-15T05:00:00.000Z');
  assert.equal(rango.hasta, '2026-01-16T05:00:00.000Z');
});

test('calcularRangoDiaBogota: una venta a las 04:00 UTC del día 16 cae en el rango del día 15 en Bogotá', () => {
  const ahora = new Date('2026-01-20T12:00:00.000Z');
  const rango = calcularRangoDiaBogota('2026-01-15', ahora);
  const tsVenta = '2026-01-16T04:00:00.000Z';
  assert.ok(tsVenta >= rango.desde && tsVenta < rango.hasta);
});

test('calcularRangoDiaBogota: si el día elegido es hoy, "hasta" se topa a la hora actual (mismo criterio que calcularRangoHoyBogota)', () => {
  const ahora = new Date('2026-01-15T22:00:00.000Z'); // 17:00 en Bogotá del mismo 15 de enero
  const rango = calcularRangoDiaBogota('2026-01-15', ahora);
  assert.equal(rango.desde, '2026-01-15T05:00:00.000Z');
  assert.equal(rango.hasta, ahora.toISOString());
});

test('calcularRangoDiaBogota y calcularRangoHoyBogota dan exactamente el mismo rango para el día de hoy', () => {
  const ahora = new Date('2026-01-15T22:00:00.000Z');
  const rangoHoy = calcularRangoHoyBogota(ahora);
  const rangoDiaEspecifico = calcularRangoDiaBogota('2026-01-15', ahora);
  assert.deepEqual(rangoDiaEspecifico, rangoHoy);
});

test('calcularRangoDiaBogota: un día futuro no revienta (desde === hasta, rango vacío)', () => {
  const ahora = new Date('2026-01-10T12:00:00.000Z');
  const rango = calcularRangoDiaBogota('2026-01-15', ahora);
  assert.equal(rango.desde, rango.hasta);
});

test('mesActualBogota: 03:00 UTC del día 1 todavía es el mes anterior en Bogotá', () => {
  assert.equal(mesActualBogota(new Date('2026-02-01T03:00:00.000Z')), '2026-01');
  assert.equal(mesActualBogota(new Date('2026-02-01T12:00:00.000Z')), '2026-02');
});

test('diasEnMes: respeta meses cortos y años bisiestos', () => {
  assert.equal(diasEnMes('2026-02'), 28);
  assert.equal(diasEnMes('2024-02'), 29);
  assert.equal(diasEnMes('2026-04'), 30);
  assert.equal(diasEnMes('2026-01'), 31);
});

test('calcularRangoMesBogota: mes ya cerrado cubre desde el día 1 hasta el día 1 del mes siguiente', () => {
  const rango = calcularRangoMesBogota('2026-01', new Date('2026-03-01T12:00:00.000Z'));
  assert.equal(rango.desde, '2026-01-01T05:00:00.000Z');
  assert.equal(rango.hasta, '2026-02-01T05:00:00.000Z');
});

test('calcularRangoMesBogota: mes en curso topa "hasta" a la hora actual, no al fin de mes', () => {
  const ahora = new Date('2026-01-15T18:00:00.000Z');
  const rango = calcularRangoMesBogota('2026-01', ahora);
  assert.equal(rango.desde, '2026-01-01T05:00:00.000Z');
  assert.equal(rango.hasta, ahora.toISOString());
});

test('calcularProyeccionMes: null si el mes ya cerró', () => {
  assert.equal(calcularProyeccionMes(1_000_000, '2025-12', new Date('2026-01-15T12:00:00.000Z')), null);
});

test('calcularProyeccionMes: extrapola linealmente según el día del mes en Bogotá', () => {
  // 10:00 UTC del día 10 de enero (05:00 offset) sigue siendo el día 10 en Bogotá.
  const ahora = new Date('2026-01-10T10:00:00.000Z');
  const proyeccion = calcularProyeccionMes(300_000, '2026-01', ahora);
  // 300.000 en 10 días => 30.000/día * 31 días de enero = 930.000
  assert.equal(proyeccion, 930_000);
});
