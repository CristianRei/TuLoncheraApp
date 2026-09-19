import assert from 'node:assert/strict';
import { test } from 'node:test';

import { agruparVentasPorHora, type VentaParaAgrupar } from './index.ts';

function mezclar<T>(items: T[]): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

test('una venta a las 03:00 UTC cae en las 22:00 de Bogotá del día anterior', () => {
  const ventas: VentaParaAgrupar[] = [{ tsCliente: '2026-01-02T03:00:00.000Z', total: 10_000 }];
  const resultado = agruparVentasPorHora(ventas);
  assert.deepEqual(resultado, [{ hora: 22, cantidadVentas: 1, totalVendido: 10_000 }]);
});

test('una venta a mediodía UTC cae en las 07:00 de Bogotá', () => {
  const ventas: VentaParaAgrupar[] = [{ tsCliente: '2026-01-02T12:00:00.000Z', total: 5_000 }];
  const resultado = agruparVentasPorHora(ventas);
  assert.deepEqual(resultado, [{ hora: 7, cantidadVentas: 1, totalVendido: 5_000 }]);
});

test('varias ventas en la misma hora se suman', () => {
  const ventas: VentaParaAgrupar[] = [
    { tsCliente: '2026-01-02T20:00:00.000Z', total: 10_000 },
    { tsCliente: '2026-01-02T20:30:00.000Z', total: 20_000 },
  ];
  const resultado = agruparVentasPorHora(ventas);
  assert.deepEqual(resultado, [{ hora: 15, cantidadVentas: 2, totalVendido: 30_000 }]);
});

test('horas sin ventas no aparecen en el resultado', () => {
  const ventas: VentaParaAgrupar[] = [{ tsCliente: '2026-01-02T20:00:00.000Z', total: 10_000 }];
  const resultado = agruparVentasPorHora(ventas);
  assert.equal(resultado.length, 1);
});

test('propiedad: el orden de entrada no cambia el resultado agrupado', () => {
  const ventas: VentaParaAgrupar[] = [
    { tsCliente: '2026-01-02T13:00:00.000Z', total: 10_000 },
    { tsCliente: '2026-01-02T13:15:00.000Z', total: 5_000 },
    { tsCliente: '2026-01-02T23:00:00.000Z', total: 7_000 },
    { tsCliente: '2026-01-03T02:00:00.000Z', total: 3_000 },
  ];

  const resultadoOriginal = agruparVentasPorHora(ventas);

  for (let intento = 0; intento < 50; intento++) {
    const resultadoMezclado = agruparVentasPorHora(mezclar(ventas));
    assert.deepEqual(resultadoMezclado, resultadoOriginal);
  }
});
