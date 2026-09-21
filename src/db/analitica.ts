import type { SQLiteDatabase } from 'expo-sqlite';

import { agruparVentasPorHora, type VentasPorHora } from '@/core/analitica';
import type { MetodoPago, Pesos } from '@/core/tipos';

import { listarInventarioBodega } from './inventario';

export interface TotalPorMetodoPago {
  metodoPago: MetodoPago;
  total: Pesos;
  cantidadVentas: number;
}

export interface ProductoMasVendido {
  productoId: string;
  productoNombre: string;
  unidadesVendidas: number;
  totalVendido: Pesos;
}

export interface ResumenVentasPeriodo {
  totalVendido: Pesos;
  cantidadVentas: number;
  /** Promedio del total de cada venta (`totalVendido / cantidadVentas`). 0 si no hubo ventas. */
  ticketPromedio: Pesos;
  porMetodoPago: TotalPorMetodoPago[];
  topProductos: ProductoMasVendido[];
  porHora: VentasPorHora[];
}

export interface RangoFechas {
  /** ISO 8601 en UTC, límite inferior inclusive. */
  desde: string;
  /** ISO 8601 en UTC, límite superior inclusive. */
  hasta: string;
}

/** Filtros opcionales del dashboard — todos combinables (AND). */
export interface FiltrosVentas {
  promotorId?: string;
  puntoId?: string;
  empresaId?: string;
  categoria?: string;
  marca?: string;
  productoId?: string;
  metodoPago?: MetodoPago;
}

/**
 * Resuelve los IDs de venta (activas, no anuladas) que cumplen el rango y
 * todos los filtros — un solo lugar donde vive la lógica de filtrado, que
 * cada agregación de abajo reutiliza con `v.id IN (...)`. Evita duplicar
 * condiciones WHERE ligeramente distintas en cada query y el riesgo de que
 * se desincronicen.
 */
export async function resolverVentaIdsFiltradas(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas
): Promise<string[]> {
  const condiciones = ['v.anulada = 0', 'v.ts_cliente BETWEEN ? AND ?'];
  const parametros: (string | number)[] = [rango.desde, rango.hasta];
  const requiereProducto = Boolean(filtros.categoria || filtros.marca || filtros.productoId);

  if (filtros.promotorId) {
    condiciones.push('v.promotor_id = ?');
    parametros.push(filtros.promotorId);
  }
  if (filtros.puntoId) {
    condiciones.push('v.punto_id = ?');
    parametros.push(filtros.puntoId);
  }
  if (filtros.empresaId) {
    condiciones.push('pt.empresa_id = ?');
    parametros.push(filtros.empresaId);
  }
  if (filtros.metodoPago) {
    condiciones.push('v.metodo_pago = ?');
    parametros.push(filtros.metodoPago);
  }
  if (filtros.categoria) {
    condiciones.push('pr.categoria = ?');
    parametros.push(filtros.categoria);
  }
  if (filtros.marca) {
    condiciones.push('pr.marca = ?');
    parametros.push(filtros.marca);
  }
  if (filtros.productoId) {
    condiciones.push('pr.id = ?');
    parametros.push(filtros.productoId);
  }

  const filas = await db.getAllAsync<{ id: string }>(
    `SELECT DISTINCT v.id
     FROM ventas v
     LEFT JOIN puntos pt ON pt.id = v.punto_id
     ${requiereProducto ? 'JOIN venta_items vi ON vi.venta_id = v.id JOIN productos pr ON pr.id = vi.producto_id' : ''}
     WHERE ${condiciones.join(' AND ')}`,
    parametros
  );
  return filas.map((fila) => fila.id);
}

export function clausulaIn(ids: string[]): string {
  return ids.map(() => '?').join(', ');
}

