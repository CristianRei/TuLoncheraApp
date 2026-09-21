import type { SQLiteDatabase } from 'expo-sqlite';

import {
  calcularCrucePuntoPromotorProducto,
  calcularDispersionPromotor,
  calcularMapaCalorPuntoProducto,
  calcularMetodoPagoPorPromotor,
  calcularMetodoPagoPorPunto,
  calcularRendimientoPorPromotor,
  calcularRepetibilidadPorPunto,
  calcularVentasPorDiaSemana,
  calcularVentasPorTemporada,
  type DispersionPromotores,
  type EntidadMetodoPago,
  type HallazgoCruzado,
  type LineaVentaConContexto,
  type MapaCalorPuntoProducto,
  type RendimientoPromotor,
  type RepetibilidadPunto,
  type VentaPorDiaSemana,
  type VentaPorTemporada,
} from '@/core/analisis';
import { fechaBogota } from '@/core/analitica';
import { TEMPORADAS_2026, type Temporada } from '@/core/calendario/temporadas';

import { resolverVentaIdsFiltradas, clausulaIn, type FiltrosVentas, type RangoFechas } from './analitica';

/**
 * Trae cada línea de venta (activa, no anulada) del rango con su punto,
 * promotor y producto ya resueltos — la fecha de evento se deriva en
 * TypeScript con `fechaBogota` (no en SQL, mismo motivo que `porHora` en
 * `obtenerResumenVentas`: SQLite no convierte zonas horarias). Solo ventas
 * con `punto_id` conocido entran aquí — sin punto no hay "aparición" que
 * comparar (ver ADR 0005, `punto_id` es opcional en `ventas`).
 */
async function obtenerLineasVentaConContexto(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<LineaVentaConContexto[]> {
  const ids = await resolverVentaIdsFiltradas(db, rango, filtros);
  if (ids.length === 0) return [];

  const filas = await db.getAllAsync<{
    venta_id: string;
    ts_cliente: string;
    punto_id: string | null;
    punto_nombre: string | null;
    promotor_id: string;
    promotor_nombre: string;
    producto_id: string;
    producto_nombre: string;
    cantidad: number;
    total_linea: number;
    metodo_pago: LineaVentaConContexto['metodoPago'];
  }>(
    `SELECT v.id as venta_id, v.ts_cliente, v.punto_id, pt.nombre as punto_nombre,
            v.promotor_id, u.nombre as promotor_nombre,
            vi.producto_id, p.nombre as producto_nombre,
            vi.cantidad, vi.cantidad * vi.precio_unitario as total_linea,
            v.metodo_pago
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     JOIN usuarios u ON u.id = v.promotor_id
     JOIN productos p ON p.id = vi.producto_id
     LEFT JOIN puntos pt ON pt.id = v.punto_id
     WHERE vi.venta_id IN (${clausulaIn(ids)})`,
    ids
  );

  return filas
    .filter((fila) => fila.punto_id !== null && fila.punto_nombre !== null)
    .map((fila) => ({
      eventoFecha: fechaBogota(fila.ts_cliente),
      puntoId: fila.punto_id as string,
      puntoNombre: fila.punto_nombre as string,
      promotorId: fila.promotor_id,
      promotorNombre: fila.promotor_nombre,
      productoId: fila.producto_id,
      productoNombre: fila.producto_nombre,
      cantidad: fila.cantidad,
      totalLinea: fila.total_linea,
      metodoPago: fila.metodo_pago,
      ventaId: fila.venta_id,
    }));
}

/** Por punto: qué productos se repiten como top-vendidos evento tras evento, y su tendencia. */
export async function obtenerRepetibilidadPorPunto(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<RepetibilidadPunto[]> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularRepetibilidadPorPunto(lineas);
}

/** Por promotor: ticket promedio por evento y mix de producto destacado frente al resto. */
export async function obtenerRendimientoPorPromotor(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<RendimientoPromotor[]> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularRendimientoPorPromotor(lineas);
}

/** Hallazgos cruzados punto × promotor × producto, ordenados por magnitud de desviación. */
export async function obtenerCrucePuntoPromotorProducto(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<HallazgoCruzado[]> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularCrucePuntoPromotorProducto(lineas);
}

/** Un punto por promotor (eventos trabajados vs. ticket promedio por evento) + correlación de Pearson entre ambos. */
export async function obtenerDispersionPromotor(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<DispersionPromotores> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularDispersionPromotor(lineas);
}

/** Total vendido y apariciones por día ISO de la semana (1=lunes..7=domingo). */
export async function obtenerVentasPorDiaSemana(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<VentaPorDiaSemana[]> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularVentasPorDiaSemana(lineas);
}

/** Ventas agrupadas por temporada de negocio (`TEMPORADAS_2026`) vs. temporada normal. */
export async function obtenerVentasPorTemporada(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {},
  temporadas: Temporada[] = TEMPORADAS_2026
): Promise<VentaPorTemporada[]> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularVentasPorTemporada(lineas, temporadas);
}

/** Grilla punto×producto (unidades) acotada al top de puntos y productos más activos. */
export async function obtenerMapaCalorPuntoProducto(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<MapaCalorPuntoProducto> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularMapaCalorPuntoProducto(lineas);
}

/** Por punto: qué % de sus ventas usa cada método de pago. */
export async function obtenerMetodoPagoPorPunto(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<EntidadMetodoPago[]> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularMetodoPagoPorPunto(lineas);
}

/** Por promotor: qué % de sus ventas usa cada método de pago. */
export async function obtenerMetodoPagoPorPromotor(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<EntidadMetodoPago[]> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularMetodoPagoPorPromotor(lineas);
}
