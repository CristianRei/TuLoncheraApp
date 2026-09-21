import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calcularCorrelacionPearson,
  calcularCrucePuntoPromotorProducto,
  calcularDispersionPromotor,
  calcularMapaCalorPuntoProducto,
  calcularMetodoPagoPorPromotor,
  calcularMetodoPagoPorPunto,
  calcularRendimientoPorPromotor,
  calcularRepetibilidadPorPunto,
  calcularVentasPorDiaSemana,
  calcularVentasPorTemporada,
  interpretarFuerzaPearson,
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

let contadorVenta = 0;

function linea(parcial: Partial<LineaVentaConContexto> & { eventoFecha: string }): LineaVentaConContexto {
  contadorVenta += 1;
  return {
    puntoId: PUNTO_NORTE,
    puntoNombre: 'Punto Norte',
    promotorId: PROMOTOR_A,
    promotorNombre: 'Promotor A',
    productoId: PRODUCTO_X,
    productoNombre: 'Producto X',
    cantidad: 1,
    totalLinea: 1000,
    metodoPago: 'EFECTIVO',
    ventaId: `venta-${contadorVenta}`,
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

test('calcularCorrelacionPearson: correlación perfecta positiva da r = 1', () => {
  const pares: [number, number][] = [
    [1, 2],
    [2, 4],
    [3, 6],
    [4, 8],
  ];
  const r = calcularCorrelacionPearson(pares);
  assert.ok(r !== null);
  assert.ok(Math.abs(r! - 1) < 1e-9);
});

test('calcularCorrelacionPearson: correlación perfecta negativa da r = -1', () => {
  const pares: [number, number][] = [
    [1, 8],
    [2, 6],
    [3, 4],
    [4, 2],
  ];
  const r = calcularCorrelacionPearson(pares);
  assert.ok(r !== null);
  assert.ok(Math.abs(r! + 1) < 1e-9);
});

test('calcularCorrelacionPearson: null con menos de 3 pares', () => {
  assert.equal(calcularCorrelacionPearson([[1, 2]]), null);
  assert.equal(calcularCorrelacionPearson([[1, 2], [2, 3]]), null);
});

test('calcularCorrelacionPearson: null cuando una variable no varía', () => {
  const pares: [number, number][] = [
    [5, 1],
    [5, 2],
    [5, 3],
  ];
  assert.equal(calcularCorrelacionPearson(pares), null);
});

test('interpretarFuerzaPearson: clasifica por umbral de |r|', () => {
  assert.equal(interpretarFuerzaPearson(0.1), 'débil o nula');
  assert.equal(interpretarFuerzaPearson(-0.1), 'débil o nula');
  assert.equal(interpretarFuerzaPearson(0.3), 'moderada');
  assert.equal(interpretarFuerzaPearson(0.5), 'moderada');
  assert.equal(interpretarFuerzaPearson(0.61), 'fuerte');
  assert.equal(interpretarFuerzaPearson(-0.9), 'fuerte');
});

test('calcularDispersionPromotor: un punto por promotor con su ticket promedio por evento', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ promotorId: PROMOTOR_A, promotorNombre: 'A', eventoFecha: '2026-01-01', totalLinea: 1000 }),
    linea({ promotorId: PROMOTOR_A, promotorNombre: 'A', eventoFecha: '2026-01-08', totalLinea: 3000 }),
    linea({ promotorId: PROMOTOR_B, promotorNombre: 'B', eventoFecha: '2026-01-01', totalLinea: 500 }),
  ];

  const { puntos } = calcularDispersionPromotor(lineas);
  const a = puntos.find((p) => p.promotorId === PROMOTOR_A)!;
  const b = puntos.find((p) => p.promotorId === PROMOTOR_B)!;

  assert.equal(a.eventosTrabajados, 2);
  assert.equal(a.ticketPromedioPorEvento, 2000);
  assert.equal(b.eventosTrabajados, 1);
  assert.equal(b.ticketPromedioPorEvento, 500);
});