/** Productos vendidos dentro de un conjunto ya resuelto de IDs de venta, de mayor a menor unidades. */
async function listarProductosVendidosPorIds(
  db: SQLiteDatabase,
  ids: string[],
  limite?: number
): Promise<ProductoMasVendido[]> {
  if (ids.length === 0) return [];
  const filas = await db.getAllAsync<{
    producto_id: string;
    nombre: string;
    unidades: number;
    total: number;
  }>(
    `SELECT vi.producto_id, p.nombre, SUM(vi.cantidad) as unidades,
            SUM(vi.cantidad * vi.precio_unitario) as total
     FROM venta_items vi
     JOIN productos p ON p.id = vi.producto_id
     WHERE vi.venta_id IN (${clausulaIn(ids)})
     GROUP BY vi.producto_id
     ORDER BY unidades DESC
     ${limite ? 'LIMIT ?' : ''}`,
    limite ? [...ids, limite] : ids
  );
  return filas.map((fila) => ({
    productoId: fila.producto_id,
    productoNombre: fila.nombre,
    unidadesVendidas: fila.unidades,
    totalVendido: fila.total,
  }));
}

/**
 * Todos los productos vendidos en el rango/filtros dados, sin límite — para
 * el detalle "ver todos" del dashboard y para detectar stock bajo (ver
 * src/db/notificaciones.ts). `obtenerResumenVentas` usa la variante interna
 * con límite 10 para su `topProductos`.
 */
