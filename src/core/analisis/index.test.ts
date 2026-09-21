import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calcularCrucePuntoPromotorProducto,
  calcularRendimientoPorPromotor,
  calcularRepetibilidadPorPunto,
  type LineaVentaConContexto,
} from './index.ts';

const PUNTO_NORTE = 'punto-norte';
const PUNTO_SUR = 'punto-sur';
const PROMOTOR_A = 'promotor-a';
const PROMOTOR_B = 'promotor-b';
const PRODUCTO_X = 'producto-x';
const PRODUCTO_Y = 'producto-y';
const PRODUCTO_Z = 'producto-z';

function mezclar<T>(items: T[]): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function linea(parcial: Partial<LineaVentaConContexto> & { eventoFecha: string }): LineaVentaConContexto {
  return {
    puntoId: PUNTO_NORTE,
    puntoNombre: 'Punto Norte',
    promotorId: PROMOTOR_A,
    promotorNombre: 'Promotor A',
    productoId: PRODUCTO_X,
    productoNombre: 'Producto X',
    cantidad: 1,
    totalLinea: 1000,
    ...parcial,
  };
}

test('calcularRepetibilidadPorPunto: un producto que aparece en el top-N todas las veces tiene tasa 1', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ eventoFecha: '2026-01-01', productoId: PRODUCTO_X, cantidad: 10 }),
    linea({ eventoFecha: '2026-01-01', productoId: PRODUCTO_Y, cantidad: 1 }),
    linea({ eventoFecha: '2026-01-08', productoId: PRODUCTO_X, cantidad: 10 }),
    linea({ eventoFecha: '2026-01-08', productoId: PRODUCTO_Y, cantidad: 1 }),
    linea({ eventoFecha: '2026-01-15', productoId: PRODUCTO_X, cantidad: 10 }),
  ];

  const [resultado] = calcularRepetibilidadPorPunto(lineas);
  const productoX = resultado.productos.find((p) => p.productoId === PRODUCTO_X)!;

  assert.equal(resultado.totalApariciones, 3);
  assert.equal(resultado.datosInsuficientes, false);
  assert.equal(productoX.apariciones, 3);
  assert.equal(productoX.vecesEnTopN, 3);
  assert.equal(productoX.tasaRepeticion, 1);
});

test('calcularRepetibilidadPorPunto: menos del umbral mínimo se marca como datos insuficientes', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ eventoFecha: '2026-01-01' }),
    linea({ eventoFecha: '2026-01-08' }),
  ];

  const [resultado] = calcularRepetibilidadPorPunto(lineas);

  assert.equal(resultado.datosInsuficientes, true);
  for (const producto of resultado.productos) {
    assert.equal(producto.tendencia, null);
  }
});

test('propiedad: calcularRepetibilidadPorPunto no depende del orden de las líneas de entrada', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', eventoFecha: '2026-01-01', productoId: PRODUCTO_X, cantidad: 20 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', eventoFecha: '2026-01-01', productoId: PRODUCTO_Y, cantidad: 1 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', eventoFecha: '2026-01-08', productoId: PRODUCTO_X, cantidad: 20 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', eventoFecha: '2026-01-08', productoId: PRODUCTO_Z, cantidad: 5 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', eventoFecha: '2026-01-15', productoId: PRODUCTO_X, cantidad: 20 }),
    linea({ puntoId: PUNTO_SUR, puntoNombre: 'Sur', eventoFecha: '2026-01-02', productoId: PRODUCTO_Y, cantidad: 7 }),
    linea({ puntoId: PUNTO_SUR, puntoNombre: 'Sur', eventoFecha: '2026-01-09', productoId: PRODUCTO_Y, cantidad: 7 }),
    linea({ puntoId: PUNTO_SUR, puntoNombre: 'Sur', eventoFecha: '2026-01-16', productoId: PRODUCTO_Y, cantidad: 7 }),
  ];

  const original = calcularRepetibilidadPorPunto(lineas);

  for (let intento = 0; intento < 30; intento++) {
    const mezclado = calcularRepetibilidadPorPunto(mezclar(lineas));

    for (const puntoOriginal of original) {
      const puntoMezclado = mezclado.find((p) => p.puntoId === puntoOriginal.puntoId)!;
      assert.equal(puntoMezclado.totalApariciones, puntoOriginal.totalApariciones);
      assert.equal(puntoMezclado.datosInsuficientes, puntoOriginal.datosInsuficientes);

      for (const productoOriginal of puntoOriginal.productos) {
        const productoMezclado = puntoMezclado.productos.find((p) => p.productoId === productoOriginal.productoId)!;
        assert.equal(productoMezclado.tasaRepeticion, productoOriginal.tasaRepeticion);
        assert.equal(productoMezclado.tendencia, productoOriginal.tendencia);
      }
    }
  }
});