test('calcularVentasPorDiaSemana: siempre devuelve los 7 días, incluso sin ventas', () => {
  const lineas: LineaVentaConContexto[] = [
    // 2026-01-05 es lunes
    linea({ eventoFecha: '2026-01-05', totalLinea: 1000 }),
  ];

  const resultado = calcularVentasPorDiaSemana(lineas);

  assert.equal(resultado.length, 7);
  const lunes = resultado.find((d) => d.diaIso === 1)!;
  assert.equal(lunes.totalVendido, 1000);
  assert.equal(lunes.apariciones, 1);
  const martes = resultado.find((d) => d.diaIso === 2)!;
  assert.equal(martes.totalVendido, 0);
});

test('propiedad: calcularVentasPorDiaSemana no depende del orden de las líneas de entrada', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ eventoFecha: '2026-01-05', totalLinea: 1000 }), // lunes
    linea({ eventoFecha: '2026-01-06', totalLinea: 2000 }), // martes
    linea({ eventoFecha: '2026-01-12', totalLinea: 500 }), // lunes
  ];

  const original = calcularVentasPorDiaSemana(lineas);

  for (let intento = 0; intento < 30; intento++) {
    const mezclado = calcularVentasPorDiaSemana(mezclar(lineas));
    assert.deepEqual(mezclado, original);
  }
});

test('calcularVentasPorTemporada: separa temporada nombrada de temporada normal', () => {
  const temporadas = [{ nombre: 'Navidad', desde: '2026-12-01', hasta: '2026-12-31' }];
  const lineas: LineaVentaConContexto[] = [
    linea({ eventoFecha: '2026-12-10', totalLinea: 5000 }),
    linea({ eventoFecha: '2026-06-01', totalLinea: 1000 }),
  ];

  const resultado = calcularVentasPorTemporada(lineas, temporadas);
  const navidad = resultado.find((t) => t.nombre === 'Navidad')!;
  const normal = resultado.find((t) => t.nombre === 'Temporada normal')!;

  assert.equal(navidad.totalVendido, 5000);
  assert.equal(normal.totalVendido, 1000);
});

test('calcularMapaCalorPuntoProducto: suma unidades por combinación punto×producto', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', productoId: PRODUCTO_X, eventoFecha: '2026-01-01', cantidad: 5 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', productoId: PRODUCTO_X, eventoFecha: '2026-01-08', cantidad: 3 }),
    linea({ puntoId: PUNTO_SUR, puntoNombre: 'Sur', productoId: PRODUCTO_Y, eventoFecha: '2026-01-01', cantidad: 7 }),
  ];

  const mapa = calcularMapaCalorPuntoProducto(lineas);
  const celda = mapa.celdas.find((c) => c.puntoId === PUNTO_NORTE && c.productoId === PRODUCTO_X)!;

  assert.equal(celda.unidades, 8);
  assert.equal(mapa.puntosOmitidos, 0);
  assert.equal(mapa.productosOmitidos, 0);
});

test('propiedad: calcularMapaCalorPuntoProducto no depende del orden de las líneas de entrada', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', productoId: PRODUCTO_X, eventoFecha: '2026-01-01', cantidad: 10 }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', productoId: PRODUCTO_Y, eventoFecha: '2026-01-01', cantidad: 2 }),
    linea({ puntoId: PUNTO_SUR, puntoNombre: 'Sur', productoId: PRODUCTO_X, eventoFecha: '2026-01-02', cantidad: 4 }),
  ];

  const original = calcularMapaCalorPuntoProducto(lineas);

  for (let intento = 0; intento < 30; intento++) {
    const mezclado = calcularMapaCalorPuntoProducto(mezclar(lineas));
    assert.deepEqual(
      [...mezclado.celdas].sort((a, b) => `${a.puntoId}${a.productoId}`.localeCompare(`${b.puntoId}${b.productoId}`)),
      [...original.celdas].sort((a, b) => `${a.puntoId}${a.productoId}`.localeCompare(`${b.puntoId}${b.productoId}`))
    );
  }
});