export async function listarProductosVendidos(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<ProductoMasVendido[]> {
  const ids = await resolverVentaIdsFiltradas(db, rango, filtros);
  return listarProductosVendidosPorIds(db, ids);
}

/**
 * Resumen agregado de ventas activas (no anuladas) en un rango de fechas,
 * con filtros opcionales combinables. `porMetodoPago` y `topProductos` se
 * agregan en SQL (no dependen de zona horaria); `porHora` se agrega en
 * TypeScript puro porque SQLite no convierte zonas horarias (ver
 * src/core/analitica).
 */
export async function obtenerResumenVentas(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<ResumenVentasPeriodo> {
  const ids = await resolverVentaIdsFiltradas(db, rango, filtros);

  if (ids.length === 0) {
    return {
      totalVendido: 0,
      cantidadVentas: 0,
      ticketPromedio: 0,
      porMetodoPago: [],
      topProductos: [],
      porHora: [],
    };
  }

  const enLista = clausulaIn(ids);

  const totales = await db.getFirstAsync<{ total: number | null; cantidad: number }>(
    `SELECT SUM(total) as total, COUNT(*) as cantidad FROM ventas WHERE id IN (${enLista})`,
    ids
  );

  const porMetodoPagoFilas = await db.getAllAsync<{
    metodo_pago: MetodoPago;
    total: number;
    cantidad: number;
  }>(
    `SELECT metodo_pago, SUM(total) as total, COUNT(*) as cantidad
     FROM ventas WHERE id IN (${enLista})
     GROUP BY metodo_pago`,
    ids
  );

  const topProductos = await listarProductosVendidosPorIds(db, ids, 10);

  const ventasCrudas = await db.getAllAsync<{
    ts_cliente: string;
    total: number;
    promotor_id: string;
    promotor_nombre: string;
  }>(
    `SELECT v.ts_cliente, v.total, v.promotor_id, u.nombre as promotor_nombre
     FROM ventas v
     JOIN usuarios u ON u.id = v.promotor_id
     WHERE v.id IN (${enLista})`,
    ids
  );

  const totalVendido = totales?.total ?? 0;
  const cantidadVentas = totales?.cantidad ?? 0;

  return {
    totalVendido,
    cantidadVentas,
    ticketPromedio: cantidadVentas === 0 ? 0 : Math.round(totalVendido / cantidadVentas),
    porMetodoPago: porMetodoPagoFilas.map((fila) => ({
      metodoPago: fila.metodo_pago,
      total: fila.total,
      cantidadVentas: fila.cantidad,
    })),
    topProductos,
    porHora: agruparVentasPorHora(
      ventasCrudas.map((fila) => ({
        tsCliente: fila.ts_cliente,
        total: fila.total,
        promotorId: fila.promotor_id,
        promotorNombre: fila.promotor_nombre,
      }))
    ),
  };
}

export interface TotalPorPromotor {
  promotorId: string;
  promotorNombre: string;
  totalVendido: Pesos;
  cantidadVentas: number;
}

export interface TotalPorPunto {
  puntoId: string;
  puntoNombre: string;
  empresaNombre: string;
  totalVendido: Pesos;
  cantidadVentas: number;
}

export interface TotalPorCategoria {
  categoria: string;
  totalVendido: Pesos;
  unidadesVendidas: number;
}

/** Desglose de ventas activas por promotor, mismo rango/filtros que el resumen. */
export async function obtenerVentasPorPromotor(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<TotalPorPromotor[]> {
  const ids = await resolverVentaIdsFiltradas(db, rango, filtros);
  if (ids.length === 0) return [];

  const filas = await db.getAllAsync<{
    promotor_id: string;
    promotor_nombre: string;
    total: number;
    cantidad: number;
  }>(
    `SELECT v.promotor_id, u.nombre as promotor_nombre, SUM(v.total) as total, COUNT(*) as cantidad
     FROM ventas v
     JOIN usuarios u ON u.id = v.promotor_id
     WHERE v.id IN (${clausulaIn(ids)})
     GROUP BY v.promotor_id
     ORDER BY total DESC`,
    ids
  );
  return filas.map((fila) => ({
    promotorId: fila.promotor_id,
    promotorNombre: fila.promotor_nombre,
    totalVendido: fila.total,
    cantidadVentas: fila.cantidad,
  }));
}

/** Desglose de ventas activas por punto (sede), mismo rango/filtros que el resumen. */
export async function obtenerVentasPorPunto(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<TotalPorPunto[]> {
  const ids = await resolverVentaIdsFiltradas(db, rango, filtros);
  if (ids.length === 0) return [];

  const filas = await db.getAllAsync<{
    punto_id: string;
    punto_nombre: string;
    empresa_nombre: string;
    total: number;
    cantidad: number;
  }>(
    `SELECT v.punto_id, pt.nombre as punto_nombre, e.nombre as empresa_nombre,
            SUM(v.total) as total, COUNT(*) as cantidad
     FROM ventas v
     JOIN puntos pt ON pt.id = v.punto_id
     JOIN empresas e ON e.id = pt.empresa_id
     WHERE v.id IN (${clausulaIn(ids)})
     GROUP BY v.punto_id
     ORDER BY total DESC`,
    ids
  );
  return filas.map((fila) => ({
    puntoId: fila.punto_id,
    puntoNombre: fila.punto_nombre,
    empresaNombre: fila.empresa_nombre,
    totalVendido: fila.total,
    cantidadVentas: fila.cantidad,
  }));
}

/** Desglose de ventas activas por categoría de producto, mismo rango/filtros que el resumen. */
export async function obtenerVentasPorCategoria(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<TotalPorCategoria[]> {
  const ids = await resolverVentaIdsFiltradas(db, rango, filtros);
  if (ids.length === 0) return [];

  const filas = await db.getAllAsync<{ categoria: string | null; total: number; unidades: number }>(
    `SELECT p.categoria, SUM(vi.cantidad * vi.precio_unitario) as total, SUM(vi.cantidad) as unidades
     FROM venta_items vi
     JOIN productos p ON p.id = vi.producto_id
     WHERE vi.venta_id IN (${clausulaIn(ids)})
     GROUP BY p.categoria
     ORDER BY total DESC`,
    ids
  );
  return filas
    .filter((fila) => fila.categoria !== null)
    .map((fila) => ({
      categoria: fila.categoria as string,
      totalVendido: fila.total,
      unidadesVendidas: fila.unidades,
    }));
}

export interface SaldoTotalBodega {
  totalUnidades: number;
  /** null si ningún producto en bodega tiene costo capturado todavía. */
  valorEstimado: Pesos | null;
  /** Cuántos de los productos con saldo en bodega tienen costo capturado. */
  productosConCosto: number;
  /** Total de productos distintos con saldo en bodega. */
  productosTotal: number;
}

/**
 * Reutiliza `listarInventarioBodega` (ya respeta R1: saldo agregado sobre
 * movimientos) — no reimplementa el cálculo de saldos.
 *
 * `valorEstimado` solo suma los productos con costo capturado: si la mayoría
 * no lo tiene (hoy es el caso real, ver ADR 0003), la cifra puede ser una
 * fracción pequeña del valor real de la bodega. `productosConCosto` /
 * `productosTotal` existen para que la UI muestre esa cobertura y la cifra
 * no se lea como un total cuando no lo es (CLAUDE.md sección 8: nada de
 * datos ficticios en la UI).
 */
export async function obtenerSaldoTotalBodega(db: SQLiteDatabase): Promise<SaldoTotalBodega> {
  const items = await listarInventarioBodega(db);

  const totalUnidades = items.reduce((suma, item) => suma + item.saldo, 0);

  const itemsConCosto = items.filter((item) => item.producto.costo !== null);
  const valorEstimado =
    itemsConCosto.length === 0
      ? null
      : itemsConCosto.reduce((suma, item) => suma + item.saldo * (item.producto.costo ?? 0), 0);

  return {
    totalUnidades,
    valorEstimado,
    productosConCosto: itemsConCosto.length,
    productosTotal: items.length,
  };
}

export interface VentaResumida {
  id: string;
  numeroRecibo: string;
  promotorNombre: string;
  puntoNombre: string | null;
  tsCliente: string;
  metodoPago: MetodoPago;
  total: Pesos;
}

/**
 * Listado completo de transacciones que cumplen rango/filtros — para el
 * detalle expandido de cada sección del dashboard (ej. "todas las ventas en
 * Efectivo de este período"), a diferencia de `obtenerResumenVentas` que
 * solo agrega totales.
 */
export async function listarVentasFiltradas(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<VentaResumida[]> {
  const ids = await resolverVentaIdsFiltradas(db, rango, filtros);
  if (ids.length === 0) return [];

  const filas = await db.getAllAsync<{
    id: string;
    numero_recibo: string;
    promotor_nombre: string;
    punto_nombre: string | null;
    ts_cliente: string;
    metodo_pago: MetodoPago;
    total: number;
  }>(
    `SELECT v.id, v.numero_recibo, u.nombre as promotor_nombre, pt.nombre as punto_nombre,
            v.ts_cliente, v.metodo_pago, v.total
     FROM ventas v
     JOIN usuarios u ON u.id = v.promotor_id
     LEFT JOIN puntos pt ON pt.id = v.punto_id
     WHERE v.id IN (${clausulaIn(ids)})
     ORDER BY v.ts_cliente DESC`,
    ids
  );
  return filas.map((fila) => ({
    id: fila.id,
    numeroRecibo: fila.numero_recibo,
    promotorNombre: fila.promotor_nombre,
    puntoNombre: fila.punto_nombre,
    tsCliente: fila.ts_cliente,
    metodoPago: fila.metodo_pago,
    total: fila.total,
  }));
}

export interface ComparacionPeriodo {
  totalVendido: Pesos;
  cantidadVentas: number;
  /** null si el período anterior equivalente no tuvo ventas — no hay variación que calcular. */
  variacionTotalPct: number | null;
  variacionCantidadPct: number | null;
}

function calcularVariacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

/**
 * Compara el total/cantidad de ventas del rango dado contra el mismo rango
 * desplazado hacia atrás por su misma duración — ej. si `rango` son 7 días,
 * se compara contra los 7 días inmediatamente anteriores. Esto compara
 * siempre tramos de igual duración (incluye "hoy parcial" vs. "ayer a la
 * misma hora", nunca un día completo contra uno parcial).
 */
export async function compararConPeriodoAnterior(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<ComparacionPeriodo> {
  const duracionMs = new Date(rango.hasta).getTime() - new Date(rango.desde).getTime();
  const rangoAnterior: RangoFechas = {
    desde: new Date(new Date(rango.desde).getTime() - duracionMs).toISOString(),
    hasta: rango.desde,
  };

  const idsActual = await resolverVentaIdsFiltradas(db, rango, filtros);
  const idsAnterior = await resolverVentaIdsFiltradas(db, rangoAnterior, filtros);

  async function totalYCantidad(ids: string[]): Promise<{ total: number; cantidad: number }> {
    if (ids.length === 0) return { total: 0, cantidad: 0 };
    const fila = await db.getFirstAsync<{ total: number | null; cantidad: number }>(
      `SELECT SUM(total) as total, COUNT(*) as cantidad FROM ventas WHERE id IN (${clausulaIn(ids)})`,
      ids
    );
    return { total: fila?.total ?? 0, cantidad: fila?.cantidad ?? 0 };
  }

  const actual = await totalYCantidad(idsActual);
  const anterior = await totalYCantidad(idsAnterior);

  return {
    totalVendido: actual.total,
    cantidadVentas: actual.cantidad,
    variacionTotalPct: calcularVariacionPct(actual.total, anterior.total),
    variacionCantidadPct: calcularVariacionPct(actual.cantidad, anterior.cantidad),
  };
}

export interface MargenProducto {
  productoId: string;
  productoNombre: string;
  unidadesVendidas: number;
  margenTotal: Pesos;
}

export interface ResumenMargen {
  productos: MargenProducto[];
  /** Cuántos productos vendidos en el período tienen costo capturado (y por tanto entran al cálculo). */
  productosConCosto: number;
  /** Total de productos distintos vendidos en el período. */
  productosVendidosTotal: number;
}

/**
 * Margen por producto — (precioUnitario - costo) * cantidad — solo para los
 * productos que tienen `costo` capturado en el catálogo (hoy son pocos, ver
 * ADR 0003). Nunca se agrega un "margen total" que sugiera cubrir todo lo
 * vendido: se expone `productosConCosto`/`productosVendidosTotal` para que
 * la UI muestre la cobertura, mismo patrón que `obtenerSaldoTotalBodega`.
 */
export async function obtenerMargenPorProducto(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<ResumenMargen> {
  const ids = await resolverVentaIdsFiltradas(db, rango, filtros);
  if (ids.length === 0) return { productos: [], productosConCosto: 0, productosVendidosTotal: 0 };

  const filas = await db.getAllAsync<{
    producto_id: string;
    nombre: string;
    costo: number | null;
    unidades: number;
    margen: number | null;
  }>(
    `SELECT vi.producto_id, p.nombre, p.costo, SUM(vi.cantidad) as unidades,
            CASE WHEN p.costo IS NOT NULL
                 THEN SUM((vi.precio_unitario - p.costo) * vi.cantidad)
                 ELSE NULL END as margen
     FROM venta_items vi
     JOIN productos p ON p.id = vi.producto_id
     WHERE vi.venta_id IN (${clausulaIn(ids)})
     GROUP BY vi.producto_id
     ORDER BY margen DESC`,
    ids
  );

  const conCosto = filas.filter((fila) => fila.costo !== null);

  return {
    productos: conCosto.map((fila) => ({
      productoId: fila.producto_id,
      productoNombre: fila.nombre,
      unidadesVendidas: fila.unidades,
      margenTotal: fila.margen ?? 0,
    })),
    productosConCosto: conCosto.length,
    productosVendidosTotal: filas.length,
  };
}