test('calcularRendimientoPorPromotor: reporta desviación cuando un promotor vende muy por encima del promedio', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ promotorId: PROMOTOR_A, promotorNombre: 'A', eventoFecha: '2026-01-01', productoId: PRODUCTO_X, cantidad: 50 }),
    linea({ promotorId: PROMOTOR_A, promotorNombre: 'A', eventoFecha: '2026-01-08', productoId: PRODUCTO_X, cantidad: 50 }),
    linea({ promotorId: PROMOTOR_B, promotorNombre: 'B', eventoFecha: '2026-01-01', productoId: PRODUCTO_X, cantidad: 5 }),
    linea({ promotorId: PROMOTOR_B, promotorNombre: 'B', eventoFecha: '2026-01-08', productoId: PRODUCTO_X, cantidad: 5 }),
  ];

  const resultado = calcularRendimientoPorPromotor(lineas);
  const promotorA = resultado.find((p) => p.promotorId === PROMOTOR_A)!;

  assert.ok(promotorA.mixDestacado.length > 0);
  assert.ok(promotorA.mixDestacado[0].desviacionPct > 0);
});

test('propiedad: calcularRendimientoPorPromotor no depende del orden de las líneas de entrada', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ promotorId: PROMOTOR_A, promotorNombre: 'A', eventoFecha: '2026-01-01', productoId: PRODUCTO_X, cantidad: 30, totalLinea: 3000 }),
    linea({ promotorId: PROMOTOR_A, promotorNombre: 'A', eventoFecha: '2026-01-08', productoId: PRODUCTO_Y, cantidad: 4, totalLinea: 4000 }),
    linea({ promotorId: PROMOTOR_B, promotorNombre: 'B', eventoFecha: '2026-01-01', productoId: PRODUCTO_X, cantidad: 3, totalLinea: 300 }),
    linea({ promotorId: PROMOTOR_B, promotorNombre: 'B', eventoFecha: '2026-01-08', productoId: PRODUCTO_Z, cantidad: 8, totalLinea: 800 }),
  ];

  const original = calcularRendimientoPorPromotor(lineas);

  for (let intento = 0; intento < 30; intento++) {
    const mezclado = calcularRendimientoPorPromotor(mezclar(lineas));

    for (const promotorOriginal of original) {
      const promotorMezclado = mezclado.find((p) => p.promotorId === promotorOriginal.promotorId)!;
      assert.equal(promotorMezclado.totalVendido, promotorOriginal.totalVendido);
      assert.equal(promotorMezclado.ticketPromedioPorEvento, promotorOriginal.ticketPromedioPorEvento);
      assert.deepEqual(
        promotorMezclado.mixDestacado.map((m) => m.productoId),
        promotorOriginal.mixDestacado.map((m) => m.productoId)
      );
    }
  }
});

test('calcularCrucePuntoPromotorProducto: ignora combinaciones bajo el umbral mínimo de apariciones', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ puntoId: PUNTO_NORTE, promotorId: PROMOTOR_A, eventoFecha: '2026-01-01', productoId: PRODUCTO_X, cantidad: 50 }),
    linea({ puntoId: PUNTO_NORTE, promotorId: PROMOTOR_B, eventoFecha: '2026-01-01', productoId: PRODUCTO_X, cantidad: 5 }),
  ];

  const hallazgos = calcularCrucePuntoPromotorProducto(lineas);

  assert.equal(hallazgos.length, 0);
});

test('propiedad: calcularCrucePuntoPromotorProducto no depende del orden de las líneas de entrada', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', promotorId: PROMOTOR_A, promotorNombre: 'A', eventoFecha: '2026-01-01', productoId: PRODUCTO_X, cantidad: 40 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', promotorId: PROMOTOR_A, promotorNombre: 'A', eventoFecha: '2026-01-08', productoId: PRODUCTO_X, cantidad: 40 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', promotorId: PROMOTOR_A, promotorNombre: 'A', eventoFecha: '2026-01-15', productoId: PRODUCTO_X, cantidad: 40 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', promotorId: PROMOTOR_B, promotorNombre: 'B', eventoFecha: '2026-01-01', productoId: PRODUCTO_X, cantidad: 4 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', promotorId: PROMOTOR_B, promotorNombre: 'B', eventoFecha: '2026-01-08', productoId: PRODUCTO_X, cantidad: 4 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', promotorId: PROMOTOR_B, promotorNombre: 'B', eventoFecha: '2026-01-15', productoId: PRODUCTO_X, cantidad: 4 }),
  ];

  const original = calcularCrucePuntoPromotorProducto(lineas);
  assert.ok(original.length > 0);

  for (let intento = 0; intento < 30; intento++) {
    const mezclado = calcularCrucePuntoPromotorProducto(mezclar(lineas));
    assert.deepEqual(
      [...mezclado].sort((a, b) => a.promotorId.localeCompare(b.promotorId)),
      [...original].sort((a, b) => a.promotorId.localeCompare(b.promotorId))
    );
  }
});