test('calcularMetodoPagoPorPunto: reparte el % entre los métodos usados', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ puntoId: PUNTO_NORTE, eventoFecha: '2026-01-01', metodoPago: 'EFECTIVO', ventaId: 'v1' }),
    linea({ puntoId: PUNTO_NORTE, eventoFecha: '2026-01-01', metodoPago: 'EFECTIVO', ventaId: 'v2' }),
    linea({ puntoId: PUNTO_NORTE, eventoFecha: '2026-01-01', metodoPago: 'TRANSFERENCIA', ventaId: 'v3' }),
    linea({ puntoId: PUNTO_NORTE, eventoFecha: '2026-01-01', metodoPago: 'TRANSFERENCIA', ventaId: 'v4' }),
  ];

  const [resultado] = calcularMetodoPagoPorPunto(lineas);

  assert.equal(resultado.totalVentas, 4);
  const efectivo = resultado.porMetodo.find((m) => m.metodoPago === 'EFECTIVO')!;
  const transferencia = resultado.porMetodo.find((m) => m.metodoPago === 'TRANSFERENCIA')!;
  assert.equal(efectivo.cantidad, 2);
  assert.equal(efectivo.pct, 50);
  assert.equal(transferencia.cantidad, 2);
  assert.equal(transferencia.pct, 50);
});

test('calcularMetodoPagoPorPunto: varias líneas de la misma venta cuentan como una sola venta', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ puntoId: PUNTO_NORTE, eventoFecha: '2026-01-01', productoId: PRODUCTO_X, metodoPago: 'LIBRANZA', ventaId: 'v1' }),
    linea({ puntoId: PUNTO_NORTE, eventoFecha: '2026-01-01', productoId: PRODUCTO_Y, metodoPago: 'LIBRANZA', ventaId: 'v1' }),
  ];

  const [resultado] = calcularMetodoPagoPorPunto(lineas);

  assert.equal(resultado.totalVentas, 1);
  assert.equal(resultado.porMetodo[0].cantidad, 1);
});

test('calcularMetodoPagoPorPromotor: agrupa por promotor en vez de punto', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ promotorId: PROMOTOR_A, promotorNombre: 'A', eventoFecha: '2026-01-01', metodoPago: 'EFECTIVO', ventaId: 'v1' }),
    linea({ promotorId: PROMOTOR_B, promotorNombre: 'B', eventoFecha: '2026-01-01', metodoPago: 'TRANSFERENCIA', ventaId: 'v2' }),
  ];

  const resultado = calcularMetodoPagoPorPromotor(lineas);
  const a = resultado.find((r) => r.id === PROMOTOR_A)!;
  const b = resultado.find((r) => r.id === PROMOTOR_B)!;

  assert.equal(a.porMetodo[0].metodoPago, 'EFECTIVO');
  assert.equal(b.porMetodo[0].metodoPago, 'TRANSFERENCIA');
});

test('propiedad: calcularMetodoPagoPorPunto no depende del orden de las líneas de entrada', () => {
  const lineas: LineaVentaConContexto[] = [
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', eventoFecha: '2026-01-01', metodoPago: 'EFECTIVO', ventaId: 'v1' }),
    linea({ puntoId: PUNTO_NORTE, puntoNombre: 'Norte', eventoFecha: '2026-01-01', metodoPago: 'TRANSFERENCIA', ventaId: 'v2' }),
    linea({ puntoId: PUNTO_SUR, puntoNombre: 'Sur', eventoFecha: '2026-01-02', metodoPago: 'LIBRANZA', ventaId: 'v3' }),
  ];

  const original = calcularMetodoPagoPorPunto(lineas);

  for (let intento = 0; intento < 30; intento++) {
    const mezclado = calcularMetodoPagoPorPunto(mezclar(lineas));
    assert.deepEqual(
      [...mezclado].sort((a, b) => a.id.localeCompare(b.id)),
      [...original].sort((a, b) => a.id.localeCompare(b.id))
    );
  }
});
